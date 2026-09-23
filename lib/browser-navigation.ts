export function reloadCurrentPage(): void {
  window.location.reload();
}

export function navigateToUrl(url: string): void {
  window.location.href = url;
}

/**
 * Sets (or removes, with `null`) one query parameter of the current URL
 * through `history.replaceState`, which the Next.js router tracks, so the
 * address bar reflects UI state without a navigation or a history entry.
 *
 * @param name - Query parameter name.
 * @param value - New value, or null to remove the parameter.
 */
export function replaceCurrentUrlSearchParam(name: string, value: string | null): void {
  const url = new URL(window.location.href);

  if (value === null) {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, value);
  }

  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/**
 * Replaces every value of one repeatable query parameter of the current URL
 * (an empty list removes it) through `history.replaceState`, like
 * {@link replaceCurrentUrlSearchParam}.
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
