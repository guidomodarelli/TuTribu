/** Models private temporary previews without granting contact identity or creating list entries. @module allowlist-import */
import { normalizeAdmissionContact, type AdmissionContact, type AdmissionContactType } from "../value-objects/admission-contact";
import { normalizeAllowlistDisplayName } from "../value-objects/allowlist-display-name";
import { AdmissionOperationError } from "../errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ADMISSION_INPUT_CATEGORY } from "../../constants/admission-resources";
import { ADMISSION_CONTACT_ERROR, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { ADMISSION_IMPORT_PUBLIC_STATE, ADMISSION_IMPORT_ROW_OUTCOME } from "../../constants/admission-management-contract";

/** Describes one parsed logical record before domain validation, without caller authority. */
export type AllowlistImportInputRow = { rowNumber: number; identity: string; displayName: string };
/** Separates inert input, validation, explicit selection and genuinely committed outcomes. */
export type AllowlistImportRow = {
  rowNumber: number; input: AllowlistImportInputRow; contact: AdmissionContact | null; displayName: string | null;
  errors: (typeof ADMISSION_INPUT_CATEGORY)[keyof typeof ADMISSION_INPUT_CATEGORY][]; duplicateOf: number | null;
  selected: boolean; outcome: typeof ADMISSION_IMPORT_ROW_OUTCOME[keyof typeof ADMISSION_IMPORT_ROW_OUTCOME] | null;
  entryId: string | null; entryVersion: number | null; committedAt: Date | null;
};
/** Keeps fingerprints and actor scope private; a public projection must omit them. */
export type AllowlistImport = {
  id: string; tribeId: string; actorUserId: string; policyVersion: number; contactType: AdmissionContactType;
  fingerprintKeyId: string; fileFingerprint: Uint8Array; version: number;
  state: typeof ADMISSION_IMPORT_PUBLIC_STATE[keyof typeof ADMISSION_IMPORT_PUBLIC_STATE];
  createdAt: Date; expiresAt: Date; purgeAfter: Date; rows: AllowlistImportRow[];
};

/** @param rows - Parsed file records retaining inert originals. @param contactType - Server-selected policy contact kind. @returns Unselected rows with per-record errors and first eligible duplicate references, never entries or bindings. @throws AdmissionOperationError for invalid logical row identity/capacity; unexpected normalizer failures remain failures. */
export function prepareAllowlistImportRows(rows: readonly AllowlistImportInputRow[], contactType: AdmissionContactType): AllowlistImportRow[] {
  if (rows.length > ADMISSION_LIMIT.csvDataRowCount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const firstEligibleContacts = new Map<string, number>();
  return rows.map((input, index) => {
    if (input.rowNumber !== index + 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const errors: AllowlistImportRow["errors"] = [], normalized = normalizeAdmissionContact({ type: contactType, value: input.identity });
    const contact = normalized.status === ADMISSION_CONTACT_NORMALIZATION_STATUS.valid ? normalized.contact : null;
    if (normalized.status === ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid) errors.push(normalized.reason === ADMISSION_CONTACT_ERROR.countryRequired || normalized.reason === ADMISSION_CONTACT_ERROR.countryMismatch ? ADMISSION_INPUT_CATEGORY.country : ADMISSION_INPUT_CATEGORY.contact);
    let displayName: string | null = null;
    try { displayName = normalizeAllowlistDisplayName(input.displayName); }
    catch (error) { if (!(error instanceof AdmissionOperationError) || error.code !== ADMISSION_ERROR_CODE.invalidInput) throw error; errors.push(ADMISSION_INPUT_CATEGORY.name); }
    let duplicateOf: number | null = null;
    if (contact && errors.length === 0) {
      duplicateOf = firstEligibleContacts.get(contact.value) ?? null;
      if (duplicateOf !== null) errors.push(ADMISSION_INPUT_CATEGORY.duplicateContact);
      else firstEligibleContacts.set(contact.value, input.rowNumber);
    }
    return { rowNumber: input.rowNumber, input: { ...input }, contact, displayName, errors, duplicateOf, selected: false, outcome: null, entryId: null, entryVersion: null, committedAt: null };
  });
}

/** @param input - Server-assigned scope, protected file reference, clock and parsed records. @returns Version-one temporary preview with no selected rows or confirmed effects. @throws AdmissionOperationError for unusable scope/version/time or absent protected file reference. */
export function createAllowlistImport(input: { id: string; tribeId: string; actorUserId: string; policyVersion: number; contactType: AdmissionContactType; fingerprintKeyId: string; fileFingerprint: Uint8Array; now: Date; rows: readonly AllowlistImportInputRow[] }): AllowlistImport {
  if (![input.id, input.tribeId, input.actorUserId, input.fingerprintKeyId].every((value) => value.trim()) || !Number.isInteger(input.policyVersion) || input.policyVersion <= 0 || !Number.isFinite(input.now.getTime()) || input.fileFingerprint.byteLength === 0) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const createdAt = new Date(input.now), expiresAt = new Date(createdAt.getTime() + ADMISSION_LIMIT.csvRetentionMs);
  return { id: input.id, tribeId: input.tribeId, actorUserId: input.actorUserId, policyVersion: input.policyVersion, contactType: input.contactType, fingerprintKeyId: input.fingerprintKeyId, fileFingerprint: Uint8Array.from(input.fileFingerprint), version: 1, state: ADMISSION_IMPORT_PUBLIC_STATE.preview, createdAt, expiresAt, purgeAfter: new Date(expiresAt), rows: prepareAllowlistImportRows(input.rows, input.contactType) };
}

/** Carries current server authority without accepting actor or policy facts from the file. */
export type AllowlistImportContext = { actorUserId: string; tribeId: string; policyVersion: number; contactType: AdmissionContactType; now: Date };
/** Represents an original row outcome supplied only by the persistence owner after confirmed work. */
export type AllowlistImportRowOutcome = { rowNumber: number; outcome: NonNullable<AllowlistImportRow["outcome"]>; entryId: string | null; entryVersion: number | null; committedAt: Date };
/** @param preview - Private original preview. @param context - Fresh server-owned actor/policy/time. @param expectedVersion - Observed positive version. @returns After enforcing access, lifetime, policy and CAS. @throws AdmissionOperationError for lost scope, expiry, policy change or stale version. */
function assertImportCurrent(preview: AllowlistImport, context: AllowlistImportContext, expectedVersion: number): void {
  if (context.actorUserId !== preview.actorUserId || context.tribeId !== preview.tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  if (!Number.isFinite(context.now.getTime()) || context.now < preview.createdAt || context.now >= preview.expiresAt || preview.state === ADMISSION_IMPORT_PUBLIC_STATE.cancelled || preview.state === ADMISSION_IMPORT_PUBLIC_STATE.expired) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  if (context.policyVersion !== preview.policyVersion || context.contactType !== preview.contactType) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  if (expectedVersion !== preview.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.allowlistImportConflict);
}

/** @param input - Explicit selected records and current server scope. @returns Selected preview without confirmed effects; an equivalent pending selection keeps its version. @throws AdmissionOperationError for an invalid selection, terminal import or failed scope/CAS check. */
export function selectAllowlistImportRows(input: { preview: AllowlistImport; context: AllowlistImportContext; expectedVersion: number; selectedRows: readonly number[]; confirmed: true }): AllowlistImport {
  const { preview, context, expectedVersion } = input;
  assertImportCurrent(preview, context, expectedVersion);
  if (preview.state === ADMISSION_IMPORT_PUBLIC_STATE.completed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  const selected = new Set(input.selectedRows);
  if (!input.confirmed || selected.size === 0 || selected.size !== input.selectedRows.length || selected.size > ADMISSION_LIMIT.csvDataRowCount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const byNumber = new Map(preview.rows.map((row) => [row.rowNumber, row]));
  for (const rowNumber of selected) {
    const row = byNumber.get(rowNumber);
    if (!Number.isInteger(rowNumber) || !row || !row.contact || row.errors.length || row.outcome !== null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  }
  if (preview.state === ADMISSION_IMPORT_PUBLIC_STATE.processing && input.selectedRows.every((rowNumber) => byNumber.get(rowNumber)!.selected)) return preview;
  return { ...preview, version: preview.version + 1, state: ADMISSION_IMPORT_PUBLIC_STATE.processing, rows: preview.rows.map((row) => selected.has(row.rowNumber) && !row.selected ? { ...row, selected: true } : row) };
}

/** @param input - Owner-confirmed row work and observed preview version. @returns Preserved original progress without executing work; mixed results become completed only when every selected row has an outcome. @throws AdmissionOperationError for contradictory replay, unselected rows, invalid metadata or failed scope/CAS checks. */
export function recordAllowlistImportRowOutcomes(input: { preview: AllowlistImport; context: AllowlistImportContext; expectedVersion: number; outcomes: readonly AllowlistImportRowOutcome[] }): AllowlistImport {
  const { preview, context, expectedVersion } = input;
  assertImportCurrent(preview, context, expectedVersion);
  if (preview.state !== ADMISSION_IMPORT_PUBLIC_STATE.processing && preview.state !== ADMISSION_IMPORT_PUBLIC_STATE.completed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const outcomes = new Map<number, AllowlistImportRowOutcome>();
  for (const outcome of input.outcomes) {
    if (outcomes.has(outcome.rowNumber)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    outcomes.set(outcome.rowNumber, outcome);
  }
  if (outcomes.size === 0) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const byNumber = new Map(preview.rows.map((row) => [row.rowNumber, row]));
  let changed = false;
  for (const outcome of outcomes.values()) {
    const row = byNumber.get(outcome.rowNumber), committedAt = outcome.committedAt.getTime();
    if (!row?.selected || row.errors.length || !Number.isFinite(committedAt) || committedAt < preview.createdAt.getTime() || committedAt > context.now.getTime() || committedAt >= preview.expiresAt.getTime()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (outcome.outcome === ADMISSION_IMPORT_ROW_OUTCOME.added || outcome.outcome === ADMISSION_IMPORT_ROW_OUTCOME.unchanged) {
      if (!outcome.entryId?.trim() || !Number.isInteger(outcome.entryVersion) || outcome.entryVersion! <= 0 || outcome.outcome === ADMISSION_IMPORT_ROW_OUTCOME.added && outcome.entryVersion !== 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    } else if (outcome.outcome !== ADMISSION_IMPORT_ROW_OUTCOME.skipped && outcome.outcome !== ADMISSION_IMPORT_ROW_OUTCOME.conflict || outcome.entryId !== null || outcome.entryVersion !== null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (row.outcome !== null) {
      if (row.outcome !== outcome.outcome || row.entryId !== outcome.entryId || row.entryVersion !== outcome.entryVersion || row.committedAt?.getTime() !== committedAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.allowlistImportConflict);
    } else changed = true;
  }
  if (!changed) return preview;
  const rows = preview.rows.map((row) => { const outcome = outcomes.get(row.rowNumber); return outcome && row.outcome === null ? { ...row, outcome: outcome.outcome, entryId: outcome.entryId, entryVersion: outcome.entryVersion, committedAt: new Date(outcome.committedAt) } : row; });
  const completed = rows.every((row) => !row.selected || row.outcome !== null);
  return { ...preview, version: preview.version + 1, state: completed ? ADMISSION_IMPORT_PUBLIC_STATE.completed : ADMISSION_IMPORT_PUBLIC_STATE.processing, rows };
}
