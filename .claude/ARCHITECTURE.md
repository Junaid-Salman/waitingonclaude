# ARCHITECTURE — read this first

Orientation for Claude sessions. Goal: find the right file in one hop and avoid reading expensive ones. Facts here were checked against the code on 2026-10-29. If code and this file disagree, the code wins: fix this file in the same change.

Rules and workflow live in `CLAUDE.md` (auto-loaded). Behaviour, protocol and decisions live in `.claude/Docs/Project Overview Spec.md` (the Spec). This file is the map between them.

## 1. What this is

**WaitingOnClaude**: browser game hub for people waiting on Claude. First game **Woordle** (Wordle clone): solo play, live multiplayer **Time Race** (5 rounds, up to 5 players), and encrypted-link **Challenge**. No accounts, no database, no analytics. Free tiers only.

Stack: Next.js 16.4.3 (App Router, `cacheComponents` on) + React 19.3 + TypeScript strict, Tailwind 4.3 (JS config), Zustand 5, PartyServer 0.5.10 on Cloudflare Workers + Durable Objects (`wrangler` 4.158, `partysocket` client), Vitest 5, Playwright 1.64, Node 22.

### Phase status

| Phase | What | State |
| --- | --- | --- |
| 0 Bootstrap | Scaffold, tooling, guardrails | Done, committed |
| 1 Woordle core | Solo game, word lists, scoring, design tokens | Done, committed |
| 2 Rooms | Create/join by link, lobby, host, cap, takeover | Done, committed |
| 3 Time Race | Rounds, timers, ranking, `start`/`playAgain`, opponent boards | Done, committed |
| 4 Challenge | AES-GCM link, solver session, creator form | Done, committed |
| 5 Polish | 60 s reconnect grace, Leave, rate limits, animations, mobile | Done, committed (`3a2553d`), awaiting sign-off |
| 6 UI design | Logo, Figma design (C · Game night), redesigned UI in both themes | Approved 2026-11-06; deferred issues in `.claude/Deffered Issues.md` |
| 7 Launch | Deploy, playtest | In progress: 7.1 done (`a42eb1e`); hosted PartyKit shut down 23 Oct 2026, so 7.7 ports the server to PartyServer on Workers before 7.2 |

Master plan: `.claude/Plans/00-phased-plan.md`. One plan per phase in `.claude/Plans/`, one review in `.claude/Reviews/`.

## 2. Which file for which task (token saver)

