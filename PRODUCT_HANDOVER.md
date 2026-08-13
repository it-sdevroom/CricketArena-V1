# Cricket Arena — Product and Engineering Handover

## Product goal

A multi-tenant local cricket tournament platform for organizers, scorers, teams, players and fans. One Expo React Native codebase targets Android, iOS and responsive web/PWA.

## Implemented prototype modules

Home dashboard; live match center; persistent ball-by-ball scoring; fixtures; tournaments; teams; players; batting and bowling statistics; standings; fantasy player selection and credit validation; stream/highlight catalog; tournament chat; notification center; organizer console.

## Required production architecture

- Expo Router + TypeScript mobile/web client.
- Supabase/PostgreSQL backend with Row Level Security and realtime subscriptions.
- Roles: platform_admin, tournament_admin, scorer, umpire, team_manager, captain, player, fan, stream_operator.
- Authentication: phone OTP, email/password and optional Google/Apple.
- Expo push notifications; object storage for avatars, documents and highlight thumbnails.
- Streaming through YouTube Live URL initially; Mux or Cloudflare Stream for managed video.
- Offline-first scoring event queue with server sequence numbers, idempotency keys and conflict resolution.

## Core database tables

profiles, organizations, organization_members, tournaments, tournament_rules, venues, grounds, teams, team_members, players, player_documents, registrations, tournament_teams, tournament_players, groups, fixtures, match_officials, tosses, playing_xi, innings, overs, deliveries, delivery_events, partnerships, wickets, score_corrections, match_results, points_rules, standings_snapshots, batting_stats, bowling_stats, fielding_stats, fantasy_contests, fantasy_entries, fantasy_squads, fantasy_points_events, channels, channel_members, messages, announcements, notification_preferences, notifications, streams, highlights, sponsors, audit_logs, device_sessions and backups.

## Scoring rules still to implement

Legal/illegal deliveries; wides and no-balls with configurable run values; byes/leg-byes; penalty runs; all dismissal types; crossed-batter rules; free hit; retire hurt/out; substitute/concussion player; super over; DLS/manual revised target; rain delay; innings declaration/forfeit; match abandonment; undo/correction approval; scorer handover; live score reconciliation; complete scorecard and PDF export.

## Tournament formats

Round robin, double round robin, group stage, knockout, league plus playoffs, custom fixtures, T10/T20/ODI/Test/tape-ball rules, points and NRR configuration, walkover/tie/no-result handling.

## Production acceptance checklist

Unit and integration tests; RLS security tests; offline scoring and reconnection tests; duplicate-event prevention; accessibility; Android/iOS tablet layouts; Arabic/English localization and RTL; privacy policy; terms; account deletion; backups; monitoring; store icons/screenshots; staged release; load test for live-score audiences.

## Suggested next Codex instruction

“Continue Cricket Arena from PRODUCT_HANDOVER.md. Preserve the current Expo Router UI. Add Supabase schema and migrations, typed service/repository layer, authentication and RLS first. Then replace demo data module-by-module. Implement the complete cricket delivery event model and offline synchronization before adding payments or advanced streaming. Run tests and keep Android, iOS and web builds passing after every milestone.”
