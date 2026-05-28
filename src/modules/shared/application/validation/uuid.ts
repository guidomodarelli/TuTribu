const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Normalizes a UUID-shaped identifier for application commands that reach database UUID casts.
 *
 * @param value - Raw identifier value.
 * @returns Trimmed UUID value, or null when the input is missing or malformed.
 */
export function normalizeUuid(value: string | undefined): string | null {
  const trimmedValue = value?.trim() ?? "";

  return UUID_PATTERN.test(trimmedValue) ? trimmedValue : null;
}
