# Deferred issues

Known issues the owner chose to fix after launch. Each has a cause, a failure scenario and a suggested fix, so it can be picked up cold. When one is fixed, move it to the fixing phase's review file and delete it here.

## Phase 6 (deferred 2026-11-06 by the owner, from the third review round)

**Source:** the narrow `code-reviewer` re-check of the Sub-phase 6.1 N1–N4 fixes (`.claude/Reviews/phase-6-ui-design.md`).

**Shared root cause:** `next.config.ts` sets `cacheComponents: true`. With it, Next 16 keeps a page you navigate away from mounted but hidden, inside a React `<Activity>` (`node_modules/next/dist/client/components/layout-router.js`, around lines 386–521). Hiding a page runs its effect cleanups but keeps its state, refs and DOM. Pressing Back shows the same instance again. Code that assumes "`router.push` unmounts the page" is wrong under this flag.

### DI-1 (Medium): the Leave guard can block a later leave

- **Where:** `src/components/room/RoomPage.tsx`, the `leaving` ref in `leave()`, added in Sub-phase 6.1 as the guard against double-clicking Leave match.
- **Scenario:**
  1. A player leaves a room. `leaving.current` becomes `true` and the page is hidden, not unmounted.
  2. They press Back. The same page instance comes back, and because `chosen` survived, the connection effect re-joins and takes a seat.
  3. `leaving.current` is still `true`, so Leave room and the logo now do nothing. The only way out is closing the tab, which holds the seat for 60 s.
- **Fix:** reset the ref whenever the page becomes active again. Effects re-run when an Activity is shown, so set `leaving.current = false` in a mount effect, or at the top of the connection effect.
- **Related (Low, pre-dates 6.1):** that Back re-join is silent. Leaving calls `forgetRoom()` so that a refresh does not walk back in, but the hidden page still holds `chosen`, so Back does walk back in. Suggested fix: `leave()` also clears `chosen`, so Back shows the name form prefilled. Owner decision wanted.
- **Test:** e2e. Join, Leave room, Back. Expect the name form (if the related fix is taken) and no seat for the other player. Join again, Leave room, and expect the URL to change.

### DI-2 (Medium, risk): an open "Leave the match?" dialog can be left behind and block the keyboard

- **Where:** `src/components/room/LeaveConfirm.tsx` (its effect never closes the dialog on cleanup), together with the `dialog[open]` guard in `src/lib/woordle/use-keyboard-input.ts`.
- **Scenario:**
  1. Mid-round, the player opens "Leave the match?".
  2. They press the browser or mouse Back button. The room page is hidden with `display: none`, but nothing calls `dialog.close()`, so the `<dialog open>` stays in the DOM, likely still in the top layer.
  3. On `/woordle/solo` or a challenge, `document.querySelector("dialog[open]")` matches the hidden dialog, so the physical keyboard does nothing until a reload. A leftover modal may also make the visible page inert. This is not verified in a browser.
- **Fix:**
  - **Cause:** close the dialog in a cleanup in `LeaveConfirm`: `useEffect(() => { const d = ref.current; return () => { if (d?.open) d.close(); }; }, [])`. That also covers a real unmount.
  - **Optional hardening:** have the guard count only a showing modal: `document.querySelector("dialog:modal")` with `checkVisibility()`.
- **Test:** e2e. Start a match, open the dialog, `goBack()`, follow Play solo, type two letters, and expect two typed tiles.

### Nits from the same round (Low)

- `use-keyboard-input.ts`: the `[contenteditable]` selector also matches `contenteditable="false"`. Use `[contenteditable]:not([contenteditable=false])`.
- `use-keyboard-input.ts`: with the global `dialog[open]` guard in place, `dialog` in `TEXT_ENTRY` only matters for non-modal dialogs. Say so in the comment.
