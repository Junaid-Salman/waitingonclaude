---
description: Plan a phase, sub-phase, deferred issue or task end to end — research via the phase-planner agent (Opus), settle every open question with the owner, save the plan to .claude/Plans/ for approval
argument-hint: <phase n | sub-phase n.m | DI-n … | task description> [extra instructions…]
model: opus
---

Plan work for WaitingOnClaude. **Do not write or change any code** in this command.

**Arguments:** `$ARGUMENTS`
The first part names what to plan: a phase or sub-phase from
`.claude/Plans/00-phased-plan.md`, one or more deferred issue ids (`DI-1 DI-2`) from
`.claude/Deffered Issues.md`, or a free-text task. Anything after it is the owner's
extra instructions for this run; they win over the defaults below, not over the hard rules.

Planning runs on **Opus 5.5**; implementation (`/implement-plan`) runs on **Sonnet 5.5**.

## 1. Orient (main session, cheap)
- Read `.claude/ARCHITECTURE.md` §1 (phase status) only.
- Find the item: grep its heading in `00-phased-plan.md`, or the `DI-n` entries.
- Check `.claude/Plans/` for an existing plan for it. If one exists, ask the owner:
  *revise it* or *write a new sub-phase plan*.
- Pick the target path `.claude/Plans/phase-<n>-<short-name>.md` (kebab-case; follow
  the existing numbering, e.g. `phase-7.8-…`; deferred-issue fixes get the next phase or
  sub-phase number the owner agrees to).

Ask the owner (one AskUserQuestion call) **only** about things that change the plan and
can't be found in the repo — e.g. which phase number, whether to bundle related deferred
issues. If nothing is ambiguous, ask nothing and go on.

## 2. Research and draft (phase-planner agent)
Start the **`phase-planner`** agent (foreground). Give it:
- what to plan and the target path;
- the owner's extra instructions and any answers from step 1;
- relevant facts from memory (decisions, deferred items, conventions in this area).

It writes the draft plan to the target path (Status `draft`) and returns a short summary
with the open questions. Keep its id: if a later answer changes the approach, continue it
with SendMessage rather than redoing the work yourself.

## 3. Settle the open questions (main session)
Read the plan's "Open questions (owner)". Ask them in AskUserQuestion rounds (up to 4 per
call), each with the planner's recommendation first, marked "(Recommended)". Look facts
up yourself instead of asking when the repo can answer.

Write each answer back in the existing style — `**Qn — topic. ANSWERED: <answer>.**` —
add it to "Owner decisions", and update the sections it affects (steps, files, edge
cases, acceptance criteria). Small edits: do them with Edit. Answers that change the
approach: send them to the planner via SendMessage.

## 4. Finish
Check before handing over:
- no unanswered open questions (or the owner explicitly accepted one as an assumption);
- every new file has a Reuse-inventory line;
- every acceptance criterion maps to a step and a test;
- the Gate follows `.claude/rules/testing.md` (lint + `npm test`; e2e for room/protocol/Challenge;
  `build && check:bundle` for `src/` imports or word data);
- new dependencies have a recorded reason.

Set Status to `**awaiting approval.** Written <date>.` and give the owner the path plus a
short summary (goal, steps with risk, decisions). Optionally offer one line: "Want a
second opinion from the `plan-reviewer` agent first?"

On the owner's approval, set Status to `**approved <YYYY-MM-DD>.**` and tell them
`/implement-plan <path>` will build it.

## Hard rules
- Plan only. Never edit app code, tests, config or docs outside `.claude/Plans/`.
- Never commit, push or create branches.
- Don't invent facts about the code; anything stated as existing has a path.
