# Cricket Arena

Cross-platform cricket tournament management app for Android, iPhone and web.

## Ready modules

- Tournament dashboard with live match summary and standings
- Match center for live and upcoming fixtures
- Ball-by-ball scorer with local persistence, extras, wickets, undo and reset
- Tournament, team and organizer management screens
- Batting, bowling and points-table statistics
- Fantasy team selection with credit budget validation
- Streams, highlights, tournament chat and notifications

## Run on a phone

1. Install Node.js LTS and Expo Go.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm start`.
5. Scan the Expo QR code with Expo Go.

## Run on web

```bash
npm run web
```

## Build web files for hosting

```bash
npm run typecheck
npm run build:web
```

The exported web app is written to `dist`.

## Production notes

This version is a complete local prototype. It is ready for demo use with local device persistence. For a full public production launch, connect authentication, database, push notifications, video streaming, object storage and live scoring APIs as described in `PRODUCT_HANDOVER.md`.
