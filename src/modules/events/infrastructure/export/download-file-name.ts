const FILE_NAME_DIACRITICS_PATTERN = /[̀-ͯ]/g;
const FILE_NAME_INVALID_PATTERN = /[^a-z0-9-]+/g;
const FILE_NAME_TRIM_PATTERN = /^-+|-+$/g;
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
  return title
    .normalize("NFD")
    .replace(FILE_NAME_DIACRITICS_PATTERN, "")
    .toLowerCase()
    .replace(FILE_NAME_INVALID_PATTERN, FILE_NAME_SEPARATOR)
    .replace(FILE_NAME_TRIM_PATTERN, "")
    .slice(0, FILE_NAME_MAX_LENGTH);
}
