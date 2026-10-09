/** Defines exact allowlist contact identity and proposes versioned configuration changes without binding accounts. @module allowlist-entry */
import { ALLOWLIST_ENTRY_SOURCE, ALLOWLIST_ENTRY_STATUS } from "../../constants/admission-resources";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { AdmissionOperationError } from "../errors/admission-operation-error";
import { normalizeAdmissionContact, type AdmissionContact, type AdmissionContactType } from "../value-objects/admission-contact";
import { normalizeAllowlistDisplayName } from "../value-objects/allowlist-display-name";

/** Contains configuration identity only; ownership bindings, fingerprints and memberships have separate owners. */
export type AllowlistEntry = {
  id: string;
  tribeId: string;
  contact: AdmissionContact;
  displayName: string | null;
  status: "enabled" | "disabled";
  version: number;
  source: "manual" | "csv";
  importId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** An existing contact and its provenance are immutable; only explanatory name and enabled state are editable. */
export type AllowlistEntryPatch = { displayName?: string | null; status?: AllowlistEntry["status"] };

/**
 * Creates a server-owned version-one entry while retaining email aliases and a canonical phone country.
 * @param input - Server-assigned identity, actor, clock and source plus the proposed contact/name.
 * @returns Enabled configuration with no contact reservation, account binding or membership effect.
 * @throws AdmissionOperationError when contact, name or import provenance is unusable.
 */
export function createAllowlistEntry(input: {
  id: string; tribeId: string; actorUserId: string; now: Date;
  contact: { type: AdmissionContactType; value: string; country?: string };
  displayName?: string | null; source: AllowlistEntry["source"]; importId?: string | null;
}): AllowlistEntry {
  const normalized = normalizeAdmissionContact(input.contact), importId = input.importId ?? null;
  if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid || (input.source === ALLOWLIST_ENTRY_SOURCE.csv ? !importId : importId !== null)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return { id: input.id, tribeId: input.tribeId, contact: normalized.contact, displayName: normalizeAllowlistDisplayName(input.displayName), status: ALLOWLIST_ENTRY_STATUS.enabled, version: 1, source: input.source, importId, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId, createdAt: input.now, updatedAt: input.now };
}

/** A stale proposal cannot be a no-op; the writer applies the accepted proposal under its resource lock. */
export type AllowlistEntryChange = { ok: true; changed: boolean; entry: AllowlistEntry } | { ok: false; code: "allowlist_conflict" | "invalid_input" };

/**
 * Proposes a single effective name/status change after checking the observed configuration version.
 * @param input - Locked current entry, explicit patch, observed version and server-owned actor/clock.
 * @returns Original entry for a current no-op, one version increment for a change or a closed denial.
 */
export function proposeAllowlistEntryChange(input: { entry: AllowlistEntry; patch: AllowlistEntryPatch; expectedVersion: number; actorUserId: string; now: Date }): AllowlistEntryChange {
  const { entry, patch, expectedVersion } = input;
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0 || patch.displayName === undefined && patch.status === undefined) return { ok: false, code: ADMISSION_ERROR_CODE.invalidInput };
  if (entry.version !== expectedVersion) return { ok: false, code: ADMISSION_ERROR_CODE.allowlistConflict };
  let displayName: string | null;
  try { displayName = patch.displayName === undefined ? entry.displayName : normalizeAllowlistDisplayName(patch.displayName); }
  catch (error) { if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.invalidInput) return { ok: false, code: error.code }; throw error; }
  const status = patch.status ?? entry.status;
  if (displayName === entry.displayName && status === entry.status) return { ok: true, changed: false, entry };
  return { ok: true, changed: true, entry: { ...entry, displayName, status, version: entry.version + 1, updatedByUserId: input.actorUserId, updatedAt: input.now } };
}
