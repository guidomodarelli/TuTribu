/** Executes explicit policy commands through validated own HTTP contracts. @module admission-policy-command-handlers */
import "server-only";
import type { z } from "zod";
import type { ManageAdmissionPolicyUseCases } from "../../application/use-cases/manage-admission-policy-use-cases";
import { type AdmissionFailure, admissionFailure  } from "../../application/results/admission-errors";
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
/** One policy command: its diagnostic operation, body schema and application call. */
type PolicyCommand<Input extends PolicyCommandIdentity> = { operation: string; schema: z.ZodType<Input>; execute: (services: AdmissionPolicyCommandServices, input: Input & PolicyCommandScope) => Promise<PolicyCommandResponse> };

/** @returns Whether a completed original belongs to this policy, commits the expected version, and matches what initialization or activation must produce. */
function isConsistentPolicyResult({ result, tribeId, body, operation }: { result: z.infer<typeof admissionPolicyMutationResultSchema>; tribeId: string; body: PolicyCommandIdentity; operation: string }): boolean {
  if (result.policyId.toLowerCase() !== tribeId.toLowerCase()) return false;
  if ("expectedVersion" in body && typeof body.expectedVersion === "number" && result.version !== body.expectedVersion + (result.changed ? 1 : 0)) return false;
  if (operation === ADMISSION_HTTP_OPERATION.policyInitialize && result.changed && (result.version !== 1 || result.verificationEpoch !== 1 || result.activatedAt !== null || result.controlActivated)) return false;
  return operation !== ADMISSION_HTTP_OPERATION.policyActivate || result.controlActivated;
}

/** @param open - Native server composition, after input/origin validation. @returns Command handlers preserving original UUID/version and only confirmed own outcomes. */
export function createAdmissionPolicyCommandHandlers(open: () => Promise<AdmissionPolicyCommandServices>) {
  /** Validates each input once and prevents an unusable or foreign operation result from becoming a successful response. */
  async function command<Input extends PolicyCommandIdentity>(request: Request, context: PolicyRouteContext, { operation, schema, execute }: PolicyCommand<Input>): Promise<Response> {
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
        || parsed.data.state === OPERATION_STATE.completed && !isConsistentPolicyResult({ result: parsed.data.result, tribeId: identity.value.tribeId, body: body.value, operation })) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      return boundary.success(createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema), parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
    } catch (error) { return boundary.unexpected(error); }
  }

  return {
    /** @param request - Native request. @param context - Framework params. @returns Closed default initialization only after explicit confirmation and current authority. */
    initialize: (request: Request, context: PolicyRouteContext) => command(request, context, { operation: ADMISSION_HTTP_OPERATION.policyInitialize, schema: admissionPolicyInitializationSchema, execute: (services, input) => services.policy.initialize(input) }),
    /** @param request - Native request. @param context - Framework params. @returns Original observed-version edit, without client countries or server-controlled counters. */
    update: (request: Request, context: PolicyRouteContext) => command(request, context, { operation: ADMISSION_HTTP_OPERATION.policyUpdate, schema: admissionPolicyUpdateSchema, execute: (services, input) => {
      const { operationId, confirmed, expectedVersion, tribeId, requestId, ...patch } = input;
      return services.policy.update({ operationId, confirmed, expectedVersion, tribeId, requestId, patch });
    } }),
    /** @param request - Native request. @param context - Framework params. @returns Original activation; browser preflight flags are rejected. */
    activate: (request: Request, context: PolicyRouteContext) => command(request, context, { operation: ADMISSION_HTTP_OPERATION.policyActivate, schema: admissionPolicyActivationSchema, execute: (services, input) => services.policy.activate(input) }),
    /** @param request - Native request. @param context - Framework params. @returns Explicit observed-version pause without removing protection. */
    pause: (request: Request, context: PolicyRouteContext) => command(request, context, { operation: ADMISSION_HTTP_OPERATION.policyPause, schema: admissionPolicyPauseSchema, execute: (services, input) => services.policy.pause(input) }),
  };
}
