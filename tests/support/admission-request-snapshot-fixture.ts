/** Builds coherent original request snapshots with the same domain constructor used by admission. @module admission-request-snapshot-fixture */
import { randomUUID } from "node:crypto";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";

/** @param input - Actual synthetic account/request/tribe and its source instant. @returns The original domain policy snapshot; native timestamp precision remains with the caller's SQL. */
export function createAdmissionRequestSnapshotFixture(input: { id: string; tribeId: string; userId: string; submittedAt: Date }) {
  return createPendingAdmissionRequest({ id: input.id, tribeId: input.tribeId, userId: input.userId, source: ADMISSION_REQUEST_SOURCE.common, contact: null, evidence: { kind: ADMISSION_EVIDENCE_KIND.none }, policy: createDefaultAdmissionPolicy({ id: randomUUID(), tribeId: input.tribeId }), message: null, now: input.submittedAt }).originalPolicy;
}
