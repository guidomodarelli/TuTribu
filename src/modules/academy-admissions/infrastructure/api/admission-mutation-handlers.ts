/** Executes explicit scoped mutations and projects only their confirmed original response. @module admission-mutation-handlers */
import "server-only";
import { z } from "zod";
import { type AdmissionFailure, admissionFailure  } from "@/src/modules/academy-admissions/application/results/admission-errors";
import type { SubmitAdmissionInput } from "@/src/modules/academy-admissions/application/use-cases/submit-admission-use-case";
import type { CancelAdmissionRequestInput } from "@/src/modules/academy-admissions/application/use-cases/cancel-admission-request-use-case";
import type { DecideAdmissionRequestInput } from "@/src/modules/academy-admissions/application/use-cases/decide-admission-request-use-case";
import type { AllowAdmissionRetryInput } from "@/src/modules/academy-admissions/application/use-cases/allow-admission-retry-use-case";
import type { AdmissionTribeRouting } from "@/src/modules/academy-admissions/application/use-cases/admission-tribe-scope";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionTransitionResultSchema, admissionRetryResultSchema } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { type AdmissionRouteBoundary, readAdmissionRouteInput, readAdmissionBodyInTribeScope } from "./admission-route-steps";
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
  resolveTribe: AdmissionTribeRouting;
  submit: { execute(input: SubmitAdmissionInput): Promise<MutationResult> };
  cancelOwn: { execute(input: CancelAdmissionRequestInput): Promise<MutationResult> };
  cancelByManagement: { execute(input: CancelAdmissionRequestInput): Promise<MutationResult> };
  decide: { execute(input: DecideAdmissionRequestInput): Promise<MutationResult> };
  allowRetry: { execute(input: AllowAdmissionRetryInput): Promise<MutationResult> };
};
type MutationKind = typeof ADMISSION_HTTP_OPERATION.submit | typeof ADMISSION_HTTP_OPERATION.cancel | typeof ADMISSION_HTTP_OPERATION.decide | typeof ADMISSION_HTTP_OPERATION.retry;
type MutationContext = { params: Promise<{ slug: string; requestId?: string }> };
const startedSchema = z.object({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() });
/** One request mutation target after its params were validated. */
type MutationTarget = { boundary: AdmissionRouteBoundary; slug: string; admissionRequestId: string };

/** @param boundary - Current request boundary. @returns A safe contract failure without publishing an unrelated original. */
function unusableMutation(boundary: AdmissionRouteBoundary): Response {
  return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
}

/** @param response - Boundary, original operation, exact request, expected terminal status and own result value. @returns Registered progress, the confirmed transition, or a safe contract failure. */
function respondToTransition({ boundary, operationId, admissionRequestId, expectedStatus, value }: { boundary: AdmissionRouteBoundary; operationId: string; admissionRequestId: string; expectedStatus: string; value: unknown }): Response {
  const parsed = createAdmissionOperationStateSchema(admissionTransitionResultSchema).safeParse(value);
  if (!parsed.success || parsed.data.operationId.toLowerCase() !== operationId.toLowerCase()) return unusableMutation(boundary);
  if (parsed.data.state === OPERATION_STATE.started) return boundary.success(startedSchema, parsed.data, HTTP_STATUS.accepted);
  if (parsed.data.result.admissionRequestId.toLowerCase() !== admissionRequestId.toLowerCase() || parsed.data.result.status !== expectedStatus) return unusableMutation(boundary);
  return boundary.success(admissionTransitionResultSchema, parsed.data.result);
}

