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
- **Owner decision (2026-11-06):** take the related fix: `leave()` clears `chosen`, so Back shows the prefilled name form.
- **Test:** already written, marked `test.fixme` at launch: `e2e/resilience.spec.ts`, "after leaving, Back asks for a name…". Remove `.fixme` with the fix. Join, Leave room, Back. Expect the name form (if the related fix is taken) and no seat for the other player. Join again, Leave room, and expect the URL to change.

### DI-2 (Medium, risk): an open "Leave the match?" dialog can be left behind and block the keyboard

- **Where:** `src/components/room/LeaveConfirm.tsx` (its effect never closes the dialog on cleanup), together with the `dialog[open]` guard in `src/lib/woordle/use-keyboard-input.ts`.
- **Scenario:**
  1. Mid-round, the player opens "Leave the match?".
  2. They press the browser or mouse Back button. The room page is hidden with `display: none`, but nothing calls `dialog.close()`, so the `<dialog open>` stays in the DOM, likely still in the top layer.
  3. On `/woordle/solo` or a challenge, `document.querySelector("dialog[open]")` matches the hidden dialog, so the physical keyboard does nothing until a reload. A leftover modal may also make the visible page inert. This is not verified in a browser.
- **Fix:**
  - **Cause:** close the dialog in a cleanup in `LeaveConfirm`: `useEffect(() => { const d = ref.current; return () => { if (d?.open) d.close(); }; }, [])`. That also covers a real unmount.
  - **Optional hardening:** have the guard count only a showing modal: `document.querySelector("dialog:modal")` with `checkVisibility()`.
- **Test:** already written, marked `test.fixme` at launch: `e2e/resilience.spec.ts`, "Back while Leave the match? is open…". Remove `.fixme` with the fix. Start a match, open the dialog, `goBack()`, follow Play solo, type two letters, and expect two typed tiles.

### Nits from the same round (Low)

- `use-keyboard-input.ts`: the `[contenteditable]` selector also matches `contenteditable="false"`. Use `[contenteditable]:not([contenteditable=false])`.
- `use-keyboard-input.ts`: with the global `dialog[open]` guard in place, `dialog` in `TEXT_ENTRY` only matters for non-modal dialogs. Say so in the comment.

## Phase 5.1 (deferred; the owner chose the backlog on 2026-11-06, Phase 7 Q19)

### DI-3 (Nit): Retry-After is not readable by cross-origin code

- **Where:** `party/http-cors.ts`, where `CORS_HEADERS` has no `Access-Control-Expose-Headers`.
- **Effect:** none today. `seal-client.ts` only checks the 429 status.
- **Fix:** add `Access-Control-Expose-Headers: Retry-After` if the form ever shows a countdown.

### DI-4 (Nit): the hex IPv4-mapped form shares one rate-limit bucket

- **Where:** `party/challenge/seal.ts`, in `ipKey()`.
- **Effect:** `::ffff:cb00:7107` keys as `0:0:0:0::/64`, so every address written that way shares one bucket. Cloudflare sends the dotted form (`::ffff:203.0.113.7`), so the only effect would be over-limiting.
- **Fix:** convert the last two hex groups of `::ffff:x:y` into dotted IPv4, and add a case to the `ipKey` test table.

