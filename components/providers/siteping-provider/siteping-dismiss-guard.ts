/**
 * Keeps the Siteping feedback widget usable on top of any open Radix overlay.
 *
 * Radix overlays (the base of shadcn Dialog, AlertDialog, Sheet, Popover,
 * DropdownMenu, Select, ContextMenu, etc.) fight Siteping in two ways while a
 * modal is open, because Siteping's surfaces live outside the overlay's React
 * subtree (the FAB inside a closed-shadow `<siteping-widget>`, and the panel,
 * annotation overlay and toolbar as `<body>` children):
 *
 * 1. `DismissableLayer` closes the overlay on any pointer-down or focus change
 *    "outside" it — so interacting with Siteping would dismiss the modal the
 *    user is trying to report about.
 * 2. `FocusScope` (trapped while a modal Dialog is open) yanks focus back into
 *    the dialog whenever focus lands on a node outside it — so the user cannot
 *    focus Siteping's comment textarea.
 *
 * This guard neutralizes both at the document event level, scoped strictly to
 * Siteping-owned targets:
 *
 * - For dismissal it uses Radix's public cancellation contract: `DismissableLayer`
 *   dispatches a cancelable custom event before dismissing and only proceeds when
 *   it was not `preventDefault`-ed.
 * - `FocusScope` exposes no such contract, so its refocus is suppressed by
 *   stopping the native `focusin`/`focusout` in the capture phase before Radix's
 *   bubble-phase document listener runs. The element keeps the focus it already
 *   received natively; only Radix's reaction is blocked.
 */

/**
 * Cancelable custom events Radix `DismissableLayer` dispatches on the
 * interaction target right before it would dismiss the layer.
 */
const RADIX_DISMISS_EVENT_NAMES = [
  "dismissableLayer.pointerDownOutside",
  "dismissableLayer.focusOutside",
] as const;

/**
 * Native focus events Radix `FocusScope` listens to (bubble phase) to refocus
 * the trapped dialog. The incoming focus target is `target` for `focusin` and
 * `relatedTarget` for `focusout`.
 */
const FOCUS_IN_EVENT_NAME = "focusin";
const FOCUS_OUT_EVENT_NAME = "focusout";
const FOCUS_TRAP_EVENT_NAMES = [FOCUS_IN_EVENT_NAME, FOCUS_OUT_EVENT_NAME] as const;

/** Tag name of the Siteping widget host element (`<siteping-widget>`). */
const SITEPING_WIDGET_TAG_NAME = "SITEPING-WIDGET";

/** Attribute Siteping sets on its own surfaces to mark them as ignorable. */
const SITEPING_IGNORE_ATTRIBUTE = "data-siteping-ignore";
const SITEPING_IGNORE_ATTRIBUTE_VALUE = "true";

/** Selector matching any node flagged by Siteping as ignorable (e.g. the panel). */
const SITEPING_IGNORE_SELECTOR = `[${SITEPING_IGNORE_ATTRIBUTE}="${SITEPING_IGNORE_ATTRIBUTE_VALUE}"]`;

/**
 * Max z-index values Siteping stamps inline on its body-level surfaces (the
 * annotation overlay, the instruction toolbar and the feedback panel). These
 * `<body>` children carry no class or id we control, so the inline z-index is
 * the only stable signal that an interaction landed on one of them. Matching
 * them lets the guard keep a modal open while the user draws an annotation.
 */
const SITEPING_SURFACE_Z_INDEXES = ["2147483647", "2147483646"] as const;
const SITEPING_SURFACE_SELECTOR = SITEPING_SURFACE_Z_INDEXES.map(
  (zIndex) => `[style*="${zIndex}"]`
).join(",");

/**
 * Determines whether an event target belongs to the Siteping widget: the
 * shadow-root host (`<siteping-widget>`), a node flagged with
 * `data-siteping-ignore`, or one of Siteping's body-level annotation surfaces
 * (overlay/toolbar) identified by their inline max z-index.
 *
 * @param target - The event target reported by a Radix dismissal event.
 * @returns `true` when the interaction originated from Siteping.
 */
function isSitepingOwnedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target.tagName === SITEPING_WIDGET_TAG_NAME ||
    target.closest(SITEPING_WIDGET_TAG_NAME.toLowerCase()) !== null ||
    target.closest(SITEPING_IGNORE_SELECTOR) !== null
  ) {
    return true;
  }

  const bodyLevelSurface = target.closest(SITEPING_SURFACE_SELECTOR);
  return (
    bodyLevelSurface !== null &&
    bodyLevelSurface.parentElement === target.ownerDocument.body
  );
}

/**
 * Installs the guard that prevents Radix overlays from dismissing when the user
 * interacts with the Siteping widget.
 *
 * @param ownerDocument - Document to attach the listeners to. Defaults to the
 *   global `document`; injectable for testing.
 * @returns A cleanup function that removes the installed listeners.
 */
export function installSitepingDismissGuard(
  ownerDocument: Document = document
): () => void {
  const cancelDismissalForSiteping = (event: Event): void => {
    if (isSitepingOwnedTarget(event.target)) {
      event.preventDefault();
    }
  };

  const releaseFocusTrapForSiteping = (event: Event): void => {
    const { type, target, relatedTarget } = event as FocusEvent;
    const incomingFocusTarget =
      type === FOCUS_OUT_EVENT_NAME ? relatedTarget : target;
    if (isSitepingOwnedTarget(incomingFocusTarget)) {
      event.stopImmediatePropagation();
    }
  };

  // Both run in the capture phase: the dismissal guard so it sets
  // `defaultPrevented` before Radix's target-phase handler reads it; the focus
  // guard so it stops the event before Radix's bubble-phase document listener.
  const registrations: ReadonlyArray<readonly [string, (event: Event) => void]> =
    [
      ...RADIX_DISMISS_EVENT_NAMES.map(
        (eventName) => [eventName, cancelDismissalForSiteping] as const
      ),
      ...FOCUS_TRAP_EVENT_NAMES.map(
        (eventName) => [eventName, releaseFocusTrapForSiteping] as const
      ),
    ];

  for (const [eventName, handler] of registrations) {
    ownerDocument.addEventListener(eventName, handler, true);
  }

  return () => {
    for (const [eventName, handler] of registrations) {
      ownerDocument.removeEventListener(eventName, handler, true);
    }
  };
}
