---
description: Build an approved plan — one implementer session (Sonnet) runs the steps, the main session checks each one, then the test gate, an optional review and docs. Never commits unless asked.
argument-hint: <path-to-plan.md> [extra instructions…]
model: sonnet
---

Implement a plan made by `/plan-phase`.

**Arguments:** `$ARGUMENTS`
The first token is the plan path in `.claude/Plans/`. Anything after it is the owner's
extra instructions for this run; they win over the defaults below, not over the hard rules.

You (the main session) coordinate: you talk to the owner, check every step, and keep
your own context small — the **`implementer`** agent (Sonnet 5.5) does the reading and
writing. Don't re-read files the implementer already summarised unless a check needs it.

## 1. Pre-flight
1. Read the plan's Status, Owner decisions, Open questions, Steps headings and Gate (use
   grep/offset; not the whole file unless short). Status must be `approved`, with no
   unanswered open questions. If not, stop and offer `/plan-phase` to finish it.
2. `git status --porcelain` must be empty. If not, show the owner what's uncommitted and
   ask how to proceed; never stash or discard their work.
3. Record `git rev-parse HEAD` (proves nothing gets committed).
4. Ask the owner (one AskUserQuestion call):
   - **Mode:** *step by step* (stop after each step for their OK) or *one go* (stop only
     on a failure, a high-risk step, a protocol/wrangler change, or a new dependency).
   - **Review at the end:** *ask at the end (Recommended)* / *run it* / *skip it*.
5. Set the plan's Status to `**implementing.**`.

## 2. Steps — ONE implementer session for the whole plan
Start the `implementer` agent once, in the background, with: the plan path, the mode, the
step to start at, the owner's extra instructions, and relevant memory facts. Keep its id.

- **Step by step:** after the owner OKs a step, continue the **same** agent with
  SendMessage ("continue with Step N") so it keeps its context.
- **One go:** it runs step after step and reports only when done or when it must stop.
- **If it stops unexpectedly** (usage limit, error): try SendMessage first. If it can't
  resume, start a fresh implementer pointed at the plan's Implementation log.

**Check every step report — don't take its word for it:**
- `git diff --stat`, then read only the important hunks: changes match the step, nothing
  unrelated touched, no `src/**` → `party/**` import, no hex colours, no secrets.
- HEAD still equals the recorded SHA and nothing is staged.
- The report shows the real commands and their results; re-run anything doubtful
  (`npm run lint`, `npm test` are cheap).
- The Implementation log has the step entry with its file list.

Then tell the owner in plain words: what was built, tests written and results, any
deviation, and a **suggested commit message** (conventional, plain, no Claude/AI
attribution, no `Co-Authored-By` trailer — `.claude/rules/core.md`).

## 3. Final gate
When all steps are done, have the implementer run the plan's Gate, at minimum per
`.claude/rules/testing.md`: `npm run lint`, `npm test`; `npm run test:e2e` (the number of consecutive runs
the plan asks for) when room, protocol or Challenge code changed; `npm run build && npm
run check:bundle` when `src/` imports or word data changed. Confirm each acceptance
criterion and list the ones not verified (e.g. production-only or manual checks). A
flaky e2e run is reported to the owner, not fixed in a loop.

## 4. Review
Per the pre-flight answer (or ask now): start the `code-reviewer` agent on the
**uncommitted** working-tree diff against the recorded HEAD, checked against the plan and
`.claude/rules/architecture.md`. Save its report, severity-ranked with file:line references,
to `.claude/Reviews/phase-<n>-<short-name>.md` (same name as the plan).

Then **stop and report the findings to the owner and wait.** Never fix review findings in
a loop. Fix only what the owner picks (send those to the implementer); anything the
owner defers goes into `.claude/Deffered Issues.md` with cause, scenario and fix.
Critical findings must be fixed before the next phase starts.

## 5. Finish
- The implementer's last step applies "Docs to update" (ARCHITECTURE.md phase table,
  Spec). Check it happened.
- Append a closing entry to the Implementation log: gate results, review outcome,
  suggested commit message(s).
- Set Status to `**done <YYYY-MM-DD>, awaiting sign-off.**`
- Summarise for the owner: what shipped, tests, unverified criteria, open risks, next step.

## Hard rules
- **Never commit** unless the owner explicitly asks, and then only what they named, with
  no Claude attribution. **Never push** without confirming first. Never force, stash,
  reset or discard the owner's work.
- Never run `npm run party:deploy` or touch production unless the owner asks.
- Stop and ask whenever the code disagrees with the plan in a way that changes behaviour.
