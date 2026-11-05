# Design brief — WaitingOnClaude UI redesign (Phase 6)

```
DESIGN: Logo, then a redesign of every WaitingOnClaude screen, responsive (1440 and 390), light and dark
PRODUCT: A free browser game hub for people waiting on Claude to finish a task. First game: Woordle (solo, a live 5-round Time Race for up to 5 players, and encrypted-link Challenges)
USERS: Developers and their colleagues filling a 1–10 minute wait, often a few at once in one office, on a laptop or a phone
JOB OF THIS SCREEN: Get into a game in one or two clicks, play it with no friction, and see who won
CONTENT: Real names (Ali, Bo, Cy, plus one 24-character name), room code "KQXF", round 3 of 5 at 1:42, rankings with ties, the words crane/slate/robot, one "Match in progress" and one "Link expired"
SCREENS / STATES: listed below
LOOK: Playful and warm, from the owner's palette. Three directions explored, see below
CONSTRAINTS: Owner palette (P1); tokens only in src/lib/colors.ts and tailwind.config.ts; WCAG AA; light and dark; 44 px touch targets; reduced motion respected; footer disclaimer kept; no third-party assets or trackers; OFL fonts through next/font (no new npm dependency)
OUTPUT: Figma (a new file in the owner's team), then code in this project
VARIATIONS: 3 directions first, then 1
```

The same brief is saved to `design/briefs/ui-redesign.md`. `design/` holds the logo masters and the brief. It is committed with the phase; it holds no secrets.

Tokens: `design/tokens.json` (primitives and light/dark semantic tokens; every text pair at least 4.5:1, UI parts at least 3:1).
Figma: https://www.figma.com/design/dERC4j6dYLzrCOiCvLinVj (Logo and Directions pages).
