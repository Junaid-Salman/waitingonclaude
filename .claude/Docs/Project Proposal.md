# WaitingOnClaude — Project Proposal

| Field | Value |
| --- | --- |
| Project | WaitingOnClaude platform with Woordle as the first game |
| Prepared for | Junaid Salman, owner (self-funded hobby project) |
| Prepared by | Junaid Salman |
| Date | 2026-10-29 |
| Version | v1.0 |
| Companion | `Project Overview Spec.md` (architecture, setup, workflows) |

---

## 1. Executive Summary

People who work with Claude and other AI agents wait minutes at a time for tasks to finish, and they have nothing short and social to fill that gap. WaitingOnClaude is a browser game hub where anyone opens a link, types a name, and plays with friends within seconds: no install, no account, no stored data. The MVP ships Woordle in two modes, a live 5-round Time Race for up to 5 players and a 5-word Challenge sent by link, with all answers and timing kept on the server so every race is fair. The platform runs on Vercel and PartyKit free tiers at $0 per month, and future games plug into the same room system without new infrastructure. One part-time developer delivers six milestones in an estimated 22 person-days, about 11 weeks at 2 days per week, with no fixed deadline and no labour fee.

## 2. Problem

- **Idle time with no outlet.** AI agent tasks leave users idle several times a day, in gaps too short for real work.
- **Friction kills the moment.** Existing multiplayer word games require accounts, installs, or matchmaking with strangers; by the time everyone signs up, the task has finished.
- **Unfair races.** Browser games that send the answer to the client or trust the client's clock let one player read the answer or fake a solve time.
- **Hosting cost.** A hobby project that bills monthly gets shut down. This one has to cost nothing to run.

## 3. Goals and Success Metrics

| Goal | Metric | Source |
| --- | --- | --- |
| Join in seconds | Link open to lobby in under 10 seconds, with one input (name) | Target derived from "join in seconds" |
| Short games | Full Time Race finishes in at most 15 minutes at the 3-minute default (5 rounds x 3 min), sooner when rounds end early | Derived from spec defaults |
| Fair play | Zero answer bytes in any WebSocket frame before `roundEnd`, checked by an automated Playwright test | Spec goal |
| Server-authoritative timing | 100% of solve times computed from server timestamps | Spec goal |
| Extensible platform | Second game requires no changes in the shared room layer | Spec goal |
| Zero cost | $0 monthly bill at hobby scale | Spec goal |
| No stored data | No database, no persistent storage, no analytics or error tracking | Spec non-goal |

## 4. Proposed Solution

A Next.js app on Vercel serves the home page and every game's UI. One PartyKit room server, running a separate in-memory instance per room on Cloudflare Durable Objects, holds players, timers, word lists, and scoring. When the last player leaves, the instance and every name in it disappear. If PartyKit's managed tier changes, the same room code moves to a personal Cloudflare Workers Free account.

| Pain point / requirement | Feature |
| --- | --- |
| Friction to start | Join with just a name; 4-letter room code; shareable link `/woordle/room/ABCD` |
| Social play | Rooms of up to 5; live player list; opponents' boards show colours live |
| Short sessions | 5 rounds; host picks 2, 3, or 5 minutes per round; rounds end early once everyone is done |
| Async play | Challenge: creator picks 5 words and a time limit, sends a link |
| Answer leakage | Word list and answers live only on the room server; Challenge words AES-GCM encrypted in the link |
| Fake times | Server stamps round starts and solves |
| Spam | Server rate limits: 2 guesses per second per player, 30 messages per 10 seconds per connection |
| Refresh or dropped connection | Player ID in `sessionStorage` rejoins the same seat within a 60-second grace window |
| Mid-match disruption | New players are blocked until the match ends |
| Host leaves | Host role passes to the next player |
| Future games | Shared room layer plus a per-game rules-and-board contract |
| Trademark exposure | Distinct visuals; footer: "Not affiliated with Anthropic or The New York Times." |

## 5. Scope

### 5.1 In Scope (MVP)

**Platform**

- WaitingOnClaude home page listing available games, with the non-affiliation footer
- Shared room layer: join by name, 5-player cap, duplicate-name suffixes, host role and handover, server timing, rate limiting, results screen
- Join rule: new players join only in the lobby; during a match the server rejects them with "Match in progress" and a "Try again" button
- Reconnect grace: a seated player who refreshes or drops keeps their seat for 60 seconds, in the lobby or mid-match, and rejoins with board and score intact. After 60 seconds the seat is removed and that player counts as new
- Responsive layout for the latest two versions of Chrome, Edge, Firefox, Safari, and iOS Safari 17+

