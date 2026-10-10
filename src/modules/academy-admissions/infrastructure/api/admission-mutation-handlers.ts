/** Executes explicit scoped mutations and projects only their confirmed original response. @module admission-mutation-handlers */
import "server-only";
import { z } from "zod";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import type { SubmitAdmissionInput } from "@/src/modules/academy-admissions/application/use-cases/submit-admission-use-case";
import type { CancelAdmissionRequestInput } from "@/src/modules/academy-admissions/application/use-cases/cancel-admission-request-use-case";
import type { DecideAdmissionRequestInput } from "@/src/modules/academy-admissions/application/use-cases/decide-admission-request-use-case";
import type { AllowAdmissionRetryInput } from "@/src/modules/academy-admissions/application/use-cases/allow-admission-retry-use-case";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionTransitionResultSchema, admissionRetryResultSchema } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { admissionTribeParamsSchema, admissionRequestParamsSchema, admissionEmptyQuerySchema, admissionSubmissionSchema, admissionCancellationSchema, admissionDecisionSchema, admissionRetryEligibilitySchema } from "./admission-request-schemas";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { respondToAdmissionSubmission } from "./admission-submission-response";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";

type MutationResult = { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure };
/** Only framework composition selects these application ports; body role/account fields never enter them. */
export type AdmissionMutationServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  submit: { execute(input: SubmitAdmissionInput): Promise<MutationResult> };
  cancelOwn: { execute(input: CancelAdmissionRequestInput): Promise<MutationResult> };
  cancelByManagement: { execute(input: CancelAdmissionRequestInput): Promise<MutationResult> };
  decide: { execute(input: DecideAdmissionRequestInput): Promise<MutationResult> };
  allowRetry: { execute(input: AllowAdmissionRetryInput): Promise<MutationResult> };
};
type MutationKind = typeof ADMISSION_HTTP_OPERATION.submit | typeof ADMISSION_HTTP_OPERATION.cancel | typeof ADMISSION_HTTP_OPERATION.decide | typeof ADMISSION_HTTP_OPERATION.retry;
type MutationContext = { params: Promise<{ slug: string; requestId?: string }> };
const startedSchema = z.object({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() });

/** @param open - Server composition of native account/DB/security/application. @returns Confirmed public mutation handlers; no request refresh or unregistered progress. */
export function createAdmissionMutationHandlers(open: () => Promise<AdmissionMutationServices>) {
  /** Validates own params/query/body once and preserves the same operation/resource throughout execution. */
  async function mutate(request: Request, context: MutationContext, operation: MutationKind): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation });
    const unusable = () => boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", operation === ADMISSION_HTTP_OPERATION.submit ? admissionTribeParamsSchema : admissionRequestParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      if (operation === ADMISSION_HTTP_OPERATION.submit) {
        const body = await boundary.readBody(admissionSubmissionSchema);
        if (!body.usable) return body.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!identity.ok) return boundary.failure(identity.failure);
        const result = await services.submit.execute({ ...body.value, tribeId: identity.value.tribeId, requestId });
        return respondToAdmissionSubmission(boundary, params.value.slug, body.value.operationId, result);
      }
      const admissionRequestId = "requestId" in params.value ? String(params.value.requestId) : undefined;
      if (!admissionRequestId) return unusable();
      if (operation === ADMISSION_HTTP_OPERATION.retry) {
        const body = await boundary.readBody(admissionRetryEligibilitySchema);
        if (!body.usable) return body.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!identity.ok) return boundary.failure(identity.failure);
        const result = await services.allowRetry.execute({ ...body.value, tribeId: identity.value.tribeId, admissionRequestId, requestId });
        if (!result.ok) return boundary.failure(result.failure);
        const parsed = createAdmissionOperationStateSchema(admissionRetryResultSchema).safeParse(result.value);
        if (!parsed.success || parsed.data.operationId.toLowerCase() !== body.value.operationId.toLowerCase()) return unusable();
        if (parsed.data.state === OPERATION_STATE.started) return boundary.success(startedSchema, parsed.data, HTTP_STATUS.accepted);
        if (parsed.data.result.admissionRequestId.toLowerCase() !== admissionRequestId.toLowerCase()) return unusable();
        return boundary.success(admissionRetryResultSchema, parsed.data.result);
      }
      if (operation === ADMISSION_HTTP_OPERATION.cancel) {
        const body = await boundary.readBody(admissionCancellationSchema);
        if (!body.usable) return body.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!identity.ok) return boundary.failure(identity.failure);
        const input = { ...body.value, tribeId: identity.value.tribeId, admissionRequestId, requestId };
        let result = await services.cancelOwn.execute(input);
        if (!result.ok && (result.failure.code === ADMISSION_ERROR_CODE.permissionDenied || result.failure.code === ADMISSION_ERROR_CODE.resourceUnavailable)) result = await services.cancelByManagement.execute(input);
        if (!result.ok) return boundary.failure(result.failure);
        const parsed = createAdmissionOperationStateSchema(admissionTransitionResultSchema).safeParse(result.value);
        if (!parsed.success || parsed.data.operationId.toLowerCase() !== body.value.operationId.toLowerCase()) return unusable();
        if (parsed.data.state === OPERATION_STATE.started) return boundary.success(startedSchema, parsed.data, HTTP_STATUS.accepted);
        if (parsed.data.result.admissionRequestId.toLowerCase() !== admissionRequestId.toLowerCase() || parsed.data.result.status !== ADMISSION_REQUEST_STATUS.cancelled) return unusable();
        return boundary.success(admissionTransitionResultSchema, parsed.data.result);
      }
      const body = await boundary.readBody(admissionDecisionSchema);
      if (!body.usable) return body.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await services.decide.execute({ ...body.value, externalMessage: body.value.externalMessage ?? null, tribeId: identity.value.tribeId, admissionRequestId, requestId });
      if (!result.ok) return boundary.failure(result.failure);
      const parsed = createAdmissionOperationStateSchema(admissionTransitionResultSchema).safeParse(result.value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== body.value.operationId.toLowerCase()) return unusable();
      if (parsed.data.state === OPERATION_STATE.started) return boundary.success(startedSchema, parsed.data, HTTP_STATUS.accepted);
      const expectedStatus = body.value.decision === ADMISSION_DECISION.approve ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected;
      if (parsed.data.result.admissionRequestId.toLowerCase() !== admissionRequestId.toLowerCase() || parsed.data.result.status !== expectedStatus) return unusable();
      return boundary.success(admissionTransitionResultSchema, parsed.data.result);
    } catch (error) { return boundary.unexpected(error); }
  }
  return {
    /** @param request - Native explicit confirmation. @param context - Framework params. @returns Confirmed original admission outcome. */
    submit: (request: Request, context: MutationContext) => mutate(request, context, ADMISSION_HTTP_OPERATION.submit),
    /** @param request - Native cancellation intent. @param context - Framework resource params. @returns Original terminal transition or current denial. */
    cancel: (request: Request, context: MutationContext) => mutate(request, context, ADMISSION_HTTP_OPERATION.cancel),
    /** @param request - Native reviewer decision. @param context - Framework resource params. @returns Only confirmed original version/status. */
    decide: (request: Request, context: MutationContext) => mutate(request, context, ADMISSION_HTTP_OPERATION.decide),
    /** @param request - Native reasoned sensitive confirmation. @param context - Framework resource params. @returns Only committed retry eligibility, not membership or a rewritten decision. */
    retry: (request: Request, context: MutationContext) => mutate(request, context, ADMISSION_HTTP_OPERATION.retry),
  };
}
