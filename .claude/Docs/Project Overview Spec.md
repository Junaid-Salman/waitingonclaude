# WaitingOnClaude — Project Overview Spec

| Field | Value |
| --- | --- |
| Product | WaitingOnClaude (platform), Woordle (first game) |
| Owner | Junaid Salman |
| Source | `Browser Games Project Idea.md` (Oct 29, 2026) |
| Version | v1.0 |
| Date | 2026-10-29 |

Section 5.5 records every decision made after the source idea.

---

## 1. Executive Summary

WaitingOnClaude turns the dead minutes spent waiting on Claude or another AI agent into a quick multiplayer game with friends or coworkers: open a link, type a name, and play within seconds, with no install, no account, and no stored data. The first game, Woordle, ships two modes, a live 5-round Time Race for up to 5 players and an async 5-word Challenge sent by link, both scored on a server that never sends the answer to the browser until the round ends. A single Next.js app on Vercel and one shared PartyKit room server carry every game, so each future game adds only its rules and board, and the whole platform runs at $0 on free tiers.

### 1.1 Problem Statement

- AI agent tasks leave users idle for minutes at a time, several times a day, with nothing short and social to fill the gap.
- Existing word games are single-player or need accounts, installs, or matchmaking with strangers.
- Browser multiplayer games commonly leak answers to the client or trust client-side timers, which makes races unfair.
- Hobby projects die when hosting costs money; this one has to run at $0.

### 1.2 Project Outline

| # | Milestone | Outcome |
| --- | --- | --- |
| 1 | Woordle core | Grid, keyboard, word lists, tested scoring function, solo play |
| 2 | Platform shell and rooms | Home page, shared PartyKit room layer, create/join by link, live player list |
| 3 | Time Race | Host start, 5 synced rounds, server timing, round winners, final ranking |
| 4 | Challenge | Word and time-limit setup, encrypted link, 5 timed rounds, solver summary |
| 5 | Polish | Animations, mobile layout, host handover, reconnect, rate limiting |
| 6 | Launch | Vercel + PartyKit deploy, Playwright tests for both modes, share with friends |
| 7 | Next game | Second game on the same room layer; post-MVP, outside this release |

---

## 2. Architecture & Design

### 2.1 System Overview

```text
┌──────────────┐  HTTPS (pages, JS)   ┌────────────────────────────┐
│   Browser    │ ───────────────────▶ │ Vercel: Next.js App Router │
│  (Zustand,   │                      │  /, /woordle, /woordle/... │
│  PartySocket)│                      └────────────────────────────┘
│              │  WebSocket + HTTPS   ┌────────────────────────────┐
│              │ ◀──────────────────▶ │ PartyKit (Durable Objects) │
└──────────────┘                      │  party "main": live rooms  │
                                      │  party "challenge": solves │
                                      │  word lists, CHALLENGE_KEY │
                                      └────────────────────────────┘
```

- Vercel serves static UI only. It holds no secrets and no word lists.
- PartyKit runs one in-memory Durable Object per room. The object dies when the last connection closes, which deletes the room and every name in it.
- No database, no auth, no analytics or error tracking of any kind.
- Backup host: if PartyKit managed hosting changes terms or shuts down, the same room code deploys to a personal Cloudflare Workers Free account. The Supabase + Upstash option from the source idea is dropped because it cannot run server-side round timers.

### 2.2 Core Modules

