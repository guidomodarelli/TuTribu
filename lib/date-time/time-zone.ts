/** Recognizes IANA time zone names with the runtime's own time zone data. @module time-zone */

/**
 * @param value - Candidate IANA name, such as `America/Argentina/Buenos_Aires`.
 * @returns Whether the runtime knows the zone; an unknown name makes `Intl.DateTimeFormat` throw a `RangeError`.
 */
export function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}
