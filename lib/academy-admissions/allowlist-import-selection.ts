/** Names which preview rows the leader can choose to import, one by one or all at once. @module allowlist-import-selection */
import type { AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";

/** One row of a saved import preview. */
type AllowlistImportRow = AllowlistImportDto["rows"][number];

/** @param row - Preview row. @returns Whether it is valid and still has no result, which is the only kind of row a confirmation may include. */
export function isSelectableAllowlistImportRow(row: AllowlistImportRow): boolean {
  return row.errors.length === 0 && row.outcome === undefined;
}

/** @param rows - Every row of the preview. @returns The numbers of all valid rows without a result, in file order. */
export function listSelectableAllowlistImportRows(rows: readonly AllowlistImportRow[]): number[] {
  return rows.filter(isSelectableAllowlistImportRow).map((row) => row.rowNumber).sort((left, right) => left - right);
}
