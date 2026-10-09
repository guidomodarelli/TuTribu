/** Projects private previews to the own leader contract without actor, fingerprint or binding metadata. @module allowlist-import-result */
import type { AllowlistImport } from "../../domain/entities/allowlist-import";
import { allowlistImportSchema, type AllowlistImportDto } from "./admission-management-result-schemas";
import { ADMISSION_IMPORT_ROW_OUTCOME } from "../../constants/admission-management-contract";
/** @param preview - Current authorized private snapshot. @returns Safe own preview DTO and genuinely confirmed counts. */
export function presentAllowlistImport(preview: AllowlistImport): AllowlistImportDto {
  const counts: AllowlistImportDto["counts"] = { selected: 0, added: 0, unchanged: 0, skipped: 0, conflict: 0 };
  const rows = preview.rows.map((row) => {
    if (row.selected) counts.selected += 1;
    if (row.outcome !== null) counts[row.outcome] += 1;
    return { rowNumber: row.rowNumber, identity: row.input.identity, displayName: row.input.displayName, selected: row.selected, errors: row.errors, ...(row.outcome !== null ? { outcome: row.outcome } : {}), ...(row.outcome === ADMISSION_IMPORT_ROW_OUTCOME.added || row.outcome === ADMISSION_IMPORT_ROW_OUTCOME.unchanged ? { version: row.entryVersion } : {}) };
  });
  return allowlistImportSchema.parse({ importId: preview.id, sourceVersion: preview.version, state: preview.state, expiresAt: preview.expiresAt.toISOString(), rows, counts });
}