| Module | Location | Responsibility |
| --- | --- | --- |
| Platform shell | `src/app/page.tsx`, `src/app/layout.tsx` | Home page, game list, footer disclaimer |
| Room client | `src/lib/room/`, `src/components/room/` | PartySocket connection (closed on every server error, because `partysocket` otherwise retries forever), secret player ID and name in `sessionStorage`, room creation with 409 retry, lobby store and UI |
| Room layer (server) | `party/room/`, `party/main.ts` | Player list, name suffixing, host role and handover, 5-player cap, mid-match join block, reconnect grace, rate limiting, results screen state. Rules are a pure state machine in `room.ts` (no PartyKit imports, portable to Workers); `main.ts` is the thin PartyKit adapter and `http.ts` answers room creation with CORS headers. Phase 2 ships everything except grace, rate limiting and results; a dropped player leaves at once until Phase 5 |
| Game registry | `party/games/index.ts` | Maps a game ID to its `GameDefinition` |
| Woordle rules | `party/games/woordle/` | Answer selection, guess validation, scoring, round timing, ranking |
| Solo party (Phase 1 scaffold) | `party/solo.ts`, `party/games/woordle/solo-session.ts` | One single-player game per connection, before rooms exist. Its fate is decided in Phase 3 |
| Challenge server | `party/challenge.ts` | Seals and opens challenge tokens, runs a solver session |
| Woordle UI | `src/app/woordle/`, `src/components/woordle/` | Grid, keyboard, opponent boards, timers, summaries |
| Design tokens | `src/lib/colors.ts`, `tailwind.config.ts` | `colors.ts` is the only place a colour value is written (palette, light and dark semantic tokens, class maps). `tailwind.config.ts` turns those tokens into CSS variables and colour utilities, sets the Geist font families, and defines the type scale as `<weight>-<step>` classes such as `semibold-display-sm` and `regular-text-md` (4 weights × 11 steps). Components use these tokens and classes, never raw colours, `text-<size>` or `font-<weight>`; `tests/design-tokens.test.ts` enforces it |
| Shared types | `shared/protocol.ts` | Message types used by both client and server; no word data |
| Word data | `party/data/answers.json`, `party/data/guesses.json` | Server-only word lists |

### 2.3 Technologies

| Layer | Choice | Role |
| --- | --- | --- |
| Frontend | Next.js (App Router) + TypeScript | Pages and routing, deployed to Vercel |
| Styling | Tailwind CSS 4 | Grid, keyboard, responsive layout. The JS config `tailwind.config.ts` is loaded through `@config` in `src/app/globals.css`; Tailwind 4 detects source files itself, so there is no `content` list |
| Animation | Framer Motion | Tile flip, shake, reveal |
| Client state | Zustand | Board, current guess, keyboard colours |
| Real-time | PartyKit (`partykit`, `partysocket`) | One server instance per room on Cloudflare Durable Objects |
| Crypto | Web Crypto AES-GCM (256-bit) | Challenge link tokens |
| Unit tests | Vitest | Scoring, ranking, token round-trip |
| E2E tests | Playwright | Two-player Time Race, full Challenge flow |
| Hosting | Vercel Hobby, PartyKit free managed tier | $0 at hobby scale |
| Backup hosting | Cloudflare Workers Free (own account) | Same room code, $0; requests fail rather than bill past 100,000 per day |

### 2.4 Game Plugin Contract

Every game implements one interface. The room layer owns players, host, timing primitives, and rate limits; the game owns state, rules, and what each player may see.

```ts
// party/games/types.ts
import type { PlayerId, RoomPlayer } from "../room/types";

export interface GameContext {
  now(): number;
  schedule(delayMs: number, callback: () => void): void;
  sendTo(playerId: PlayerId, message: unknown): void;
  broadcast(message: unknown): void;
}

export interface GameDefinition<State, Settings, Action> {
  id: string;
  defaultSettings: Settings;
  validateSettings(input: unknown): Settings;
  createState(players: RoomPlayer[], settings: Settings, ctx: GameContext): State;
  onAction(state: State, playerId: PlayerId, action: Action, ctx: GameContext): State;
  onPlayerLeave(state: State, playerId: PlayerId, ctx: GameContext): State;
  viewFor(state: State, playerId: PlayerId): unknown;
  isFinished(state: State): boolean;
}
```

