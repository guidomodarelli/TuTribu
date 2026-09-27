/** Navigation Timing type of a document reached with Back or Forward. */
const BACK_FORWARD_NAVIGATION_TYPE = "back_forward";
/** `TYPE_BACK_FORWARD` of the legacy `performance.navigation` API (older WebKit). */
const LEGACY_BACK_FORWARD_NAVIGATION_TYPE = 2;

export function reloadCurrentPage(): void {
  window.location.reload();
}

export function navigateToUrl(url: string): void {
  window.location.href = url;
}

/**
 * Loads `url` as a full document and replaces the current history entry, so
 * Back cannot return to the page being left. A full load also drops the
 * client router cache and in-memory state, which is what a change of the
 * authentication state (such as signing out) requires.
 *
 * @param url - Same-origin path or absolute URL to load.
 */
export function replaceCurrentPageWithUrl(url: string): void {
  window.location.replace(url);
}

/**
 * Sets (or removes, with `null`) query parameters of the current URL in a
 * single `history.replaceState`, which the Next.js router tracks, so the
 * address bar reflects UI state without a navigation or a history entry.
 * Parameters not listed keep their current value, as do the path and hash.
 *
 * @param searchParams - New value per query parameter name, or null to remove it.
 */
export function replaceCurrentUrlSearchParams(
  searchParams: Readonly<Record<string, string | null>>
): void {
  const url = new URL(window.location.href);

  for (const [name, value] of Object.entries(searchParams)) {
    if (value === null) {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
  }

  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/**
 * Replaces every value of one repeatable query parameter of the current URL
 * (an empty list removes it) through `history.replaceState`, like
 * {@link replaceCurrentUrlSearchParams}.
 *
 * @param name - Query parameter name.
 * @param values - New values, in order.
 */
export function replaceCurrentUrlSearchParamValues(
  name: string,
  values: readonly string[]
): void {
  const url = new URL(window.location.href);

  url.searchParams.delete(name);

  for (const value of values) {
    url.searchParams.append(name, value);
  }

  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/**
 * Tells whether the current document was loaded through Back or Forward. Uses
 * Navigation Timing Level 2 when available and falls back to the legacy
 * `performance.navigation` API for older WebKit; without either it reports
 * `false`.
 *
 * @returns Whether the document load came from the history traversal.
 */
export function isBackForwardDocumentLoad(): boolean {
  if (typeof performance.getEntriesByType === "function") {
    const [navigationEntry] = performance.getEntriesByType("navigation");

    if (navigationEntry && "type" in navigationEntry) {
      return navigationEntry.type === BACK_FORWARD_NAVIGATION_TYPE;
    }
  }

  return (
    performance.navigation?.type === LEGACY_BACK_FORWARD_NAVIGATION_TYPE
  );
}
