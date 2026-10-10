/** Proposes explicit retry eligibility without reopening a terminal request or changing membership. @module admission-retry */
import type { AdmissionRequest } from "../entities/admission-request";
import { getAdmissionRetryAllowedAt } from "../entities/admission-request";
import type { AdmissionActorFacts } from "./admission-eligibility";
import { canPerformAdmissionAction } from "./admission-eligibility";
import { AdmissionOperationError } from "../errors/admission-operation-error";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

/**
 * Changes only the metadata needed for a corrective presentation; abuse controls remain with their owners.
 * @param input - Locked request/current leader, explicit expected version/reason and post-lock clock.
 * @returns A retry proposal, current no-op or safe denial without rewriting source/decision/deadline.
 * @remarks The adapter independently verifies exact signed global recency before every ledger phase.
 */
export function proposeAdmissionRetry(input: { request: AdmissionRequest; actor: AdmissionActorFacts; expectedVersion: number; internalReason: string; now: Date }) {
  const deny = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE]) => ({ allowed: false as const, code });
  if (!canPerformAdmissionAction(input.actor, ADMISSION_ACTION.allowEarlyRetry, { tribeId: input.request.tribeId })) return deny(ADMISSION_ERROR_CODE.permissionDenied);
  const request = input.request;
  if (request.version !== input.expectedVersion || request.status !== ADMISSION_REQUEST_STATUS.rejected && request.status !== ADMISSION_REQUEST_STATUS.cancelled && request.status !== ADMISSION_REQUEST_STATUS.expired) return deny(ADMISSION_ERROR_CODE.requestConflict);
  const reason = input.internalReason.trim();
  if (!reason || reason.length > ADMISSION_LIMIT.internalMessageCharacters || !Number.isFinite(input.now.getTime()) || input.now < request.submittedAt) return deny(ADMISSION_ERROR_CODE.invalidInput);
  let allowedAt: Date;
  try { allowedAt = getAdmissionRetryAllowedAt(request); }
  catch (error) { if (error instanceof AdmissionOperationError) return deny(error.code); throw error; }
  if (input.now >= allowedAt) return { allowed: true as const, changed: false, request, retryAllowedAt: allowedAt, internalReason: reason };
  return { allowed: true as const, changed: true, request: { ...request, version: request.version + 1, retryAllowedAt: new Date(input.now) }, retryAllowedAt: new Date(input.now), internalReason: reason };
}
