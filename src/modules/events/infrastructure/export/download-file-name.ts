const FILE_NAME_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const FILE_NAME_INVALID_PATTERN = /[^a-z0-9-]+/g;
const FILE_NAME_SEPARATOR = "-";
const FILE_NAME_MAX_LENGTH = 60;

/**
 * Turns an event title into a safe, ASCII-only file name segment for
 * `Content-Disposition` downloads (ICS and CSV exports).
 *
 * @param title - Event title as typed by a manager.
 * @returns Lowercase kebab-case slug without diacritics, possibly empty when
 * the title has no usable characters (callers provide a fallback).
 */
export function slugifyDownloadFileName(title: string): string {
  const separated = title
    .normalize("NFD")
    .replace(FILE_NAME_DIACRITICS_PATTERN, "")
    .toLowerCase()
    .replace(FILE_NAME_INVALID_PATTERN, FILE_NAME_SEPARATOR);

  return trimFileNameSeparators(separated).slice(0, FILE_NAME_MAX_LENGTH);
}

/**
 * Drops leading and trailing separators in linear time (an anchored `-+$`
 * pattern backtracks on long runs of separators).
 *
 * @param value - Slug that may start or end with separators.
 * @returns The slug without separators at either end.
 */
function trimFileNameSeparators(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value.startsWith(FILE_NAME_SEPARATOR, start)) {
    start += 1;
  }

  while (end > start && value.endsWith(FILE_NAME_SEPARATOR, end)) {
    end -= 1;
  }

  return value.slice(start, end);
}
