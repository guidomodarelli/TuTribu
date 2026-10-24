/** Defines authorized temporary preview and original multi-block import persistence. @module allowlist-import-repository */
import type { AuthorizedAdmissionContext } from "./admission-authorization-reader";
import type { AllowlistImport, AllowlistImportInputRow } from "../entities/allowlist-import";
import type { AdmissionContactType } from "../value-objects/admission-contact";
import type { AdmissionOperationResult } from "../entities/admission-operation";
import type { ADMISSION_IMPORT_PUBLIC_STATE, ADMISSION_IMPORT_ROW_OUTCOME } from "../../constants/admission-management-contract";

/** Holds only the original preview reference, not mutable current metadata or file material. */
export type AllowlistImportReference = { importId: string; sourceVersion: number; expiresAt: string };
/** Reports original confirmed counts separately from the current import snapshot. */
export type AllowlistImportConfirmationResult = { importId: string; sourceVersion: number; state: typeof ADMISSION_IMPORT_PUBLIC_STATE[keyof typeof ADMISSION_IMPORT_PUBLIC_STATE]; counts: { selected: number } & Record<typeof ADMISSION_IMPORT_ROW_OUTCOME[keyof typeof ADMISSION_IMPORT_ROW_OUTCOME], number> };
export interface AllowlistImportRepository {
  preview(input: { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; expectedPolicyVersion: number; contactType: AdmissionContactType; csvText: string; rows: readonly AllowlistImportInputRow[] }): Promise<AdmissionOperationResult<AllowlistImportReference>>;
  read(context: AuthorizedAdmissionContext, importId: string): Promise<AllowlistImport | null>;
  confirm(input: { context: AuthorizedAdmissionContext; importId: string; operationId: string; confirmed: true; expectedVersion: number; selectedRows: readonly number[] }): Promise<AdmissionOperationResult<AllowlistImportConfirmationResult>>;
}
/** Owns file parsing at the infrastructure input boundary without coupling application to its grammar. */
export interface AllowlistImportInputReader { parse(csvText: string): AllowlistImportInputRow[]; }