| If the task is about | Read | Skip |
| --- | --- | --- |
| Scoring, guesses, solo rules | `party/games/woordle/{score,board,solo-session}.ts`, `tests/{score,board}.test.ts` | word JSON |
| Match rules (rounds, timers, early end, ranking) | `party/games/woordle/game.ts`, `ranking.ts`, `tests/woordle-game.test.ts` | |
| Game contract (what a game may do) | `party/games/types.ts` (Spec 2.4 mirrors it) | |
| Room rules (join, cap, host, takeover, start, playAgain, leave, grace, timers) | `party/room/room.ts` (all rules), `tests/room.test.ts`, `tests/room-match.test.ts`, `tests/room-grace.test.ts` | `party/main.ts` (thin adapter) |
| Rate limits | `party/rate-limit.ts` (shared sliding window), `tests/rate-limit.test.ts`, `tests/room-rate-limit.test.ts` | |
| Reconnect / board restore | `viewFor` + `onPlayerReturn` in `party/games/woordle/game.ts`, `tests/woordle-snapshot.test.ts`, `matchSnapshot` in `src/lib/room/match-store.ts` | |
| Animations | `src/components/woordle/{Tile,Grid,Keyboard}.tsx`, `src/lib/motion/timing.ts`, `src/components/MotionProvider.tsx` | |
| Message shapes | `shared/protocol.ts`, `shared/room-code.ts` | Spec 2.5 unless changing it |
| Room HTTP / CORS | `party/room/http.ts`, `tests/http.test.ts` | |
| Lobby / room UI | `src/components/room/RoomPage.tsx` (picks lobby or match screen), then the component you need | |
| Match UI | `src/components/room/MatchScreen.tsx`, `src/lib/room/match-store.ts`, `src/lib/room/clock.ts` | |
| Solo UI | `src/components/woordle/SoloGame.tsx`, `src/lib/woordle/store.ts` | |
| Colours, fonts, type scale | `src/lib/colors.ts`, `tailwind.config.ts` | `globals.css` (8 lines, no values) |
| Word lists | `scripts/build-wordlists.mjs`, `party/data/LICENSES.md` | `party/data/*.json` |
| E2E | `playwright.config.ts`, the one spec you touch | |
| Challenge token and seal | `party/challenge/{token,seal}.ts`, `tests/challenge-{token,seal}.test.ts`; Spec 2.7 | |
| Challenge solver run | `party/challenge/session.ts` (pure), `party/challenge.ts` (adapter), `tests/challenge-{session,server}.test.ts` | |
| Challenge UI | `src/components/challenge/*`, `src/lib/challenge/*`; form rules are pure in `lib/challenge/form.ts` (there is no component-test tooling, so logic worth testing goes there) | |
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
  worker.ts                the Cloudflare Worker: exports the Main/Challenge/Solo Durable Object classes + routePartykitRequest
  workers-env.d.ts         pulls in @cloudflare/workers-types (coexists with the DOM lib via skipLibCheck)
  main.ts                  PartyServer adapter for rooms: createRoomServer({game?, graceMs?}), real clock, applies timer effects
  rate-limit.ts            sliding-window limiter + the Spec's LIMITS, shared by rooms, solo, Challenge and HTTP
  solo.ts                  Phase 1 scaffold: one solo game per connection (fate decided in Phase 3)
  challenge.ts             PartyServer adapter for Challenge: createChallengeServer({timeScale?, revealMs?}); onRequest -> seal/check, sockets -> session
  challenge/               token.ts (AES-GCM, result-style open), seal.ts (validation + HTTP), session.ts (pure solver run)
  http-cors.ts             CORS headers + reply helpers shared by room and challenge HTTP
  room/                    room.ts (pure rules), names.ts, http.ts (201/409/400 + CORS), apply.ts, types.ts
  games/                   types.ts (GameDefinition contract), index.ts (registry: woordle), woordle/{game,match rules,ranking,score,board,...}
  data/                    answers.json (1,374), guesses.json (6,483), LICENSES.md
  e2e/                     test-only server entries (worker.ts exports the same class names): fixed answers, injected round limits (2 min 1.2 s, 3 min 20 s, 5 min 3 s), 5 s grace, raised per-IP limits (no test branch in production code)
src/                       FRONTEND (browser)
  app/                     /, /woordle, /woordle/solo, /woordle/room/[code], /woordle/challenge/new, /woordle/challenge/[token], layout, globals.css
  app/icon.svg apple-icon.png favicon.ico opengraph-image.png manifest.ts   icons and metadata (from design/logo/kit)
  components/{woordle,room,challenge,home}/   UI; Logo.tsx + logo-paths.ts (inline SVG logo), SiteHeader.tsx (header outside rooms)
  lib/colors.ts            ONLY place a colour value is written
  lib/party-host.ts        real-time host (NEXT_PUBLIC_PARTYKIT_HOST) + http/https choice
  lib/room/                session.ts, create-room.ts, store.ts, room-client.ts, join-code.ts (home "Have a code?" box, pure)
  lib/woordle/             store.ts, solo-client.ts, keyboard.ts
  lib/challenge/           store.ts, challenge-client.ts, seal-client.ts, link.ts (isPlausibleToken), form.ts (pure form rules)
tailwind.config.ts         fonts, type scale classes, colour tokens -> CSS variables, shadow-piece tokens
design/                    tokens.json (design source of truth, mirrored by colors.ts), briefs/, logo/{masters,kit,concepts}, figma/ (plugin scripts). logo/work and kit.zip are git-ignored
scripts/                   build-wordlists.mjs, check-bundle.mjs, answers-exclude.txt
tests/                     Vitest (44 files, 732 tests), helpers in tests/helpers (fake clock, test game, challenge tokens)
e2e/                       Playwright (8 specs, 66 tests, 2 fixme for DI-1/DI-2: + resilience, mobile), shared player helpers in e2e/helpers.ts
wrangler.jsonc             production Worker `waitingonclaude`: DO bindings Main, Challenge, Solo; SQLite migration v1
wrangler.e2e.jsonc         test Worker: main -> party/e2e/worker.ts (fixed answers, 1.5 s pause, scaled limits); vars.CHALLENGE_KEY is a fixed test-only key
```

## 4. Runtime architecture

```text
Browser (Zustand, PartySocket) ──HTTPS──▶ Vercel: Next.js static UI (no secrets, no word data)
        │
        └──WebSocket + POST──▶ Cloudflare Worker + PartyServer (Durable Objects, in memory, die with last connection)
                                 party "main"      one object per room code: rooms/lobby
                                 party "solo"      one object per random id: a solo game per connection
                                 party "challenge" HTTP seal/check + one run per connection (random room id)