`viewFor` is the fairness boundary: it returns only what that player may see (own letters, opponents' colours, never the answer before round end).

### 2.5 Message Protocol

```ts
// shared/protocol.ts
export type TileColour = "green" | "yellow" | "grey";

export type ClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "settings"; roundSeconds: 120 | 180 | 300 }
  | { type: "start" }
  | { type: "guess"; word: string }
  | { type: "playAgain" };

export type ServerMessage =
  | { type: "lobby"; players: { id: string; name: string; isHost: boolean; connected: boolean }[]; roundSeconds: number; youId: string }
  | { type: "roundStart"; round: number; startedAt: number; endsAt: number }
  | { type: "guessResult"; word: string; colours: TileColour[] }
  | { type: "guessRejected"; reason: "not-a-word" | "rate-limited" | "round-over" | "no-guesses-left" }
  | { type: "opponentProgress"; playerId: string; rows: TileColour[][]; solvedMs: number | null }
  | { type: "roundEnd"; round: number; answer: string; winnerId: string | null }
  | { type: "matchEnd"; ranking: { playerId: string; name: string; roundsWon: number; totalMs: number; rank: number }[] }
  | { type: "error"; code: "room-full" | "room-not-found" | "match-in-progress" | "replaced" | "invalid-name" };
```

**Secret and public ids.** `playerId` in `join` is a secret the client generates and the server never sends back. Every `id` and `playerId` field in a server message (the `lobby` entries, `opponentProgress`, `matchEnd`) is a separate public id the server assigns to each seat (8 random hex characters). `lobby.youId` tells a client which entry is its own, so the lobby message is sent per recipient. Without this split, the lobby would hand every player every other player's seat credential.

Solo subset (Phase 1, party `solo`; defined in `shared/protocol.ts` as `SoloClientMessage` and `SoloServerMessage`):

| Direction | Message | Notes |
| --- | --- | --- |
| Client → server | `{ type: "guess"; word }`, `{ type: "newGame" }` | `newGame` is honoured only after a game has ended |
| Server → client | `{ type: "soloStart"; maxGuesses }` | Sent on connect and after `newGame` |
| Server → client | `guessResult`, `guessRejected` | Same shapes as above |
| Server → client | `{ type: "soloEnd"; won; answer }` | The only message that carries the answer, sent after the final `guessResult` |

### 2.6 Scoring Function

Two passes: greens first, then yellows from the remaining letter counts. This colours repeated letters only as many times as they appear in the answer.

```ts
// party/games/woordle/score.ts
import type { TileColour } from "../../../shared/protocol";

export function scoreGuess(guess: string, answer: string): TileColour[] {
  const result: TileColour[] = Array.from({ length: 5 }, (): TileColour => "grey");
  const remaining = new Map<string, number>();

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "green";
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1);
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === "green") continue;
    const count = remaining.get(guess[i]) ?? 0;
    if (count > 0) {
      result[i] = "yellow";
      remaining.set(guess[i], count - 1);
    }
  }

  return result;
}
```

### 2.7 Challenge Token

The creator's 5 words and time limit are sealed into the link with AES-GCM using `CHALLENGE_KEY`, a secret that exists only in the PartyKit environment. The token carries a version field so a key rotation fails cleanly.

```ts
// party/challenge/token.ts
export interface ChallengePayload {
  v: 1;
  words: string[];
  limitSec: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealChallenge(payload: ChallengePayload, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload))),
  );
  const token = new Uint8Array(iv.length + ciphertext.length);
  token.set(iv, 0);
  token.set(ciphertext, iv.length);
  return toBase64Url(token);
}

export async function openChallenge(token: string, base64Key: string): Promise<ChallengePayload> {
  const bytes = fromBase64Url(token);
  const key = await importKey(base64Key);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  const payload = JSON.parse(decoder.decode(plaintext)) as ChallengePayload;
  if (payload.v !== 1 || payload.words.length !== 5) throw new Error("invalid-challenge");
  return payload;
}
```

Token size: about 60 bytes of JSON plus 12 bytes IV plus 16 bytes tag, roughly 120 base64url characters. The full link stays under 200 characters.

### 2.8 System Flows

**Time Race**

1. Host clicks "Create room". The browser generates a 4-letter code from `ABCDEFGHJKMNPQRSTUVWXYZ` (no `I`, `L`, `O`) and sends `POST /parties/main/<CODE>`. The server returns `201` or `409` if the code is taken; the client retries with a new code on `409`.
2. Host lands on `/woordle/room/<CODE>`, enters a name, and the client opens a WebSocket to room `<CODE>` with `{ type: "join", playerId, name }`. `playerId` is `crypto.randomUUID()` stored in `sessionStorage`, with the name and the room code so a refresh re-joins without a prompt. The room-creation `POST` is cross-origin from the Vercel page, and PartyKit adds no CORS headers, so the room server answers `OPTIONS` and sends `Access-Control-Allow-Origin: *` itself (no cookies or credentials are involved).
3. Friends open the link, join with a name. The server suffixes duplicates ("Ali", "Ali 2") and rejects the 6th player with `room-full`. While a match runs, the server rejects any new `playerId` with `match-in-progress`; that player retries once the room is back in the lobby.
4. Host picks 2, 3, or 5 minutes per round (default 3) and sends `start`. Start is enabled with 1 or more players, so solo practice works.
5. For each of 5 rounds, the server picks an unused answer, stamps `startedAt`, broadcasts `roundStart`, and schedules the round end at `startedAt + roundSeconds`.
6. Each `guess` hits the server: rate limit check, word-list check, `scoreGuess`, reply with `guessResult` to the sender and `opponentProgress` (colours only) to everyone. The first solve wins the round; every solve records `serverNow - startedAt`.
7. The round ends at the time limit, or earlier as soon as every seated player has solved or used all 6 guesses. A seated player inside the reconnect grace window counts as still playing. The server broadcasts `roundEnd` with the answer, then waits 5 seconds before the next round.
8. After round 5, the server broadcasts `matchEnd`: rank by rounds won, ties broken by cumulative time, an unsolved round counts as the full time limit. The host can send `playAgain` to return everyone to the lobby.

**Challenge**

1. Creator opens `/woordle/challenge/new`, enters 5 words and picks a per-round limit of 1, 2, 3, or 5 minutes.
2. The client sends `POST /parties/challenge/seal` with `{ words, limitSec }`. The server checks each word against the guess list, rejects duplicates, seals the token, and returns it.
3. The client shows `/woordle/challenge/<token>` with a copy button.
4. The solver opens the link. The client opens a WebSocket to party `challenge`, room `<random session ID>`, and sends `{ type: "begin", token }`.
5. The server opens the token, runs 5 timed rounds with server timestamps, and reveals each word at the end of its round.
6. The solver sees a summary of words solved and time taken. Nothing is stored or reported to the creator.

### 2.9 Privacy and Fairness Rules

- Names exist only in the browser tab and in the room's memory.
- Answers and word lists exist only in `party/`. The `src/` tree never imports from `party/data/`.
- The server stamps every round start and every solve; the client timer is display only.
- The server caps each player at 2 guesses per second and each connection at 30 messages per 10 seconds.
- Seat lifecycle: a seat exists from join until its player leaves or its reconnect grace expires. Seated players who drop keep their seat for 60 seconds and rejoin with the same `playerId`, in the lobby or mid-match. No new seat opens while a match runs.

---

## 3. Setup & Prerequisites

### 3.1 Accounts and Tools

- [ ] Node.js 22 LTS or later: `node --version`
- [ ] npm 10 or later: `npm --version`
- [ ] Git: `git --version`
- [ ] GitHub account with an empty repository named `waitingonclaude`
- [ ] Vercel account on the Hobby plan, linked to GitHub
- [ ] PartyKit account (sign in with GitHub on first `npx partykit login`)
- [ ] OpenSSL for key generation: `openssl version`

### 3.2 Project Bootstrap

- [ ] Create the Next.js app:

```bash
npx create-next-app@latest waitingonclaude --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd waitingonclaude
```

- [ ] Install runtime and dev dependencies:

```bash
npm install framer-motion zustand partysocket
npm install --save-dev partykit vitest @playwright/test concurrently
npx playwright install --with-deps chromium
```

- [ ] Create the server folders:

```bash
mkdir -p party/room party/games/woordle party/challenge party/data shared
```

- [ ] Create `partykit.json` in the repo root:

```json
{
  "$schema": "https://www.partykit.io/schema.json",
  "name": "waitingonclaude",
  "main": "party/main.ts",
  "parties": {
    "challenge": "party/challenge.ts",
    "solo": "party/solo.ts"
  }
}
```

`partykit.e2e.json` is a test-only config that maps `solo` to `party/e2e/solo-fixed.ts` (every answer is `crane`). Playwright starts PartyKit with it; `partykit deploy` never reads it.

- [ ] Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently -n web,party \"next dev\" \"partykit dev\"",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "party:deploy": "partykit deploy"
  }
}
```

### 3.3 Word Lists

- [ ] Run `node scripts/build-wordlists.mjs --download --report .claude/Plans/phase-1-answer-review.md`. It downloads SCOWL 2020.12.07, the LDNOOBW English list (CC BY 4.0, the profanity blocklist) and the FrequencyWords English 50k list (CC BY-SA 4.0, a commonness filter) and writes both lists. Answers come from SCOWL `english-words` + `american-words` up to size 35; guesses from those plus `british-words` + `canadian-words` up to size 70.
- [ ] The script writes `party/data/answers.json` (1,374 words) and `party/data/guesses.json` (6,483 words, containing every answer). Both are JSON arrays of lowercase strings. Raw SCOWL size 35 holds 3,462 five-letter words, mostly plurals and past tenses, so answers drop words ending in a single `s` (`[^s]s$`, keeping `-ss` words such as `class`) or in `ed`, drop exact blocklist matches (8 words), and drop words outside the 20,000 most frequent English words in the FrequencyWords OpenSubtitles list (629 words), so players are not asked for obscure words. `scripts/answers-exclude.txt` (informal non-words such as `gonna`, and sensitive words such as `lynch`) and `scripts/answers-include.txt` are overrides. The script fails if an answer is missing from the guesses, a list has duplicates, or the answer count leaves 1,200–2,300.
- [ ] Record the dictionary and blocklist licences in `party/data/LICENSES.md`.
- [ ] Block client imports of word data. Replace `eslint.config.mjs` with:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["**/party/**"] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", ".partykit/**", "next-env.d.ts"]),
]);
```

