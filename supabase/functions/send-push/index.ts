/**
 * Drain the push queue and deliver through Expo.
 *
 * The database cannot call an external API, so notifications land in
 * `push_queue` and this function empties it. Running it on a schedule rather
 * than inline means a failure is a retry, not a lost notification — and a
 * flapping Expo API cannot block someone's registration being approved.
 *
 * Deploy:
 *   supabase functions deploy send-push --no-verify-jwt
 *
 * Then schedule it (Dashboard → Database → Cron, or pg_cron):
 *   select cron.schedule('drain-push', '* * * * *', $$
 *     select net.http_post(
 *       url := 'https://<project>.supabase.co/functions/v1/send-push',
 *       headers := '{"Authorization":"Bearer <service-role-key>"}'::jsonb
 *     )$$);
 *
 * It runs with the service role, which is the only way to read other people's
 * device tokens — hence --no-verify-jwt plus the shared-secret check below,
 * rather than leaving it open.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const CHUNK = 100;

/** Give up after this many tries so one bad token cannot spin forever. */
const MAX_ATTEMPTS = 3;

interface QueueRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  attempts: number;
}

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('PUSH_FUNCTION_SECRET');
  if (secret) {
    const provided = request.headers.get('x-push-secret') ?? '';
    if (provided !== secret) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Take a bounded batch: a backlog should drain over several runs rather than
  // one request timing out and retrying the whole thing.
  const { data: pending, error } = await supabase
    .from('push_queue')
    .select('id, user_id, title, body, data, attempts')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const queue = (pending ?? []) as QueueRow[];
  if (queue.length === 0) {
    return Response.json({ sent: 0, message: 'nothing queued' });
  }

  // One person may have several devices; a notification goes to all of them.
  const userIds = [...new Set(queue.map((q) => q.user_id))];
  const { data: devices } = await supabase
    .from('device_sessions')
    .select('user_id, expo_push_token')
    .in('user_id', userIds);

  const tokensByUser = new Map<string, string[]>();
  for (const d of devices ?? []) {
    const list = tokensByUser.get(d.user_id) ?? [];
    list.push(d.expo_push_token);
    tokensByUser.set(d.user_id, list);
  }

  interface Outgoing {
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: string;
    channelId: string;
  }

  const messages: Outgoing[] = [];
  const rowForMessage: string[] = [];
  const skipped: string[] = [];

  for (const row of queue) {
    const tokens = tokensByUser.get(row.user_id) ?? [];
    if (tokens.length === 0) {
      // Registered for nothing, or unregistered since. Not a failure.
      skipped.push(row.id);
      continue;
    }
    for (const token of tokens) {
      messages.push({
        to: token,
        title: row.title,
        body: row.body ?? '',
        data: row.data ?? {},
        sound: 'default',
        channelId: 'match-updates',
      });
      rowForMessage.push(row.id);
    }
  }

  if (skipped.length) {
    await supabase.from('push_queue').update({ status: 'skipped' }).in('id', skipped);
  }

  const sentRows = new Set<string>();
  const failedRows = new Map<string, string>();
  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += CHUNK) {
    const batch = messages.slice(i, i + CHUNK);
    const ids = rowForMessage.slice(i, i + CHUNK);

    try {
      const response = await fetch(EXPO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        const text = await response.text();
        ids.forEach((id) => failedRows.set(id, `Expo ${response.status}: ${text.slice(0, 180)}`));
        continue;
      }

      const payload = await response.json();
      const tickets: any[] = payload.data ?? [];

      tickets.forEach((ticket, index) => {
        const rowId = ids[index];
        if (ticket?.status === 'ok') {
          sentRows.add(rowId);
          return;
        }
        const detail = ticket?.details?.error ?? ticket?.message ?? 'unknown';
        failedRows.set(rowId, String(detail));

        // A token for an uninstalled app never recovers; stop trying it.
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(batch[index].to);
        }
      });
    } catch (fetchError) {
      const detail = fetchError instanceof Error ? fetchError.message : 'network error';
      ids.forEach((id) => failedRows.set(id, detail));
    }
  }

  // A row with several devices counts as delivered if any device took it.
  for (const id of sentRows) failedRows.delete(id);

  if (sentRows.size) {
    await supabase
      .from('push_queue')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .in('id', [...sentRows]);
  }

  for (const [id, reason] of failedRows) {
    const row = queue.find((q) => q.id === id);
    const attempts = (row?.attempts ?? 0) + 1;
    await supabase
      .from('push_queue')
      .update({
        attempts,
        last_error: reason.slice(0, 400),
        // Only give up once it has genuinely been retried.
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      })
      .eq('id', id);
  }

  if (deadTokens.length) {
    await supabase.from('device_sessions').delete().in('expo_push_token', deadTokens);
  }

  return Response.json({
    queued: queue.length,
    sent: sentRows.size,
    failed: failedRows.size,
    skipped: skipped.length,
    prunedTokens: deadTokens.length,
  });
});