```

Server is authoritative. The client sends intents and renders what the server returns. It never computes tile colours, never sees the answer before the game ends, and never imports `party/`.

### Flows

- **Create room:** browser `POST {host}/parties/main/<CODE>` (cross-origin, so `http.ts` sends CORS headers). 201 = ours, 409 = taken (client retries a new code, max 5), 400 = bad code. Then navigate to `/woordle/room/<CODE>`.
- **Join:** name form -> `connectRoom()` opens a socket, sends `join {playerId, name}` on every open -> server replies `lobby` (one message per seat, each with that player's `youId`) -> `useRoom` store -> `Lobby` UI. Any `error` message makes the client close the socket.
- **Solo guess:** `guess {word}` -> server trims/lowercases, checks the guess list, `scoreGuess`, replies `guessResult` (+ `soloEnd {won, answer}` on the last one).
- **Match:** host `start` -> room sets phase `match`, sends `lobby{phase:"match"}`, then the game sends `roundStart`. Each `guess` goes through `game.parseAction`, then `onAction`: `guessResult` to the sender, `opponentProgress` (colours only) to the others. A round ends at `endsAt` (a timer the game scheduled) or as soon as every connected player is done; `roundEnd` carries the answer. After 5 s the next `roundStart`, or after round 5 `matchEnd`. Host `playAgain` returns everyone to the lobby.
- **Timers:** the game schedules *actions* (`endRound`, `nextRound`, `finish`) through `ctx.schedule`; the room delivers them as `onAction` with sender `SYSTEM`, tracks every pending timer, and cancels them when a match is abandoned. The adapter passes `Date.now`/`setTimeout`; tests pass `tests/helpers/fake-clock.ts`.
- **Create challenge:** `/woordle/challenge/new`. Each word field, on blur, calls `POST {host}/parties/challenge/check` (the word list never reaches the browser); "Create link" calls `/seal`, which re-validates and returns the token; the link is `origin + /woordle/challenge/<token>`.
- **Solve challenge:** the page renders Start without any network. Start opens a socket to party `challenge` (random room id) and sends `begin {token}`. The server opens the token (`invalid-token` / `unavailable` otherwise), runs 5 rounds through `session.ts` (round timer, 5 s reveal, auto next round), and ends with `challengeEnd`. Play again sends `begin` again. A dropped socket loses the run.
- **Client:** `room-client.ts` sends `lobby`/`error` to `useRoom` and everything else to `useMatch`; a `lobby` with `phase:"lobby"` resets the match store. The timer display uses an offset estimated at each `roundStart` (display only).

## 5. Protocol cheat sheet (truth: `shared/protocol.ts`)

| Direction | Room (party `main`) | Solo (party `solo`) |
| --- | --- | --- |
| Client -> server | `join {playerId, name}`, `settings {roundSeconds: 120/180/300}`, `start`, `guess {word}`, `playAgain`, `leave` | `guess {word}`, `newGame` |
| Server -> client | `lobby {players[{id,name,isHost,connected}], roundSeconds, youId, phase}`, `error {code}`, `roundStart {round, totalRounds, startedAt, endsAt, players}`, `guessResult {word, colours, solvedMs}`, `guessRejected`, `opponentProgress {id, rows, solvedMs}`, `roundEnd {round, answer, winnerId, results, nextAt}`, `matchEnd {ranking}`, `matchSnapshot` (to a returning player only) | `soloStart`, `guessResult`, `guessRejected {reason}`, `soloEnd {won, answer}` |

Challenge messages are listed in Spec 2.5 (`ChallengeClientMessage`, `ChallengeServerMessage`); challenge errors are `invalid-token` and `unavailable`.

Error codes: `room-full`, `room-not-found`, `match-in-progress`, `replaced`, `invalid-name`. Change `shared/protocol.ts` first, then server, then client.

**Two ids per player.** `playerId` is a secret kept in the tab's `sessionStorage` and never sent to anyone else. The server gives each seat a separate public `id` used in every broadcast. Mixing them up would let players take each other's seats; a test scans every outbound message for it.

## 6. Room rules (all in `party/room/room.ts`, pure, no PartyKit imports)

- First seat is host. Host is explicit state: it stays with a host in grace and passes, when the host's seat is removed, to the earliest-joined **connected** seat (the earliest held seat if nobody is connected).
- 5 seats max; 6th gets `room-full`. 10 open sockets max per room. Frames over 512 chars and anything before a valid `join` are dropped.
- Names: trimmed, whitespace collapsed, control chars stripped, 20 chars, needs a letter/digit/emoji; duplicates get " 2", " 3" (case-insensitive).
- Same `playerId` joining again takes the seat (newest wins); old connection gets `replaced`.
- Phase `lobby | match`. `start` (host, lobby, 1+ players) enters `match`; it lasts through the results screen until the host's `playAgain` (only valid once the game finished). New players in `match` get `match-in-progress`. If everyone leaves mid-match the room resets to the lobby and cancels its timers.
- Anything the room does not own (`join`, `settings`, `start`, `playAgain`) is handed to the game's `parseAction`; `null` means dropped.
- `settings`: host only, lobby only, 120/180/300 only.
- **Reconnect grace:** a dropped seated player keeps the seat for 60 s (`graceMs`), in the lobby or mid-match. The seat shows `connected:false` ("Reconnecting…"), still counts toward the cap, gets no messages, and the game is not told, so a round waits for them. The same `playerId` back in time gets `lobby` then `matchSnapshot`. On expiry the seat is removed and the game gets `onPlayerLeave`; mid-match the player is then new (`match-in-progress`). `leave` removes the seat at once. The room resets to the lobby only when the last **seat** is removed.
- **Rate limits:** 30 frames per 10 s per socket, counted before parsing (adapters pass a binary frame as `""` via `frameText`, so it counts too); 2 game actions per second per seat (survives a takeover), answered with the game's `rateLimitedReply`. Over the limit is a drop or a rejection, never a disconnect. `party/rate-limit.ts` sweeps once per window (on a timer when given `setTimer`) and caps keys at 10,000 with a shared overflow bucket; the per-IP key is `ipKey()` in `seal.ts` (IPv6 by /64).
- **Client sends only on an open socket:** `RoomConnection.send` drops a frame while disconnected, because partysocket would flush a queued frame before our re-`join`. The keyboard, Start, round length and Play again are disabled while `reconnecting`; Leave still leaves locally and the seat frees at the grace.
- Ranking: rounds won, then total time (unsolved = full limit), ties share a rank, dense numbering (1, 1, 2).
- The room "exists" only after `create()` (the POST). Sockets to an uncreated room get `room-not-found`.

## 7. Design tokens (enforced by `tests/design-tokens.test.ts`)

- Colours: only in `src/lib/colors.ts` (`palette`, light/dark `themes`, class maps). `tailwind.config.ts` turns them into CSS variables and utilities (`bg-tile-correct`, `text-muted`, `fill-accent`, `stroke-primary`). The values mirror `design/tokens.json`; `tests/contrast.test.ts` fails if the two drift or any text pair drops below 4.5:1 (UI parts 3:1) in either theme. Green text uses `success`, not `tile-correct` (too dim as small text in dark).
- Type: only the generated classes `<regular|medium|semibold|bold|extrabold>-<display-3xl..xs|text-xl..xs>`. Fonts (next/font, self-hosted): Figtree via `font-sans` on `<body>`; Bricolage Grotesque via `font-display` plus an `extrabold-display-*` class for headings, tiles and the logo-like titles.
- Design C pieces: ink outlines (`border-[2.5px] border-foreground`) and hard shadows `shadow-piece` / `shadow-piece-key` / `shadow-piece-lg` / `shadow-piece-pressed`, coloured by the `--shadow` token (ink in light, the background in dark, so they vanish there). Prefer the class maps in `colors.ts` (`buttonClasses`, `cardClasses`, `rowClasses`, `keyPieceClasses`, ...) over writing the pieces by hand.
- The one hex exception is `src/app/icon.svg`, a static favicon file (owner Q16, Sub-phase 6.1); it uses `brand.green` and `brand.red`. The design-token scan skips `.svg`.
- `tests/contrast.test.ts` checks token pairs and also reads the outline classes from the class maps (input outline, yellow mini cell), so a changed class cannot drop below 3:1 unnoticed. Dimmed text is checked where it is drawn (e2e asserts an away opponent card stays at opacity 1; only its colours dim).
- Never write hex values, `text-white`, `text-sm`, or `font-bold` in `src/`. A new colour is a new token with both a light and a dark value.
- Tailwind 4 loads the JS config through `@config` in `src/app/globals.css`; there is no `content` list.
- Tailwind scans only `src/` (`@import "tailwindcss" source("../")`). Without that it also scanned tests and `.claude/` docs, which quote banned classes on purpose, and emitted dead utilities like `.text-white`. If a class you added renders unstyled, check that it appears in a file under `src/`.

## 8. Testing and commands

```bash
npm run dev            # Next :3000 + wrangler dev :1999 (reads CHALLENGE_KEY from .env)
npm run lint           # eslint .
npm test               # Vitest, 732 tests, ~4 s
npm run test:e2e       # Playwright; starts its own servers, STOP npm run dev FIRST
npm run build && npm run check:bundle   # word data must not reach .next/static
```

- e2e runs `wrangler dev -c wrangler.e2e.jsonc --port 1999 --env-file /dev/null` (the empty env file keeps the local `.env` key out) and a **production build** of the app (`next build && next start`), with reduced motion. Solo answers are always `crane`; rooms play `crane, slate, robot, moist, light`; a 2 min round lasts 1.2 s, 5 min 3 s, and 3 min (the default) 20 s so a page can be refreshed mid-round; the pause between rounds is 1.5 s; reconnect grace is 5 s. Players are separate browser contexts (separate `sessionStorage`). Durations come from `party/e2e/answers.ts`, injected through `createWoordleGame`.
- `check:bundle` samples the first/middle/last 3-word runs of each list; it catches a shipped list, not a stray fragment.
- Before declaring work done: lint + `npm test`; add `test:e2e` for room/protocol/Challenge changes; add `build && check:bundle` when touching `src/` imports or word data.

## 9. Gotchas that cost time

| Gotcha | What to do |
| --- | --- |
| `partysocket` reconnects forever after a server-side close | Client must call `socket.close()` on every server `error` |
| PartyServer adds no CORS headers | `http.ts` answers `OPTIONS` and adds headers itself |
| `next dev` (Strict Mode) opens 2 sockets in the first second | Don't assert an exact socket count in dev; assert it stops growing |
| `cacheComponents`: dynamic route + `useParams` | `page.tsx` wraps a client component in `<Suspense>`; read `sessionStorage`/`crypto.randomUUID()` only in effects or after the `useSyncExternalStore` client flag |
| ESLint `react-hooks/set-state-in-effect` | Derive state in render; keep connections in refs |
| PartyServer `onMessage(connection, message)` | Arguments are the reverse of old PartyKit. The adapters type `message` as `WSMessage` |
| Hibernation must stay off | Rooms and timers live in memory (`realClock`); `static options = { hibernate: true }` would drop them between messages. It is the PartyServer default |
| Durable Object migrations | Adding, renaming or removing a class in `wrangler.jsonc` needs a new `migrations` entry with a new tag. Workers Free allows only `new_sqlite_classes` |
| Unit tests that drive an adapter | `partyserver` imports `cloudflare:workers`; `vitest.config.mts` aliases it to `tests/helpers/cloudflare-workers.ts` and inlines `partyserver`. Build servers with `new Server(fakeCtx(name), env)` (`tests/helpers/party-server.ts`) |
| `wrangler dev` reads `.env` and `.env.local` | Locally that supplies `CHALLENGE_KEY`; e2e passes `--env-file /dev/null` so it uses the config's test key |
| Orphaned `workerd` on :1999 / `next-server` on :3000 after a test run | Find the PID with `ss -ltnp` and `kill -9` it. Killing `npx wrangler dev` can leave its `workerd` child running, so check again. Do not `pkill -f` a pattern that appears in your own command line |
| e2e fails instantly with "port already used" | Something still holds 3000/1999 (see above) |
| CSS `uppercase` doesn't change DOM text | Match case-insensitively in tests |
| Client ignores keys while a guess is in flight | Playwright helpers wait for the server's row before the next word |
| `next dev` rewrites `AGENTS.md` | It tells you to read `node_modules/next/dist/docs/` before Next code; this is Next 16, APIs differ from older versions |
| Vitest config is `.mts` | Plain `.ts` triggers a CJS-loader warning |
| A time scale must not shrink the pause between rounds | It is a UI pause; scaling it made the summary last 3 ms and invisible to tests. Only round limits scale |
| e2e frame recorders see Next's dev hot-reload socket too | Record only sockets whose URL contains `/parties/` before parsing frames as JSON |
| Assert on data, not on a 300 ms window | Playwright polls at 100 to 1000 ms; keep the e2e pause long enough to observe, or assert from recorded frames |
| Pure session + injected clock | `challenge/session.ts` takes `{clock, send}`; tests use `tests/helpers/fake-clock.ts`. Do not call `setTimeout` in it |
| `CHALLENGE_KEY` handling | Read only from `this.env` in `party/challenge.ts`; missing or not 32 bytes fails closed. Production: `wrangler secret put`. e2e gets a fixed test key from `wrangler.e2e.jsonc` `vars` |
| Challenge links and word-list rebuilds | Regenerating the lists can remove a sealed word; `begin` then answers `invalid-token` (link expired) |
| Board keys vs focused controls | `useKeyboardInput` asks `ownsKey(target, key)`. The page and the on-screen keyboard (`[data-board-keyboard]`) give every key to the board. Text fields (`input`, `textarea`, `select`, `[contenteditable]`) and dialogs keep every key. A focused `a`, `button`, `summary` or `[role=button]` keeps only Enter, so letters still type after a dialog returns focus to Leave room. While any `dialog[open]` exists the board takes nothing (6.1 M1, N1, N2). A new custom control (e.g. a `tabindex` widget) must be added to these selectors |
| Leaving mid-round asks first | `needsLeaveConfirm` (`src/lib/room/leave.ts`): while a match round is played or revealed, Leave room and the room-header logo open `LeaveConfirm` (native `<dialog>`, never `window.confirm`). Lobby and final results leave at once (owner Q13) |
| Restyling must keep e2e anchors | Opponent cards hold only the name while playing (`toHaveText("Ali")`); the lobby name span keeps `min-w-0`; solo has exactly one `role="status"`; one Create room button per page (the header hides its own on `/` and `/woordle`); keep every `data-testid` and checked string |
| Figma Starter plan limits | One mode per variable collection (so Color holds `light/*` and `dark/*`), 3 pages per file. Design file: https://www.figma.com/design/dERC4j6dYLzrCOiCvLinVj |
| e2e guesses must be paced | The server allows 2 guesses/s per player; `submitPaced` in `e2e/helpers.ts` spaces Enter presses 600 ms apart (measured between submits, not typing starts) |
| e2e drops a socket on demand | `page.routeWebSocket` with `connectToServer()`, then close both sides and refuse reconnects (`resilience.spec.ts`, Leave while reconnecting). Grace constants come from `party/e2e/answers.ts` |
| e2e is a production build | `npm run test:e2e` runs `next build` first (about 30 s); a changed `src/` file needs no dev server. Leave `npm run dev` stopped |
| Animations are visual only | `data-state` and colour classes change at once; e2e runs with `reducedMotion: "reduce"`. Keyboard colours wait `ROW_REVEAL_MS` for the flip unless motion is reduced |
| Mutation-check a new guard | Plant the bug (a late guess accepted, an answer in `roundStart`) and confirm the test fails, then restore |

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
| `.claude/Plans/phase-3-time-race.md` | 5,723 | its "Gaps" table |
| `.claude/Docs/Browser Games Project Idea.md` | 2,500 | read-only, superseded by the Spec |
| `node_modules/`, `.next/`, `.wrangler/`, `test-results/` | - | generated |

Search with grep for a heading or symbol instead of opening a large file. Use `offset`/`limit` for anything over ~200 lines.

## 11. Workflow in one paragraph

Per phase: write `.claude/Plans/phase-<n>-<name>.md` (goal, tasks, tests, acceptance, risks), get approval, build protocol -> server -> client, verify (lint, unit, e2e, build, bundle check), save a review to `.claude/Reviews/`, update the Spec and this file, get sign-off. Commit and push only when asked; confirm before every push; no Claude attribution anywhere. Plans, reviews and `CLAUDE.md` stay local.

## 12. Keeping this file honest

Update it in the same change when you add or move a top-level folder, a party, a message type, a design-token rule, a test command, or finish a phase (section 1 table). Update test counts only when they are cheap to verify (`npm test`, `npm run test:e2e`).
