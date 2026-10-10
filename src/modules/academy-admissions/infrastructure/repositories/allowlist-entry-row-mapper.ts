/** Maps consumed PostgreSQL list columns into the owning domain entity without row schema validation. @module allowlist-entry-row-mapper */
import type { AllowlistEntry } from "../../domain/entities/allowlist-entry";
import { normalizeAdmissionContact } from "../../domain/value-objects/admission-contact";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { ALLOWLIST_ENTRY_SOURCE } from "../../constants/admission-resources";
import { ALLOWLIST_DATABASE_ORIGIN } from "../../constants/allowlist-management";

/** Contains consumed storage fields only, excluding the protected fingerprint material. */
export type AllowlistEntryRow = { id: string; tribe_id: string; contact_type: "email" | "phone"; normalized_contact: string; display_name: string | null; status: "enabled" | "disabled"; version: number; origin: "manual" | "import"; import_id: string | null; created_by_user_id: string | null; updated_by_user_id: string | null; created_at: Date | string; updated_at: Date | string };

/** @param row - Authorized scoped PostgreSQL columns. @returns Own canonical contact and configuration. @throws AdmissionOperationError when a stored contact cannot supply its required domain representation. */
export function mapAllowlistEntryRow(row: AllowlistEntryRow): AllowlistEntry {
  const normalized = normalizeAdmissionContact({ type: row.contact_type, value: row.normalized_contact });
  if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  return { id: row.id, tribeId: row.tribe_id, contact: normalized.contact, displayName: row.display_name, status: row.status, version: row.version, source: row.origin === ALLOWLIST_DATABASE_ORIGIN.csv ? ALLOWLIST_ENTRY_SOURCE.csv : ALLOWLIST_ENTRY_SOURCE.manual, importId: row.import_id, createdByUserId: row.created_by_user_id, updatedByUserId: row.updated_by_user_id, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}
