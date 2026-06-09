/**
 * Pure file-size formatting helper shared by attachment UIs. Framework-safe:
 * no React, no platform APIs beyond `Intl`, so it can run on the server and
 * the client alike.
 */

const BYTES_PER_UNIT_STEP = 1024;
const FILE_SIZE_UNIT_LABELS = ["B", "KB", "MB", "GB", "TB"] as const;
const FILE_SIZE_LOCALE = "es-AR";
const SUB_UNIT_FRACTION_DIGITS = 0;
const SCALED_UNIT_FRACTION_DIGITS = 1;

/**
 * Formats a byte count as a short human-readable size in es-AR style
 * (comma decimal separator), e.g. `12,3 MB`, `850 KB`, `25 MB`.
 *
 * @param bytes - Raw size in bytes. Non-finite or negative values render as `0 B`.
 * @returns The formatted size with its unit, separated by a space.
 */
export function formatFileSize(bytes: number): string {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;

  let scaledValue = safeBytes;
  let unitIndex = 0;
  while (
    scaledValue >= BYTES_PER_UNIT_STEP &&
    unitIndex < FILE_SIZE_UNIT_LABELS.length - 1
  ) {
    scaledValue /= BYTES_PER_UNIT_STEP;
    unitIndex += 1;
  }

  const formattedValue = new Intl.NumberFormat(FILE_SIZE_LOCALE, {
    maximumFractionDigits:
      unitIndex === 0 ? SUB_UNIT_FRACTION_DIGITS : SCALED_UNIT_FRACTION_DIGITS,
  }).format(scaledValue);

  return `${formattedValue} ${FILE_SIZE_UNIT_LABELS[unitIndex]}`;
}
