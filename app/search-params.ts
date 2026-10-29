/**
 * Readers of Next.js page search params shared by the app pages.
 *
 * @module search-params
 */

/** Raw value of one page search param as Next.js hands it over. */
export type SearchParamValue = string | string[] | undefined;

/**
 * Reads the first usable value of a search param: the string itself, or the
 * first non-blank entry of a repeated param.
 *
 * @param searchParamValue - Raw search param value.
 * @returns The value, or `null` when the param is missing or blank.
 */
export function readFirstSearchParamValue(searchParamValue: SearchParamValue): string | null {
  if (typeof searchParamValue === "string") {
    return searchParamValue;
  }

  if (Array.isArray(searchParamValue)) {
    const firstStringValue = searchParamValue.find((value) => value.trim().length > 0);

    return firstStringValue ?? null;
  }

  return null;
}
