/** Owns explicit versioned retry metadata without granting membership or reopening a request. @module admission-retry-writer */
import type { AdmissionCommandScope } from "./admission-repositories";
import type { AdmissionOperationResult } from "../entities/admission-operation";
export type AdmissionRetryIntent = AdmissionCommandScope & { admissionRequestId: string; operationId: string; expectedVersion: number; confirmed: true; internalReason: string };
/** Minimal original committed retry result; a historical version is not a current resource claim. */
export type AdmissionRetryResult = { admissionRequestId: string; version: number; retryAllowedAt: string };
export interface AdmissionRetryWriter {
  allowRetry(input: AdmissionRetryIntent): Promise<AdmissionOperationResult<AdmissionRetryResult>>;
}