### 3.4 Secrets and Environment

- [ ] Generate the challenge key (32 random bytes, base64):

```bash
openssl rand -base64 32
```

- [ ] Create `.env` in the repo root for local PartyKit (git-ignored):

```bash
CHALLENGE_KEY=<paste the base64 key>
```

- [ ] Create `.env.local` for Next.js:

```bash
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
```

- [ ] Confirm both files are ignored:

```bash
printf ".env\n.env.local\n" >> .gitignore
git check-ignore .env .env.local
```

### 3.5 Local Run

- [ ] Start both servers: `npm run dev`
- [ ] Open `http://localhost:3000` and confirm the home page lists Woordle.
- [ ] Confirm the room server answers: the first call returns `201`, a repeat while the room is alive returns `409`, and a code that is not four letters from `ABCDEFGHJKMNPQRSTUVWXYZ` returns `400`. Every response carries `Access-Control-Allow-Origin`.

```bash
curl -i -X POST http://localhost:1999/parties/main/TEST
curl -i -X POST http://localhost:1999/parties/main/TEST
curl -i -X OPTIONS -H "Origin: http://localhost:3000" http://localhost:1999/parties/main/TEST
```

- [ ] Run unit tests: `npm test`
- [ ] Run end-to-end tests: `npm run test:e2e`. It starts its own PartyKit and Next.js servers on ports 1999 and 3000 and fails if they are busy, so stop `npm run dev` first.
- [ ] After `npm run build`, run `npm run check:bundle`. It fails if either word list appears in `.next/static`. It samples the first, middle and last run of three consecutive entries, so it catches a list shipped as data, not an arbitrary three-word fragment.

