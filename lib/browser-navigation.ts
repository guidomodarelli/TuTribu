export function reloadCurrentPage(): void {
  window.location.reload();
}

export function navigateToUrl(url: string): void {
  window.location.href = url;
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
