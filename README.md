# WaitingOnClaude

Browser game hub for people waiting on Claude to finish a task. First game: Woordle.

## Look and feel

Design "Game night": ink-outlined game pieces with hard offset shadows, Bricolage Grotesque for display and Figtree for text, on a warm paper background (`#F0EFE6`) with the brand green, red and yellow. Light and dark themes follow the system setting; in dark the shadows drop away. The logo is the "bounce W": a ball's path draws the W. Design sources live in `design/` (tokens, logo masters and export kit, brief) and in the Figma file.

## Styling rules

Colours are defined only in `src/lib/colors.ts` (mirroring `design/tokens.json`); fonts, the type scale and the piece shadows only in `tailwind.config.ts`. Use token classes (`bg-tile-correct`, `text-muted`, `bold-text-md`, `shadow-piece`), not raw colours, `text-sm` or `font-bold`. `npm test` fails if `src/` breaks this or a colour pair loses contrast.

## Run locally

```bash
npm install
npm run dev     # Next.js on :3000 and PartyKit on :1999
npm test        # unit tests
npm run test:e2e   # starts its own servers on 3000 and 1999: stop `npm run dev` first
npm run build && npm run check:bundle   # confirms no word data in the client bundle
```

Create `.env` with `CHALLENGE_KEY` (`openssl rand -base64 32`) and `.env.local` with
`NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999`.

## Rooms

`POST /parties/main/<CODE>` creates a room: `201` the first time, `409` while a live room holds the code, `400` for a malformed code. Codes are four letters from `ABCDEFGHJKMNPQRSTUVWXYZ`. Rooms live in memory and disappear when the last player leaves.

## Playing a match

Create a room, share the link, and the host picks a round length (2, 3 or 5 minutes) and presses Start. Five rounds are played against a server-controlled clock: the first player to solve a round wins it, a round ends early when everyone is done, and opponents' boards show colours only. After round 5 players are ranked by rounds won, then total time (an unsolved round counts as the full limit); players who tie share a rank. The host can send everyone back to the lobby with Play again.

## Challenges

Open `/woordle/challenge/new`, enter 5 words and pick a time per word (1, 2, 3 or 5 minutes). `POST /parties/challenge/seal` checks the words against the guess list, rejects duplicates, and returns a token: the words and limit sealed with AES-GCM under `CHALLENGE_KEY`. The link is `/woordle/challenge/<token>`; it never shows the words, and the browser receives each word only when its round ends. `POST /parties/challenge/check` answers whether one word is in the guess list, so the form can mark a bad word as you leave its field. Nothing is stored. Rotating `CHALLENGE_KEY` makes every existing link say it has expired.

Locally, `CHALLENGE_KEY` comes from the git-ignored `.env` (`openssl rand -base64 32`). In production it is set with `npx partykit env add CHALLENGE_KEY`, never as `NEXT_PUBLIC_*`.

## Reconnecting and leaving

A player who refreshes or loses their connection keeps their seat for 60 seconds, in the lobby or mid-match: others see "Reconnecting…", the round waits for them, and coming back restores their board, score and host role. After 60 seconds the seat is freed (mid-match they show as "Left" and stay in the ranking). "Leave room" frees the seat at once; pressed while the connection is down, the tab still leaves and the seat frees about 60 seconds after the server notices the drop.

## Limits

Each player may send 2 guesses per second and each connection 30 messages per 10 seconds; faster guesses are answered "Slow down". The Challenge link endpoints are limited per IP address (60 word checks per 10 seconds, 20 links per minute; IPv6 per /64), held in memory for at most two windows and never logged.

## Licences

Word data and font licences are listed in [`LICENSES.md`](LICENSES.md).
