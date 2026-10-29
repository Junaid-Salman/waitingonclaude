# WaitingOnClaude

Browser game hub for people waiting on Claude to finish a task. First game: Woordle.

## Styling rules

Colours are defined only in `src/lib/colors.ts`; fonts and the type scale only in `tailwind.config.ts`. Use token classes (`bg-tile-correct`, `text-muted`, `semibold-text-md`), not raw colours, `text-sm` or `font-bold`. `npm test` fails if `src/` breaks this.

## Run locally

```bash
npm install
npm run dev     # Next.js on :3000 and PartyKit on :1999
npm test        # unit tests
npm run test:e2e   # starts its own servers on 3000 and 1999: stop `npm run dev` first
npm run build && npm run check:bundle   # confirms no word data in the client bundle
```

Create `.env` with `CHALLENGE_KEY` (`openssl rand -base64 32`) and `.env.local` with
`NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999`. The full README arrives in Phase 6.

## Rooms

`POST /parties/main/<CODE>` creates a room: `201` the first time, `409` while a live room holds the code, `400` for a malformed code. Codes are four letters from `ABCDEFGHJKMNPQRSTUVWXYZ`. Rooms live in memory and disappear when the last player leaves.

## Playing a match

Create a room, share the link, and the host picks a round length (2, 3 or 5 minutes) and presses Start. Five rounds are played against a server-controlled clock: the first player to solve a round wins it, a round ends early when everyone is done, and opponents' boards show colours only. After round 5 players are ranked by rounds won, then total time (an unsolved round counts as the full limit); players who tie share a rank. The host can send everyone back to the lobby with Play again.
