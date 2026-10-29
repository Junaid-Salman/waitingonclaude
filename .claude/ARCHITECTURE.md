# ARCHITECTURE — read this first

Orientation for Claude sessions. Goal: find the right file in one hop and avoid reading expensive ones. Facts here were checked against the code on 2026-10-29. If code and this file disagree, the code wins: fix this file in the same change.

Rules and workflow live in `CLAUDE.md` (auto-loaded). Behaviour, protocol and decisions live in `.claude/Docs/Project Overview Spec.md` (the Spec). This file is the map between them.

## 1. What this is

**WaitingOnClaude**: browser game hub for people waiting on Claude. First game **Woordle** (Wordle clone): solo play, live multiplayer **Time Race** (5 rounds, up to 5 players), and encrypted-link **Challenge**. No accounts, no database, no analytics. Free tiers only.

Stack: Next.js 16.4.3 (App Router, `cacheComponents` on) + React 19.3 + TypeScript strict, Tailwind 4.3 (JS config), Zustand 5, PartyKit 0.0.115 (`partysocket` client), Vitest 5, Playwright 1.64, Node 22.

### Phase status

| Phase | What | State |
| --- | --- | --- |
| 0 Bootstrap | Scaffold, tooling, guardrails | Done, committed |
| 1 Woordle core | Solo game, word lists, scoring, design tokens | Done, committed |
| 2 Rooms | Create/join by link, lobby, host, cap, takeover | Done, committed |
| 3 Time Race | Rounds, timers, ranking, `start`/`playAgain` | **Next** (plan not yet written) |
| 4 Challenge | AES-GCM link, solver session | Not started (`party/challenge.ts` is a stub) |
| 5 Polish | 60 s reconnect grace, rate limits, animations, mobile | Not started |
| 6 Launch | Deploy, playtest | Not started |

Master plan: `.claude/Plans/00-phased-plan.md`. One plan per phase in `.claude/Plans/`, one review in `.claude/Reviews/`.

## 2. Which file for which task (token saver)

| If the task is about | Read | Skip |
| --- | --- | --- |
| Scoring, guesses, solo rules | `party/games/woordle/{score,board,solo-session}.ts`, `tests/{score,board}.test.ts` | word JSON |
| Room rules (join, cap, host, takeover) | `party/room/room.ts` (198 lines, all rules), `tests/room.test.ts` | `party/main.ts` (thin adapter) |
| Message shapes | `shared/protocol.ts` (52 lines), `shared/room-code.ts` | Spec 2.5 unless changing it |
| Room HTTP / CORS | `party/room/http.ts`, `tests/http.test.ts` | |
| Lobby / room UI | `src/components/room/RoomPage.tsx` (state machine), then the component you need | |
| Solo UI | `src/components/woordle/SoloGame.tsx`, `src/lib/woordle/store.ts` | |
| Colours, fonts, type scale | `src/lib/colors.ts`, `tailwind.config.ts` | `globals.css` (8 lines, no values) |
| Word lists | `scripts/build-wordlists.mjs`, `party/data/LICENSES.md` | `party/data/*.json` |
| E2E | `playwright.config.ts`, the one spec you touch | |
| Challenge token (Phase 4) | Spec 2.7 (has the reference code), `party/challenge.ts` | |
| Why a decision was made | The phase plan's "Gaps" and "Deviations" tables, then Spec 5.5 | |

## 3. Repo map

```text
CLAUDE.md                  rules, workflow (local only, git-ignored)
.claude/
  ARCHITECTURE.md          this file
  Docs/                    Spec, Proposal, original idea (tracked; idea file is read-only)
  Plans/  Reviews/         per-phase plans and reviews (local only, git-ignored)
shared/                    code used by BOTH sides. No secrets, no word data
  protocol.ts              all message types + constants (MAX_PLAYERS, ROUND_SECONDS_OPTIONS...)
  room-code.ts             4-letter code alphabet, isRoomCode, generateRoomCode
party/                     SERVER. Never imported by src/ (ESLint-enforced)
  main.ts                  PartyKit adapter for rooms: createRoomServer({testHooks?})
  solo.ts                  Phase 1 scaffold: one solo game per connection (fate decided in Phase 3)
  challenge.ts             stub (Phase 4)
  room/                    room.ts (pure rules), names.ts, http.ts (201/409/400 + CORS), apply.ts, types.ts
  games/                   types.ts (GameDefinition, Spec 2.4), index.ts (empty registry), woordle/*
  data/                    answers.json (1,374), guesses.json (6,483), LICENSES.md
  e2e/                     test-only server entries (fixed answer, __setPhase hook)
src/                       FRONTEND (browser)
  app/                     /, /woordle, /woordle/solo, /woordle/room/[code], layout, globals.css
  components/{woordle,room}/   UI
  lib/colors.ts            ONLY place a colour value is written
  lib/party-host.ts        PartyKit host + http/https choice
  lib/room/                session.ts, create-room.ts, store.ts, room-client.ts
  lib/woordle/             store.ts, solo-client.ts, keyboard.ts
tailwind.config.ts         fonts, type scale classes, colour tokens -> CSS variables
scripts/                   build-wordlists.mjs, check-bundle.mjs, answers-exclude.txt
tests/                     Vitest (23 files, 226 tests), imports server and client code directly
e2e/                       Playwright (3 specs, 20 tests)
partykit.json              production parties: main, challenge, solo
partykit.e2e.json          test parties: main -> party/e2e/main-test.ts, solo -> fixed answer
```

