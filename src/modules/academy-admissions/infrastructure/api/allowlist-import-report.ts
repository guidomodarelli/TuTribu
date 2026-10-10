/** Serializes authorized own rows as inert CSV without provider or storage metadata. @module allowlist-import-report */
import type { AllowlistImportDto } from "../../application/results/admission-management-result-schemas";
import { ALLOWLIST_CSV_HEADER, ALLOWLIST_CSV_CHARACTER as CHARACTER, ALLOWLIST_IMPORT_REPORT_HEADER, ALLOWLIST_IMPORT_REPORT_LINE_END, ALLOWLIST_IMPORT_REPORT_FORMULA_PATTERN, ALLOWLIST_IMPORT_REPORT_TEXT_PREFIX, ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL, ALLOWLIST_IMPORT_REPORT_ERROR_LABEL } from "../../constants/allowlist-import";
/** @returns A blank file template with only the fixed input header. */
export function createAllowlistImportTemplate(): string { return ALLOWLIST_CSV_HEADER.join(CHARACTER.separator) + ALLOWLIST_IMPORT_REPORT_LINE_END; }
/** @param value - Inert own cell value. @returns One quoted cell with safe text prefix for formula/control starters and escaped delimiters. */
function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = ALLOWLIST_IMPORT_REPORT_FORMULA_PATTERN.test(text) ? ALLOWLIST_IMPORT_REPORT_TEXT_PREFIX + text : text;
  return CHARACTER.quote + safe.replaceAll(CHARACTER.quote, CHARACTER.quote + CHARACTER.quote) + CHARACTER.quote;
}
/** @param preview - Current authorized own import DTO. @returns Neutralized CSV data for a human-readable report. */
export function renderAllowlistImportReport(preview: AllowlistImportDto): string {
  const lines = [ALLOWLIST_IMPORT_REPORT_HEADER.map(cell).join(CHARACTER.separator)];
  for (const row of preview.rows) lines.push([row.rowNumber, row.identity, row.displayName, row.outcome ? ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL[row.outcome] : ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL.pending, row.errors.map((error) => ALLOWLIST_IMPORT_REPORT_ERROR_LABEL[error]).join("; "), row.version].map(cell).join(CHARACTER.separator));
  return lines.join(ALLOWLIST_IMPORT_REPORT_LINE_END) + ALLOWLIST_IMPORT_REPORT_LINE_END;
}
