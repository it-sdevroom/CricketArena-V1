/**
 * Offline scoring queue.
 *
 * Grounds have bad signal, and a scorer cannot be asked to stop when the bars
 * drop. Every ball is written to local storage first and pushed to Supabase in
 * the background; the UI reads from local state, so scoring never blocks on the
 * network.
 *
 * Safety comes from the idempotency key generated when the ball is recorded.
 * The `deliveries` table has a unique index on (innings_id, idempotency_key),
 * so replaying a queue after a crash, a retry, or the same ball being sent
 * twice from two sockets is a no-op rather than a duplicate.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/lib/supabase';

import type { DeliveryInsert } from './mappers';

const QUEUE_KEY = 'cricket-arena:pending-deliveries:v1';

export interface QueuedDelivery {
  payload: DeliveryInsert;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

type Listener = (pending: QueuedDelivery[]) => void;

let cache: QueuedDelivery[] | null = null;
let flushing = false;
const listeners = new Set<Listener>();

async function load(): Promise<QueuedDelivery[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    cache = raw ? (JSON.parse(raw) as QueuedDelivery[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(next: QueuedDelivery[]): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener(next);
}

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  void load().then((items) => listener(items));
  return () => listeners.delete(listener);
}

export async function pendingCount(): Promise<number> {
  return (await load()).length;
}

/** Add a ball to the queue and try to send it immediately. */
export async function enqueueDelivery(payload: DeliveryInsert): Promise<void> {
  const queue = await load();
  // Guard against a double tap producing the same ball twice.
  if (queue.some((item) => item.payload.idempotency_key === payload.idempotency_key)) return;

  await persist([...queue, { payload, queuedAt: new Date().toISOString(), attempts: 0 }]);
  void flushQueue();
}

/**
 * Push everything pending, oldest first.
 *
 * Order matters: the server assigns each ball its sequence number on insert, so
 * sending out of order would scramble the innings. A failure therefore stops
 * the run rather than skipping ahead.
 */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  if (flushing) return { sent: 0, remaining: (await load()).length };
  flushing = true;

  try {
    let queue = await load();
    let sent = 0;

    while (queue.length > 0) {
      const [head, ...rest] = queue;
      const { error } = await supabase.rpc('record_delivery', { payload: head.payload });

      if (error) {
        const permanent = error.code === '42501' || error.code === '23503' || error.code === '23514';
        if (permanent) {
          // A ball the server will never accept — drop it rather than wedging
          // the queue, but keep the reason for the scorer to see.
          console.warn('Dropping unacceptable delivery', error.message, head.payload);
          queue = rest;
          await persist(queue);
          continue;
        }

        // Transient: leave it at the head and try again on the next flush.
        queue = [{ ...head, attempts: head.attempts + 1, lastError: error.message }, ...rest];
        await persist(queue);
        break;
      }

      sent += 1;
      queue = rest;
      await persist(queue);
    }

    return { sent, remaining: queue.length };
  } finally {
    flushing = false;
  }
}

/** Remove a queued ball, used when the scorer undoes before it syncs. */
export async function dequeueByKey(idempotencyKey: string): Promise<boolean> {
  const queue = await load();
  const next = queue.filter((item) => item.payload.idempotency_key !== idempotencyKey);
  if (next.length === queue.length) return false;
  await persist(next);
  return true;
}

export async function clearQueue(): Promise<void> {
  await persist([]);
}

/**
 * A collision-resistant key without pulling in a uuid dependency.
 * `crypto.randomUUID` exists on web and on Hermes with the Expo polyfill; the
 * fallback is only for older runtimes.
 */
export function newIdempotencyKey(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}
