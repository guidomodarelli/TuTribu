import type { MouseEvent } from "react";

/** `MouseEvent.button` of the main (usually left) button. */
const PRIMARY_MOUSE_BUTTON = 0;

/**
 * Tells whether a link click can be handled inside the current page: a plain
 * primary-button click not already handled. Modified clicks (new tab, new
 * window, download) and other buttons must fall through to the browser so the
 * link stays openable on its own.
 *
 * @param event - Click on an anchor.
 * @returns `true` when the page may take over the navigation.
 */
export function isInPageLinkClick(
  event: MouseEvent<HTMLAnchorElement>
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === PRIMARY_MOUSE_BUTTON &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
