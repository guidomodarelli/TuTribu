/**
 * Works around a SitePing UX bug: ending annotation mode leaves its comment form
 * orphaned on screen.
 *
 * When the user draws an annotation, SitePing opens a comment form (type
 * selector + textarea + discard/submit) AND keeps the annotation toolbar
 * visible. Clicking the toolbar's "Cancelar" (or pressing Escape) deactivates
 * annotation mode but does NOT close that form, so it stays floating with no
 * annotation behind it. Submitting is fine — SitePing closes the form before
 * the annotation ends — so only the cancel/escape paths orphan the form.
 *
 * Wired to the widget's `onAnnotationEnd` callback, this dismisses the form by
 * triggering its own discard control. On submit the form is already closed by
 * the time `onAnnotationEnd` fires, so the visibility guard makes this a no-op
 * and it never cancels an in-flight submission.
 */

/** Marker SitePing sets on its feedback panel (the comment form root). */
const SITEPING_PANEL_SELECTOR = '[data-siteping-ignore="true"]';

/** A panel is the comment form (not the list panel) when it owns a textarea. */
const COMMENT_TEXTAREA_SELECTOR = "textarea";

/** Form action controls, laid out as [...type buttons, discard, submit]. */
const FORM_BUTTON_SELECTOR = "button";

/** `display` value SitePing uses to keep the form mounted but hidden. */
const HIDDEN_DISPLAY_VALUE = "none";

/** Offset from the end of the button list to the discard ("Cancelar") control. */
const DISCARD_BUTTON_OFFSET_FROM_END = 2;

/**
 * Closes the SitePing annotation comment form if it is currently open.
 *
 * @param ownerDocument - Document to search. Defaults to the global `document`;
 *   injectable for testing.
 */
export function dismissOpenSitepingCommentForm(
  ownerDocument: Document = document
): void {
  const view = ownerDocument.defaultView;

  const openCommentForm = Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(SITEPING_PANEL_SELECTOR)
  ).find((panel) => {
    const isCommentForm =
      panel.querySelector(COMMENT_TEXTAREA_SELECTOR) !== null;
    const isVisible =
      !view || view.getComputedStyle(panel).display !== HIDDEN_DISPLAY_VALUE;
    return isCommentForm && isVisible;
  });

  if (!openCommentForm) {
    return;
  }

  const actionButtons = openCommentForm.querySelectorAll<HTMLButtonElement>(
    FORM_BUTTON_SELECTOR
  );
  const discardButton =
    actionButtons[actionButtons.length - DISCARD_BUTTON_OFFSET_FROM_END];
  discardButton?.click();
}
