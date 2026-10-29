# WaitingOnClaude — Project Idea

Oct 29, 2026 · @Junaid Salman

## Overview

WaitingOnClaude is a browser-based multiplayer game hub: short games to play with friends while Claude finishes a task. Woordle, a real-time multiplayer word-guessing game, is the first game, and more will be added over time.

- **What it is:** a multiplayer web game platform on Vercel. Nothing to install, no account; players join with just a name.
- **Who it's for:** people waiting on Claude or another AI agent, and the friends or coworkers they play with.
- **Names:** WaitingOnClaude for the platform, Woordle for the first game. "Claude" is an Anthropic trademark and "Wordle" a New York Times one. As a joke on a hobby project that's likely fine, but keep the logos and visuals distinct and add a line in the footer saying the site isn't affiliated with either.

## Platform

Every game shares one room system; each game adds only its own rules, board and scoring.

**Shared by every game**

- Home page listing the available games
- Join with just a name, rooms of up to 5 players, shareable link with a short code
- Live player list, host role and handover, reconnect after a refresh
- Server-side timing, rate limiting and an end-of-match results screen

**Each game provides**

- Its rules and scoring, run on the room server
- Its board UI and any game-specific settings
- Its own route, e.g. `/woordle/room/ABCD`

**Games**

- Woordle: the first game, in the MVP
- More short games later, each playable in a few minutes

## Goals and non-goals

The goal is a fast, fair multiplayer round that runs entirely on free tiers and stores no user data.

**Goals**

- Join a room in seconds with only a name
- Games short enough to finish while waiting on a task
- Adding a new game means writing its rules and board, not new infrastructure
- Everyone in a room plays the same puzzle, with progress shown live
- Answers never reach the browser until the round ends
- $0 to run at hobby scale

**Non-goals (for now)**

- User accounts, profiles or login
- Storing names, scores or history after a room closes
- Public matchmaking with strangers
- Monetization

## Woordle game modes

Woordle has two modes: a live five-round race in a room, and an async challenge sent by link.

|  | Time Race | Challenge |
| --- | --- | --- |
| Players | Up to 5 players in a room, playing live | One creator, one solver |
| Words | Same puzzle shown to all players at the same moment | 5 words chosen by the creator |
| Rounds | 5 | 5 |
| Time | Time limit per round; each player's solve time is recorded | Fixed limit per round set by the creator (e.g. 5 min) |
| Round winner | First player to solve it | No opponent; solve within the limit |
| Final result | Ranking by rounds won; ties broken by cumulative time | Words solved and time taken |
| How to start | Create a room, share its link | Creator sets words and time limit, generates a link, sends it |

**Time Race.** A puzzle goes to every player at once, and the first to solve it wins the round. Everyone keeps playing until the round's time limit runs out, so nobody waits long. After 5 rounds, players are ranked by rounds won, with cumulative time breaking ties.

**Challenge.** A player picks 5 words and a time limit per round, then generates a link for another player. The other player opens the link and solves the 5 words, one round at a time, each against the clock.

## How a game works

A Time Race match goes from a shared link to a final ranking in six steps, with 5 rounds of guessing in between; the room can then start a new match.

&#91;embedded content: room flow · 6 steps, play-again loop\]

The client sends each guess to the room server, which replies with the colour pattern; the word itself only reaches browsers on the results screen.

**Rules**

- Five-letter words, six guesses per word, in both modes
- Green = right letter, right spot; yellow = in the word, wrong spot; grey = not in the word
- Repeated letters are coloured only as many times as they appear in the answer
- Guesses must be real words from the list

## Features

The MVP is the WaitingOnClaude home page plus Woordle with both modes: a 5-round Time Race with a live scoreboard, and a 5-word Challenge sent by link.

**MVP**

- **Shared:** six guesses, five letters, server-side scoring with correct handling of repeated letters; join with just a name
- **Time Race:**
  - Create a room and share a link with a short code (`/woordle/room/ABCD`)
  - Up to 5 players; live player list; duplicate names get a suffix ("Ali", "Ali 2")
  - Host starts the match; the first player in is host, and the role passes on if they leave
  - 5 rounds, each puzzle shown to all players at the same moment
  - First to solve wins the round; the round runs until its time limit so others can finish, and each player's solve time is recorded
  - Opponents' boards show colours only; letters stay hidden until the round ends
  - Final ranking by rounds won, ties broken by cumulative time
  - Rejoin after a refresh using a player ID kept in `sessionStorage`
