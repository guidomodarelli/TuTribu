/** Executes explicit policy commands through validated own HTTP contracts. @module admission-policy-command-handlers */
import "server-only";
import { z } from "zod";
import type { ManageAdmissionPolicyUseCases } from "../../application/use-cases/manage-admission-policy-use-cases";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { admissionFailure } from "../../application/results/admission-errors";
import { admissionPolicyMutationResultSchema } from "../../application/results/admission-policy-result-schemas";
import { createAdmissionOperationStateSchema } from "../../application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema, admissionPolicyInitializationSchema, admissionPolicyUpdateSchema, admissionPolicyActivationSchema, admissionPolicyPauseSchema } from "./admission-request-schemas";

/** Framework composition supplies only application ports; no browser actor or authority enters them. */
export type AdmissionPolicyCommandServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  policy: Pick<ManageAdmissionPolicyUseCases, "initialize" | "update" | "activate" | "pause">;
};
type PolicyRouteContext = { params: Promise<{ slug: string }> };
type PolicyCommandIdentity = { operationId: string };
type PolicyCommandScope = { tribeId: string; requestId: string };
type PolicyCommandResponse = Awaited<ReturnType<ManageAdmissionPolicyUseCases["initialize"]>>;

/** @param open - Native server composition, after input/origin validation. @returns Command handlers preserving original UUID/version and only confirmed own outcomes. */
export function createAdmissionPolicyCommandHandlers(open: () => Promise<AdmissionPolicyCommandServices>) {
  /** Validates each input once and prevents an unusable or foreign operation result from becoming a successful response. */
  async function command<Input extends PolicyCommandIdentity>(request: Request, context: PolicyRouteContext, operation: string, schema: z.ZodType<Input>, execute: (services: AdmissionPolicyCommandServices, input: Input & PolicyCommandScope) => Promise<PolicyCommandResponse>): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(schema);
      if (!body.usable) return body.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await execute(services, { ...body.value, tribeId: identity.value.tribeId, requestId });
      if (!result.ok) return boundary.failure(result.failure);
      const parsed = createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema).safeParse(result.value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== body.value.operationId.toLowerCase()
        || parsed.data.state === OPERATION_STATE.completed && parsed.data.result.policyId.toLowerCase() !== identity.value.tribeId.toLowerCase()) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      if (parsed.data.state === OPERATION_STATE.completed && "expectedVersion" in body.value && typeof body.value.expectedVersion === "number") {
        const committedVersion = body.value.expectedVersion + (parsed.data.result.changed ? 1 : 0);
        if (parsed.data.result.version !== committedVersion) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      }
      if (parsed.data.state === OPERATION_STATE.completed && operation === ADMISSION_HTTP_OPERATION.policyInitialize && parsed.data.result.changed
        && (parsed.data.result.version !== 1 || parsed.data.result.verificationEpoch !== 1 || parsed.data.result.activatedAt !== null || parsed.data.result.controlActivated)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      if (parsed.data.state === OPERATION_STATE.completed && operation === ADMISSION_HTTP_OPERATION.policyActivate && !parsed.data.result.controlActivated) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      return boundary.success(createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema), parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
    } catch (error) { return boundary.unexpected(error); }
  }

  return {
    /** @param request - Native request. @param context - Framework params. @returns Closed default initialization only after explicit confirmation and current authority. */
    initialize: (request: Request, context: PolicyRouteContext) => command(request, context, ADMISSION_HTTP_OPERATION.policyInitialize, admissionPolicyInitializationSchema, (services, input) => services.policy.initialize(input)),
    /** @param request - Native request. @param context - Framework params. @returns Original observed-version edit, without client countries or server-controlled counters. */
    update: (request: Request, context: PolicyRouteContext) => command(request, context, ADMISSION_HTTP_OPERATION.policyUpdate, admissionPolicyUpdateSchema, (services, input) => {
      const { operationId, confirmed, expectedVersion, tribeId, requestId, ...patch } = input;
      return services.policy.update({ operationId, confirmed, expectedVersion, tribeId, requestId, patch });
    }),
    /** @param request - Native request. @param context - Framework params. @returns Original activation; browser preflight/recency flags are rejected. */
    activate: (request: Request, context: PolicyRouteContext) => command(request, context, ADMISSION_HTTP_OPERATION.policyActivate, admissionPolicyActivationSchema, (services, input) => services.policy.activate(input)),
    /** @param request - Native request. @param context - Framework params. @returns Explicit observed-version pause without removing protection. */
    pause: (request: Request, context: PolicyRouteContext) => command(request, context, ADMISSION_HTTP_OPERATION.policyPause, admissionPolicyPauseSchema, (services, input) => services.policy.pause(input)),
  };
}