/** @param open - Server composition of native account/DB/security/application. @returns Confirmed public mutation handlers; no request refresh or unregistered progress. */
export function createAdmissionMutationHandlers(open: () => Promise<AdmissionMutationServices>) {
  /** Validates own params/query/body once and preserves the same operation/resource throughout execution. */
  async function mutate(request: Request, context: MutationContext, operation: MutationKind): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const input = await readAdmissionRouteInput(boundary, { request, params: context.params }, { params: operation === ADMISSION_HTTP_OPERATION.submit ? admissionTribeParamsSchema : admissionRequestParamsSchema, query: admissionEmptyQuerySchema });
      if ("response" in input) return input.response;
      const { params } = input, slug = params.slug;
      if (operation === ADMISSION_HTTP_OPERATION.submit) return await submit(boundary, slug);
      const admissionRequestId = "requestId" in params ? String(params.requestId) : undefined;
      if (!admissionRequestId) return unusableMutation(boundary);
      const target = { boundary, slug, admissionRequestId };
      if (operation === ADMISSION_HTTP_OPERATION.retry) return await retry(target);
      if (operation === ADMISSION_HTTP_OPERATION.cancel) return await cancel(target);
      return await decide(target);
    } catch (error) { return boundary.unexpected(error); }
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @returns Confirmed original admission outcome or a safe failure. */
  async function submit(boundary: AdmissionRouteBoundary, slug: string): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionSubmissionSchema, open, slug);
    if ("response" in command) return command.response;
    const { body, services, scope } = command;
    const result = await services.submit.execute({ ...body, ...scope });
    return respondToAdmissionSubmission(boundary, slug, body.operationId, result);
  }

  /** @param target - Boundary, tribe slug and exact request. @returns Only committed retry eligibility or registered progress. */
  async function retry({ boundary, slug, admissionRequestId }: MutationTarget): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionRetryEligibilitySchema, open, slug);
    if ("response" in command) return command.response;
    const { body, services, scope } = command;
    const result = await services.allowRetry.execute({ ...body, tribeId: scope.tribeId, admissionRequestId, requestId: scope.requestId });
    if (!result.ok) return boundary.failure(result.failure);
    const parsed = createAdmissionOperationStateSchema(admissionRetryResultSchema).safeParse(result.value);
    if (!parsed.success || parsed.data.operationId.toLowerCase() !== body.operationId.toLowerCase()) return unusableMutation(boundary);
    if (parsed.data.state === OPERATION_STATE.started) return boundary.success(startedSchema, parsed.data, HTTP_STATUS.accepted);
    if (parsed.data.result.admissionRequestId.toLowerCase() !== admissionRequestId.toLowerCase()) return unusableMutation(boundary);
    return boundary.success(admissionRetryResultSchema, parsed.data.result);
  }

  /** @param target - Boundary, tribe slug and exact request. @returns Original cancellation, trying management after an own-request denial. */
  async function cancel({ boundary, slug, admissionRequestId }: MutationTarget): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionCancellationSchema, open, slug);
    if ("response" in command) return command.response;
    const { body, services, scope } = command;
    const input = { ...body, tribeId: scope.tribeId, admissionRequestId, requestId: scope.requestId };
    let result = await services.cancelOwn.execute(input);
    if (!result.ok && (result.failure.code === ADMISSION_ERROR_CODE.permissionDenied || result.failure.code === ADMISSION_ERROR_CODE.resourceUnavailable)) result = await services.cancelByManagement.execute(input);
    if (!result.ok) return boundary.failure(result.failure);
    return respondToTransition({ boundary, operationId: body.operationId, admissionRequestId, expectedStatus: ADMISSION_REQUEST_STATUS.cancelled, value: result.value });
  }

  /** @param target - Boundary, tribe slug and exact request. @returns Only the confirmed original version/status of the decision. */
  async function decide({ boundary, slug, admissionRequestId }: MutationTarget): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionDecisionSchema, open, slug);
    if ("response" in command) return command.response;
    const { body, services, scope } = command;
    const result = await services.decide.execute({ ...body, externalMessage: body.externalMessage ?? null, tribeId: scope.tribeId, admissionRequestId, requestId: scope.requestId });
    if (!result.ok) return boundary.failure(result.failure);
    const expectedStatus = body.decision === ADMISSION_DECISION.approve ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected;
    return respondToTransition({ boundary, operationId: body.operationId, admissionRequestId, expectedStatus, value: result.value });
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