- **Challenge:**
  - Creator enters 5 words, each checked against the word list
  - Creator sets a time limit per round (e.g. 5 min)
  - Generate a shareable link; the words are never visible in it
  - Solver plays 5 timed rounds, then sees a summary of words solved and time taken

**Later**

- More games on the same room system
- Woordle hard mode (revealed hints must be reused)
- Quick emoji reactions in Time Race
- Shareable result grid, so a Challenge solver can send their result back
- Choose the number of rounds
- Other word lengths or languages

## Tech stack

A Next.js frontend on Vercel plus one PartyKit room server shared by every game; no database and no auth.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js (App Router) + TypeScript | Deploys to Vercel with no setup |
| Styling | Tailwind CSS | Fast to build the grid and keyboard |
| Animation | Framer Motion | Tile flip, shake and reveal |
| Client state | Zustand | Board, current guess, keyboard colours |
| Real-time rooms | PartyKit (Cloudflare Durable Objects) | One in-memory server per room; gone when empty |
| Word list | JSON in the repo, read only by the room server | Answer never sent to the browser |
| Testing | Vitest (scoring), Playwright (two-player flow) | Scoring is easy to get wrong |
| Hosting | Vercel (frontend), PartyKit (rooms) | Both free at this scale |

Fallback if PartyKit doesn't work out: Supabase Realtime for presence and broadcast, plus Upstash Redis with a TTL on each room key.

## Architecture and privacy

Two pieces: a Next.js app on Vercel serves every game, and a PartyKit room server holds each live room in memory.

&#91;embedded content: architecture · browser, Vercel, room server\]

No user data is stored anywhere. A player's name exists only in their tab and in the room's memory, and the room disappears when everyone leaves.

- **Fairness:** the word list and answer live only on the room server
- **Challenge links without storage:** the 5 words and time limit are encrypted into the link with a server-side key (e.g. AES-GCM). The server decrypts it when the solver plays and scores each guess, so nothing is saved and the words can't be read from the URL. Plain base64 would let the solver decode the answers.
- **Timing:** the server stamps each round's start and each solve, so a slow or tampered browser can't change anyone's time
- **Abuse:** cap guesses per second per player in the room server
- **Reconnects:** a random player ID in `sessionStorage` lets a refreshed tab rejoin as the same player

## Cost

The whole project runs at $0 on free tiers.

| Service | Plan | Limits that matter |
| --- | --- | --- |
| Vercel | Hobby (free) | Personal, non-commercial use only |
| PartyKit | Individual (free, managed) | Up to 10 live projects; storage cleared every 24 hours, which suits a game that stores nothing |
| Cloudflare (optional move later) | Workers Free | 100,000 requests per day; over the limit, calls fail until the 00:00 UTC reset instead of billing |

Moving rooms to your own Cloudflare account later needs no code changes, and PartyKit charges no platform fee there. Sources: [PartyKit free tier](https://freetier.co/directory/products/partykit), [PartyKit on your own Cloudflare account](https://docs.partykit.io/guides/deploy-to-cloudflare/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing).

## Milestones

Build single-player first, then add rooms, then polish; no dates set yet.

1. **Woordle core:** grid, keyboard, word lists and a tested scoring function, playable solo
2. **Platform shell and rooms:** WaitingOnClaude home page, shared PartyKit room layer, create/join by link, live player list
3. **Time Race:** host start, 5 synced rounds, server-side timing, round winners, final ranking
4. **Challenge:** word and time-limit setup, encrypted link, 5 timed rounds, solver summary
5. **Polish:** animations, mobile layout, host handover, reconnect on refresh, rate limiting
6. **Launch:** deploy to Vercel and PartyKit, Playwright tests for both modes, share with friends
7. **Next game:** add a second game on the same room layer

## Decisions

- Platform name: WaitingOnClaude; first game: Woordle
- Up to 5 players per room
- Time Race: each round has a time limit, 3 minutes by default; the host picks 2, 3 or 5 when creating the room
- Time Race: play continues until the limit runs out, even after someone solves
- Time Race: rank by rounds won; cumulative time breaks ties, and an unsolved round counts as the full time limit
- Opponent boards: colours shown live with letters hidden, plus a "Solved" badge and solve time when someone finishes
- Challenge links: anyone with the link can play, any number of times; no result reporting back to the creator for now
- Word lists: a curated \~2,000-word answer list of common words and a larger valid-guess list, both built from an openly licensed dictionary and filtered with a profanity blocklist; Challenge words are checked against the guess list
- Hosting: default Vercel URL (e.g. `waitingonclaude.vercel.app`, if free); custom domain later if wanted