### 3.6 Deploy

- [ ] Log in and push the key to PartyKit:

```bash
npx partykit login
npx partykit env add CHALLENGE_KEY
npm run party:deploy
```

- [ ] Note the deployed host (format `waitingonclaude.<partykit-username>.partykit.dev`).
- [ ] Import the GitHub repo in Vercel and set `NEXT_PUBLIC_PARTYKIT_HOST` to that host for Production and Preview.
- [ ] Set the Vercel project name to `waitingonclaude` to claim `waitingonclaude.vercel.app`; if taken, use `waitingonclaude-game`.
- [ ] Open the production URL in two browsers and play one full Time Race and one Challenge.

---

## 4. Core Workflows

### 4.1 Host a Time Race

1. Open the home page, choose Woordle, click "Create room".
2. Enter a name. You become host.
3. Copy the room link (`/woordle/room/ABCD`) and send it.
4. Pick 2, 3, or 5 minutes per round; wait for players to appear in the live list.
5. Click "Start". It works with 1 or more players, so you can practise solo.
6. Play 5 rounds. Review the final ranking; click "Play again" to return to the lobby with the same players. Anyone turned away mid-match can now join.

### 4.2 Join a Time Race

1. Open the shared link, enter a name, click "Join".
2. Wait in the lobby until the host starts. If a match is already running, the page shows "Match in progress" with a "Try again" button; join once the match ends.
3. Type guesses on the keyboard; opponents' rows show colours only, plus a "Solved" badge and solve time.
4. If your tab refreshes or the connection drops, reopen the same tab within 60 seconds to get your seat and board back.