**Woordle rules (both modes)**

- Five-letter words, six guesses, green/yellow/grey with correct repeated-letter handling
- Guesses validated against the guess list
- Curated ~2,000-word answer list and a larger guess list built from SCOWL, filtered with the LDNOOBW profanity blocklist

**Time Race**

- Create room, share link, host starts the match with 1 or more players (solo practice works)
- 5 rounds, same puzzle to every player at the same moment
- Round ends at its time limit, or earlier once every seated player has solved or used all 6 guesses; a player inside the reconnect grace window counts as still playing
- 5-second answer reveal between rounds
- First solver wins the round; every solve time recorded
- Opponent boards: colours only, "Solved" badge and solve time
- Final ranking by rounds won; ties by cumulative time; unsolved round counts as the full limit; exact ties share a rank
- Play again with the same room; players blocked during the match can join now

**Challenge**

- Creator enters 5 words, each checked against the guess list, no duplicates
- Creator picks a per-round limit of 1, 2, 3, or 5 minutes
- Encrypted shareable link; words never readable from the URL
- Solver plays 5 timed rounds and sees words solved and time taken
- Link playable by anyone, any number of times

**Quality and launch**

- Vitest unit tests for scoring, ranking, early round end, and the challenge token
- Playwright end-to-end tests: two-player Time Race, mid-match join rejection, refresh-and-rejoin, full Challenge, answer-leak check
- Production deploy to Vercel and PartyKit

### 5.2 Out of Scope

- User accounts, profiles, login
- Storing names, scores, or history after a room closes
- Public matchmaking with strangers
- Spectating a match in progress
- Monetization of any kind (Vercel Hobby forbids commercial use)
- Reporting Challenge results back to the creator
- Woordle hard mode, emoji reactions, shareable result grid, configurable round count, other word lengths or languages
- A second game (Milestone 7 follows the MVP)
- Custom domain
- Analytics, error tracking, or any third-party script

### 5.3 Owner Responsibilities

- Create and own the GitHub, Vercel, and PartyKit accounts
- Approve the final answer list after filtering
- Generate and hold `CHALLENGE_KEY`
- Recruit 2–4 friends for the launch playtest

## 6. Deliverables

| # | Deliverable | Form |
| --- | --- | --- |
| D1 | Source repository | GitHub repo `waitingonclaude` |
| D2 | Word lists and licences | `party/data/answers.json`, `party/data/guesses.json`, `party/data/LICENSES.md` |
| D3 | Room server | PartyKit project `waitingonclaude` with parties `main` and `challenge` |
| D4 | Frontend | Next.js app on Vercel at `waitingonclaude.vercel.app` (fallback `waitingonclaude-game.vercel.app`) |
| D5 | Test suites | Vitest and Playwright, runnable with `npm test` and `npm run test:e2e` |
| D6 | Documentation | `Project Overview Spec.md`, README with setup, deploy, and Cloudflare backup steps |

## 7. Milestones

One developer works part-time at about 2 days per week, with no fixed deadline. Effort figures are estimates for a developer familiar with Next.js and TypeScript; each line shows its basis. Weeks count from the build start, computed as cumulative days ÷ 2 per week.

| # | Milestone | Deliverables | Acceptance criteria | Effort (est.) | Weeks |
| --- | --- | --- | --- | --- | --- |
| 1 | Woordle core | Grid, on-screen and physical keyboard, word lists, `scoreGuess`, solo play | All repeated-letter test cases pass; solo game playable end to end | 4 days (UI 1.5, lists 1, scoring + tests 1, wiring 0.5) | 1–2 |
| 2 | Platform shell and rooms | Home page, room layer, create/join by link, live player list, lobby-only join rule | Two browsers join one room by link; 6th player rejected; duplicate names suffixed | 4 days (PartyKit setup 1, room layer 2, UI 1) | 3–4 |
| 3 | Time Race | Host start, 5 synced rounds, server timing, early round end, winners, ranking, mid-match join block | Playwright two-player match completes with correct ranking and tie-break; round ends early when both players finish; a third browser gets "Match in progress"; no answer in frames before `roundEnd` | 5 days (round engine 2, opponent boards 1.5, ranking + tests 1.5) | 5–7 |
| 4 | Challenge | Setup form, encrypted link, 5 timed rounds, summary | Token round-trip test passes; tampered token rejected; Playwright Challenge flow passes | 3 days (token 1, solver session 1, UI 1) | 7–8 |
| 5 | Polish | Animations, mobile layout, host handover, 60-second reconnect grace, rate limiting | Refresh mid-round restores the board; a seat expires after 60 seconds; host leave reassigns host; 10 rapid guesses yield rate-limit rejections | 4 days (1 per area, handover + reconnect combined) | 9–10 |
| 6 | Launch | Production deploy, full test run, friends playtest | Production smoke test passes; one 3+ player playtest with no blocking bug | 2 days | 11 |
| | **Total** | | | **22 days** | **~11 weeks** |

