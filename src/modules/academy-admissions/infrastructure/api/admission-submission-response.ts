/** Projects only confirmed original submission results for every admission entry route. @module admission-submission-response */
import { z } from "zod";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionCommittedOutcomeSchema } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { admissionOutcomeSchema, createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_MUTATION_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-mutation-presentation";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import type { createAdmissionRouteBoundary } from "./admission-route-http";

const startedSchema = z.object({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() });
/** @param boundary - Existing single native HTTP input/output boundary. @param slug - Validated tribe slug. @param operationId - Original caller key. @param result - Admission owner's own result, not a provider response. @returns Guarded pending/admitted/already_member or registered progress; pending never becomes joined. */
export function respondToAdmissionSubmission(boundary: ReturnType<typeof createAdmissionRouteBoundary>, slug: string, operationId: string, result: { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }): Response {
  if (!result.ok) return boundary.failure(result.failure);
  const unusable = () => boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
  const parsed = createAdmissionOperationStateSchema(admissionCommittedOutcomeSchema).safeParse(result.value);
  if (!parsed.success || parsed.data.operationId.toLowerCase() !== operationId.toLowerCase()) return unusable();
  if (parsed.data.state === OPERATION_STATE.started) return boundary.success(startedSchema, parsed.data, HTTP_STATUS.accepted);
  const original = parsed.data.result;
  if (original.operationId.toLowerCase() !== parsed.data.operationId.toLowerCase()) return unusable();
  const response = original.outcome === ADMISSION_OUTCOME.pending ? { operationId: parsed.data.operationId, outcome: original.outcome, request: original.requestSnapshot, safeMessage: ADMISSION_MUTATION_MESSAGE.pending, nextHref: buildOwnAdmissionRequestRoute(slug, original.admissionRequestId!) }
    : { operationId: parsed.data.operationId, outcome: original.outcome, membership: original.membership, safeMessage: original.outcome === ADMISSION_OUTCOME.admitted ? ADMISSION_MUTATION_MESSAGE.admitted : ADMISSION_MUTATION_MESSAGE.alreadyMember, nextHref: `/${slug}/academia` };
  return boundary.success(admissionOutcomeSchema, response, original.created && !parsed.data.replayed ? HTTP_STATUS.created : HTTP_STATUS.ok);
}