## 4. Runtime architecture

```text
Browser (Zustand, PartySocket) ──HTTPS──▶ Vercel: Next.js static UI (no secrets, no word data)
        │
        └──WebSocket + POST──▶ PartyKit (Durable Objects, in memory, die with last connection)
                                 party "main"      one object per room code: rooms/lobby
                                 party "solo"      one object per random id: a solo game per connection
                                 party "challenge" stub
```

Server is authoritative. The client sends intents and renders what the server returns. It never computes tile colours, never sees the answer before the game ends, and never imports `party/`.

### Flows

- **Create room:** browser `POST {host}/parties/main/<CODE>` (cross-origin, so `http.ts` sends CORS headers). 201 = ours, 409 = taken (client retries a new code, max 5), 400 = bad code. Then navigate to `/woordle/room/<CODE>`.
- **Join:** name form -> `connectRoom()` opens a socket, sends `join {playerId, name}` on every open -> server replies `lobby` (one message per seat, each with that player's `youId`) -> `useRoom` store -> `Lobby` UI. Any `error` message makes the client close the socket.
- **Solo guess:** `guess {word}` -> server trims/lowercases, checks the guess list, `scoreGuess`, replies `guessResult` (+ `soloEnd {won, answer}` on the last one).
- **Not built yet:** `start`, `roundStart`, in-room `guess`, `roundEnd`, `matchEnd`, `playAgain` (Phase 3).

## 5. Protocol cheat sheet (truth: `shared/protocol.ts`)

| Direction | Room (party `main`) | Solo (party `solo`) |
| --- | --- | --- |
| Client -> server | `join {playerId, name}`, `settings {roundSeconds: 120/180/300}` | `guess {word}`, `newGame` |
| Server -> client | `lobby {players[{id,name,isHost,connected}], roundSeconds, youId}`, `error {code}` | `soloStart`, `guessResult`, `guessRejected {reason}`, `soloEnd {won, answer}` |

Error codes: `room-full`, `room-not-found`, `match-in-progress`, `replaced`, `invalid-name`. Change `shared/protocol.ts` first, then server, then client.

**Two ids per player.** `playerId` is a secret kept in the tab's `sessionStorage` and never sent to anyone else. The server gives each seat a separate public `id` used in every broadcast. Mixing them up would let players take each other's seats; a test scans every outbound message for it.

## 6. Room rules (all in `party/room/room.ts`, pure, no PartyKit imports)

- First seat is host; host passes to the lowest join order when the host leaves.
- 5 seats max; 6th gets `room-full`. 10 open sockets max per room. Frames over 512 chars and anything before a valid `join` are dropped.
- Names: trimmed, whitespace collapsed, control chars stripped, 20 chars, needs a letter/digit/emoji; duplicates get " 2", " 3" (case-insensitive).
- Same `playerId` joining again takes the seat (newest wins); old connection gets `replaced`.
- Phase `lobby | match`: only the e2e test hook can set `match` until Phase 3. Unknown players in `match` get `match-in-progress`.
- `settings`: host only, lobby only, 120/180/300 only.
- **Interim until Phase 5:** a dropped player is removed immediately (no 60 s hold), so a refresh can lose the seat.
- The room "exists" only after `create()` (the POST). Sockets to an uncreated room get `room-not-found`.

## 7. Design tokens (enforced by `tests/design-tokens.test.ts`)

- Colours: only in `src/lib/colors.ts` (`palette`, light/dark `themes`, class maps). `tailwind.config.ts` turns them into CSS variables and utilities (`bg-tile-correct`, `text-muted`).
- Type: only the generated classes `<regular|medium|semibold|bold>-<display-2xl..xs|text-xl..xs>` (for example `semibold-display-sm`, `regular-text-md`). Fonts are Geist via `font-sans` (set on `<body>`).
- Never write hex values, `text-white`, `text-sm`, or `font-bold` in `src/`. A new colour is a new token with both a light and a dark value.
- Tailwind 4 loads the JS config through `@config` in `src/app/globals.css`; there is no `content` list.
- Tailwind scans only `src/` (`@import "tailwindcss" source("../")`). Without that it also scanned tests and `.claude/` docs, which quote banned classes on purpose, and emitted dead utilities like `.text-white`. If a class you added renders unstyled, check that it appears in a file under `src/`.

## 8. Testing and commands

```bash
npm run dev            # Next :3000 + PartyKit :1999
npm run lint           # eslint .
npm test               # Vitest, 226 tests, ~1 s
npm run test:e2e       # Playwright; starts its own servers, STOP npm run dev FIRST
npm run build && npm run check:bundle   # word data must not reach .next/static
```

- e2e runs `partykit dev -c partykit.e2e.json`: solo answers are always `crane`; the room server accepts `{type:"__setPhase"}` so tests can put a room into the match phase. Players are separate browser contexts (separate `sessionStorage`).
- `check:bundle` samples the first/middle/last 3-word runs of each list; it catches a shipped list, not a stray fragment.
- Before declaring work done: lint + `npm test`; add `test:e2e` for room/protocol/Challenge changes; add `build && check:bundle` when touching `src/` imports or word data.

## 9. Gotchas that cost time

| Gotcha | What to do |
| --- | --- |
| `partysocket` reconnects forever after a server-side close | Client must call `socket.close()` on every server `error` |
| PartyKit adds no CORS headers | `http.ts` answers `OPTIONS` and adds headers itself |
| `next dev` (Strict Mode) opens 2 sockets in the first second | Don't assert an exact socket count in dev; assert it stops growing |
| `cacheComponents`: dynamic route + `useParams` | `page.tsx` wraps a client component in `<Suspense>`; read `sessionStorage`/`crypto.randomUUID()` only in effects or after the `useSyncExternalStore` client flag |
| ESLint `react-hooks/set-state-in-effect` | Derive state in render; keep connections in refs |
| `Party.Request` is Cloudflare's type, not DOM `Request` | `handleRoomRequest` takes `{ method: string }` |
| Orphaned `workerd` on :1999 / `next-server` on :3000 after a test run | Find the PID with `ss -ltnp` and `kill -9` it. Do not `pkill -f` a pattern that appears in your own command line |
| e2e fails instantly with "port already used" | Something still holds 3000/1999 (see above) |
| CSS `uppercase` doesn't change DOM text | Match case-insensitively in tests |
| Client ignores keys while a guess is in flight | Playwright helpers wait for the server's row before the next word |
| `next dev` rewrites `AGENTS.md` | It tells you to read `node_modules/next/dist/docs/` before Next code; this is Next 16, APIs differ from older versions |
| Vitest config is `.mts` | Plain `.ts` triggers a CJS-loader warning |

## 10. Do not read (token cost, chars / 4 ≈ tokens)

| File | ≈ Tokens | Use instead |
| --- | --- | --- |
| `package-lock.json` | 83,000 | `package.json` |
| `party/data/guesses.json` | 13,000 | `tests/words.test.ts`, `LICENSES.md` |
| `party/data/answers.json` | 2,700 | same |
| `.claude/Plans/phase-1-answer-review.md` | 3,300 | only when editing the list |
| `.claude/Docs/Project Overview Spec.md` | 7,600 | grep the section: 2.4 contract, 2.5 protocol, 2.6 scoring, 2.7 token, 5.x edge cases |
| `.claude/Plans/phase-1-woordle-core.md` | 7,900 | its "Gaps" table |
| `.claude/Plans/phase-2-rooms.md` | 6,200 | its "Gaps" table |
| `.claude/Docs/Browser Games Project Idea.md` | 2,500 | read-only, superseded by the Spec |
| `node_modules/`, `.next/`, `.partykit/`, `test-results/` | - | generated |

Search with grep for a heading or symbol instead of opening a large file. Use `offset`/`limit` for anything over ~200 lines.

## 11. Workflow in one paragraph

Per phase: write `.claude/Plans/phase-<n>-<name>.md` (goal, tasks, tests, acceptance, risks), get approval, build protocol -> server -> client, verify (lint, unit, e2e, build, bundle check), save a review to `.claude/Reviews/`, update the Spec and this file, get sign-off. Commit and push only when asked; confirm before every push; no Claude attribution anywhere. Plans, reviews and `CLAUDE.md` stay local.

## 12. Keeping this file honest

Update it in the same change when you add or move a top-level folder, a party, a message type, a design-token rule, a test command, or finish a phase (section 1 table). Update test counts only when they are cheap to verify (`npm test`, `npm run test:e2e`).