## 8. Investment

| Item | Cost |
| --- | --- |
| Vercel Hobby | $0 |
| PartyKit Individual (managed) | $0 |
| Cloudflare Workers Free (backup only) | $0; over 100,000 requests per day, calls fail until 00:00 UTC instead of billing |
| Domain | $0 (default Vercel subdomain) |
| Development effort | 22 person-days (estimate), self-funded, no labour fee |
| **Total cash cost** | **$0** |

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| PartyKit managed tier changes or shuts down after Cloudflare's acquisition | Medium | High | Keep room code on the PartyKit API; redeploy to a personal Cloudflare Workers Free account with no code changes. The source's Supabase + Upstash backup is dropped because it cannot run server-side round timers |
| Part-time schedule slips past ~11 weeks | Medium | Low | No fixed deadline; milestones ship in order and each leaves a playable build |
| Trademark complaint over "Woordle" or "Claude" | Low–Medium | Medium | Distinct logo and palette, footer disclaimer, rename ready |
| Answer leaks through a message or a client bundle | Medium | High | Per-player view boundary on the server, ESLint ban on `src/` importing `party/`, Playwright frame check |
| Repeated-letter scoring bugs | Medium | Medium | Two-pass algorithm with a fixed table of test cases |
| A dropped player stalls an early round end | Medium | Low | Grace capped at 60 seconds; the time limit always ends the round |
| Friend arrives mid-match and cannot play | High | Low | Clear "Match in progress" message with "Try again"; a full match lasts at most 25 minutes at the 5-minute setting |
| Clock skew makes timers look wrong | Medium | Low | Server decides; client renders from server `endsAt` with a measured offset |
| Challenge replay lets a solver learn answers and replay perfectly | High | Low | Accepted: results never reach the creator |
| Rotating `CHALLENGE_KEY` breaks old links | Low | Low | Version field in token; clear "link expired" message |
| Free-tier abuse (room spam) | Low | Medium | Per-connection rate limits; rooms die when empty |
| Scope creep from the "Later" list | Medium | Medium | Out-of-scope list above; new items go to a post-MVP backlog |

## 10. Assumptions and Dependencies

- Hobby scale: a handful of concurrent rooms, well under 100,000 requests per day.
- Vercel Hobby and PartyKit free tiers keep their current terms.
- SCOWL and LDNOOBW licences permit redistribution in a public repo; `LICENSES.md` carries the attributions.
- Players use a modern browser with WebSockets and `sessionStorage`.
- `waitingonclaude.vercel.app` is available; otherwise `waitingonclaude-game.vercel.app`.
- Effort figures hold for a developer familiar with Next.js and TypeScript; less familiarity extends the schedule, not the cost.

## 11. Next Steps

| Action | Owner | Due |
| --- | --- | --- |
| Create GitHub repo, Vercel and PartyKit accounts | Junaid Salman | Week 1 |
| Generate `CHALLENGE_KEY` and add it to PartyKit | Junaid Salman | Week 1 |
| Build and approve the filtered answer list | Junaid Salman | End of week 2 (Milestone 1) |
| Ship rooms with lobby-only join (Milestone 2) | Junaid Salman | End of week 4 |
| Schedule launch playtest with 2–4 friends | Junaid Salman | Week 10 (end of Milestone 5) |
| Deploy to production and share | Junaid Salman | Week 11 |

## 12. Decisions

| Topic | Decision |
| --- | --- |
| Real-time host | PartyKit managed now; backup is Cloudflare Workers Free |
| Mid-match joins | Blocked until the match ends |
| Reconnect grace | 60 seconds for already-seated players, lobby or mid-match |
| Early round end | When every seated player has solved or used 6 guesses |
| Minimum players to start | 1 |
| Challenge time limits | 1, 2, 3, or 5 minutes |
| Word lists | SCOWL + LDNOOBW |
| Second game | Post-MVP |
| Rate limits | 2 guesses/s per player; 30 messages per 10 s per connection |
| Gap between rounds | 5 seconds |
| Analytics | None |
| Product names | Keep both, with disclaimer |
| Funding | Self-funded hobby; no labour fee |
| Team and schedule | One developer, ~2 days/week, ~11 weeks, no fixed deadline |
| Browser support | Latest two versions of major browsers; iOS Safari 17+ |
