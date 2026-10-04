# Modal and Drawer focus constraints and menu restoration diagnosis

Every production-reachable Modal or Drawer must establish its own initial focus on every opening. Reading overlays focus their heading without adding it to the normal Tab order; action-oriented overlays focus a control with appropriate semantics. Child overlays must not rely on a parent to establish initial focus. Preserve the pending-message Drawer's existing heading, designated-group, and editor restoration semantics.

For new or modified entrypoints, verify initial focus, containment, close restoration, and reopening through real component behavior. Overlays containing menus also need menu restoration and layered Escape coverage. Cancelling a menu, including with Escape, restores its surviving trigger. Successful business operations preserve their existing designated restoration target, such as the moved message group after reordering pending messages. When an operation removes its trigger, verify the corresponding business focus target rather than requiring focus on a deleted node. Preserve HeroUI/React Aria ARIA, containment, and restoration responsibilities; do not add a global forced-restoration owner or universal wrapper. The presence of `autoFocus` does not replace behavior verification.

## Known race and evidence entrypoints

The three historical issues below confirmed the same mechanism: focus briefly falls to BODY after menu unmount; React Aria `useDialog`'s delayed refocus takes focus into the outer dialog first. On the next frame, the menu's `FocusScope` sees that focus is no longer on BODY and skips trigger restoration. Historical diagnosis identified an approximately 500ms timeout in React Aria 3.50.0. Verify the currently installed version and implementation separately; the lockfile alone is insufficient.

| Historical issue | Initial focus fix | Effective Browser regression entrypoint |
| --- | --- | --- |
| [#17 Pending-message Drawer](https://cnb.cool/jiangshengdev/codex/-/issues/17) | `fb8ac3e91`, synchronous heading focus, preserving designated-group and editor behavior | `moves pending messages through the authoritative owner and preserves menu and item focus` in `ComposerTurnControlPendingInputReordering.browser.test.tsx`; `ComposerPendingInputInitialFocus.browser.test.tsx` retains real animation, keyboard, and narrow-screen coverage |
| [#18 Navigation Drawer](https://cnb.cool/jiangshengdev/codex/-/issues/18) | `4926a8598`, initial focus on the close button | `Escape restores task actions focus when dialog timers run before menu focus restoration` in `ActiveThreadCollectionMenu.browser.test.tsx` |
| [#217 Fullscreen table Modal](https://cnb.cool/jiangshengdev/codex/-/issues/217) | `9cdc7851a`, initial focus on the close button | `restores fullscreen copy focus when dialog timers run before menu focus restoration` in `MarkdownTableControls.browser.test.tsx` |

All three race regressions use `src/__tests__/dialogMenuFocusRace.ts`: control only timeout timers before opening the overlay, advance 500ms in the MutationObserver observing real menu unmount, and preserve real `requestAnimationFrame` and FocusScope restoration. Observe actual focus, menu unmount, and operation results. The helper checks that the race window was exercised and disconnects the observer and restores real timers in finally. Consumers verify their own business targets; the helper does not call `focus()` to simulate success.

## Minimal diagnosis path

When a menu has closed but focus remains in the outer dialog, check the historical mechanism first and collect evidence in this order to determine whether the cause matches:

1. Determine whether the menu is unmounted, running an exit animation, or still mounted. Record `document.activeElement` between menu close and the next frame to verify whether focus briefly falls to BODY. If the menu remains mounted, investigate the close flow first.
2. Verify the actual initial focus target for this opening and whether focus was established before the dialog's delayed fallback. Preserve existing designated-group and editor rules; do not merely search for `autoFocus`.
3. Check the HeroUI and React Aria versions actually resolved by this run and their `useDialog`/`FocusScope` implementations. The lockfile, source checkout, and runtime installation may differ. Also verify that the acceptance service provides current source.
4. Within the authorized diagnosis boundary, collect `focus()` call stacks and focus-event timing to determine whether the dialog timeout takes focus before the menu's real restoration frame. Start with one affected regression rather than a large delay scan.

Apply the known root-cause fix only after menu unmount, focus state, version, and call stacks agree, and obtain causal evidence of failure before the fix and success afterward. If evidence conflicts, broaden investigation along the real close flow, overlay hierarchy, trigger lifetime, and business restoration path. Similar symptoms do not establish a shared cause; repeated green tests do not replace causal evidence.

Do not hide failures by adding sleeps, retries, longer timeouts, or concurrency changes; preserve assertions and checking capability. Verify affected complete files with the required three-browser coverage and project checks. Reuse valid results when there are no new changes or unresolved evidence. Browser/Storybook verification is Level 1; headless interaction acceptance against the real Codex runtime's current route and state is Level 2. Record them separately. Historical acceptance cannot replace evidence required for the current final integration state.
