/** Defines leader-only allowlist queries and atomic configuration commands independently of persistence. @module allowlist-management */
import type { AllowlistEntry, AllowlistEntryPatch } from "../entities/allowlist-entry";
import type { AdmissionContact } from "../value-objects/admission-contact";
import type { AuthorizedAdmissionContext } from "./admission-authorization-reader";
import type { AdmissionOperationResult } from "../entities/admission-operation";

/** Filters remain tenant-local; the cursor is an opaque pagination hint without resource authority. */
export type AllowlistQuery = { limit: number; search?: string; status?: AllowlistEntry["status"]; cursor?: string };
export type AllowlistPage = { entries: AllowlistEntry[]; nextCursor: string | null };

/** Reports only the original configuration commit; it never describes membership or binding effects. */
export type AllowlistMutationResult = { entryId: string; version: number; changed: boolean; created: boolean };
export type AllowlistCreationIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; contact: AdmissionContact; displayName: string | null };
export type AllowlistUpdateIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; entryId: string; expectedVersion: number; patch: AllowlistEntryPatch };

/** Implementations recheck current native actor/session and leadership before returning any contact metadata. */
export interface AllowlistReader {
  /** @param context - Private current leader scope. @param query - Bounded tenant-local search and pagination. @returns Current entries without any write or account binding. */
  list(context: AuthorizedAdmissionContext, query: AllowlistQuery): Promise<AllowlistPage>;
  /** @param context - Current leader and exact entry scope. @param entryId - Own requested identity. @returns The current entry or absence, without leaking another tribe. */
  read(context: AuthorizedAdmissionContext, entryId: string): Promise<AllowlistEntry | null>;
}

/** Writers own final authority, selected contact type, original ledger and uniqueness/CAS together. */
export interface AllowlistCommandWriter {
  /** @param intent - Explicit canonical contact proposal under the exact creation recency. @returns Version one or the confirmed original, without editing an existing duplicate. */
  create(intent: AllowlistCreationIntent): Promise<AdmissionOperationResult<AllowlistMutationResult>>;
  /** @param intent - Explicit name/state edit bound to the observed entry version and original operation. @returns One effective version increment or current no-op after replay is resolved. */
  update(intent: AllowlistUpdateIntent): Promise<AdmissionOperationResult<AllowlistMutationResult>>;
}
