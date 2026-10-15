/** Defines one explicit DB-only batch and its minimal original committed results. @module admission-batch-decision-writer */
import type { AdmissionCommandScope } from "./admission-repositories";
import type { AdmissionOperationResult } from "../entities/admission-operation";
import type { AdmissionCommandDenialCode } from "../../constants/admission-command-denial";

/** Keeps every selected original version in the protected operation intent. */
export type AdmissionBatchDecisionSelection = { admissionRequestId: string; expectedVersion: number };
/** Native authority belongs to the server; internal and external copy remain separate. */
export type AdmissionBatchDecisionIntent = AdmissionCommandScope & {
  operationId: string; confirmed: true; decision: "approve" | "reject";
  internalReason: string; externalMessage: string | null; items: readonly AdmissionBatchDecisionSelection[];
};
/** A failed row carries only a closed reason and its explicitly selected resource. */
export type AdmissionBatchDecisionItemResult =
  | { admissionRequestId: string; status: "approved" | "rejected"; version: number }
  | { admissionRequestId: string; status: "conflict" | "denied"; code: AdmissionCommandDenialCode | "permission_denied" };
/** All rows belong to one confirmed business transaction; no note or contact is stored here. */
export type AdmissionBatchDecisionSnapshot = { results: AdmissionBatchDecisionItemResult[] };
/** Concrete implementations must revalidate each row and roll back the entire batch on unexpected persistence failure. */
export interface AdmissionBatchDecisionWriter {
  decideBatch(intent: AdmissionBatchDecisionIntent): Promise<AdmissionOperationResult<AdmissionBatchDecisionSnapshot>>;
}