### 4.3 Create and Send a Challenge

1. Open `/woordle/challenge/new`.
2. Enter 5 words. Each word turns red if it is not in the guess list or repeats another entry.
3. Pick the per-round time limit.
4. Click "Create link", copy the link, send it. The link never shows the words.

### 4.4 Solve a Challenge

1. Open the link. Click "Start" to begin round 1.
2. Solve each word within the limit. The word reveals when the round ends.
3. Read the summary: words solved and total time. The link stays playable any number of times.

### 4.5 Add a New Game

1. Create `party/games/<game-id>/` implementing `GameDefinition` (Section 2.4).
2. Register it in `party/games/index.ts`.
3. Add the board UI under `src/app/<game-id>/room/[code]/page.tsx`.
4. Add a card for it on the home page.
5. Add Vitest tests for its rules and one Playwright two-player test.
6. Touch nothing in `party/room/`; if a change there looks necessary, the room layer contract needs a review first.

### 4.6 Release

1. `npm run lint && npm test && npm run test:e2e`
2. `npm run party:deploy`
3. Push to `main`; Vercel deploys the frontend.
4. Smoke test: one 2-player Time Race round and one Challenge link on production.

---

## 5. Common Pitfalls & Edge Cases

### 5.1 Scoring and Words

| Case | Rule |
| --- | --- |
| Guess `SPEED`, answer `ABIDE` | One `E` yellow, the other grey; `D` yellow |
| Guess `EERIE`, answer `THERE` | Greens first, then yellows only up to the remaining count |
| Guess not in the guess list | Reject with `not-a-word`; no guess is consumed |
| Mixed case or whitespace | Server trims and lowercases before every check |
| Challenge word repeated | Reject at seal time |
| Answer list word missing from guess list | Build script fails; every answer must be a valid guess |

### 5.2 Rooms and Players

