/**
 * Trims user-entered text before it reaches a repository.
 *
 * @param value - Raw text.
 * @returns The text without surrounding whitespace.
 */
export function normalizeText(value: string): string {
  return value.trim();
}

/**
 * Trims optional user-entered text, treating blank text as absent.
 *
 * @param value - Raw text, or null.
 * @returns The trimmed text, or null when it is missing or blank.
 */
export function normalizeNullableText(value: string | null): string | null {
  const normalizedValue = value?.trim() ?? "";

  return normalizedValue.length > 0 ? normalizedValue : null;
}