| Case | Rule |
| --- | --- |
| 6th player joins | Close with `room-full` and show a clear message |
| Unknown room code | Close with `room-not-found`; offer "Create room" |
| Code collision on create | `409`; client retries with a new code |
| Duplicate name | Suffix " 2", " 3" in join order |
| New player opens the link mid-match | Close with `match-in-progress`; "Try again" works once the room returns to the lobby |
| Refresh mid-round | Same `playerId` from `sessionStorage` rejoins the same seat with board restored |
| Seated player disconnects | Seat held 60 seconds and counts toward the 5-player cap; on expiry the seat is removed and the player is treated as new (blocked until the match ends). A removed player stays in the final ranking, with every unsolved round counted as full time |
| Seated player in grace when everyone else is done | Round does not end early; it waits for the grace to expire or the time limit |
| Host leaves | Host passes to the earliest-joined connected player when the host's grace expires, or at once on an explicit leave |
| Same link in two tabs | `sessionStorage` is per tab, so each tab is a separate player; both count toward the cap |
| Same `playerId` joins again (a refresh whose old socket has not closed yet, or Chrome's "Duplicate tab", which copies `sessionStorage`) | The newest connection takes the seat and keeps its name, host flag and join order. The old connection receives `error: replaced` and is closed, and the page offers "Use this tab". A late close from the old connection is ignored |
| Unusable name | Names are trimmed, whitespace-collapsed, stripped of control and invisible characters, and capped at 20 characters. A name needs a letter, digit or emoji, otherwise `invalid-name`. Duplicate matching ignores case and skips suffixes already taken |
| Many sockets, few players | A room accepts at most 10 open sockets (extras get `room-full`); frames over 512 characters and anything before a valid `join` are dropped. Full rate limiting is Phase 5 |
| Everyone leaves | Durable Object evicts; room and names are gone; the code can be reused |

### 5.3 Timing

| Case | Rule |
| --- | --- |
| Client clock skew | Client renders from `endsAt` minus a server offset measured at join; the server decides |
| Guess arrives after `endsAt` | Reject with `round-over` |
| Two solves in the same millisecond | Earlier message processed wins; Durable Objects process messages serially |
| Exact tie on rounds won and total time | Shared rank |
| `setTimeout` lost on eviction | Only happens when the room is empty, so no live player is affected |

### 5.4 Security and Hosting

- Never put the answer in `roundStart`, `opponentProgress`, or any message before `roundEnd`; cover this with a Playwright check that inspects WebSocket frames.
- Rotating `CHALLENGE_KEY` breaks every existing Challenge link; the solver sees "This challenge link has expired".
- A Challenge link is replayable. A solver who has seen the answers can replay with perfect results. This is acceptable because results never go back to the creator.
- PartyKit managed hosting may change terms after Cloudflare's acquisition. If it does, deploy the same room code to a personal Cloudflare Workers Free account.
- Vercel Hobby is non-commercial only. Any ads, donations, or paid tiers require a plan change.
- Trademarks: keep logos and the tile palette visually distinct from Claude and Wordle; the footer reads "Not affiliated with Anthropic or The New York Times." Keep a rename ready in case of a complaint.

### 5.5 Decisions

| Topic | Decision |
| --- | --- |
| Real-time host | PartyKit managed now; backup is a personal Cloudflare Workers Free account (replaces Supabase + Upstash) |
| Mid-match joins | Blocked with `match-in-progress`; join once the room returns to the lobby |
| Reconnect grace | Seated players keep their seat 60 seconds after a drop, in the lobby or mid-match |
| Early round end | Round ends when every seated player has solved or used 6 guesses |
| Minimum players to start | 1 |
| Challenge time limits | 1, 2, 3, or 5 minutes per round |
| Word lists | SCOWL (answers size 35, guesses size 70), LDNOOBW blocklist |
| Second game | Post-MVP |
| Rate limits | 2 guesses per second per player; 30 messages per 10 seconds per connection |
| Gap between rounds | 5 seconds |
| Analytics | None |
| Vercel subdomain | `waitingonclaude.vercel.app`, fallback `waitingonclaude-game.vercel.app` |
| Product names | Keep WaitingOnClaude and Woordle with the footer disclaimer |
| Browser support | Latest two versions of Chrome, Edge, Firefox, Safari; iOS Safari 17+ |
