/** Executes explicit policy commands through validated own HTTP contracts. @module admission-policy-command-handlers */
import "server-only";
import type { z } from "zod";
import type { ManageAdmissionPolicyUseCases } from "../../application/use-cases/manage-admission-policy-use-cases";
import { admissionFailure } from "../../application/results/admission-errors";
import type { AdmissionTribeRouting, AdmissionTribeScope } from "../../application/use-cases/admission-tribe-scope";
import { admissionPolicyMutationResultSchema } from "../../application/results/admission-policy-result-schemas";
import { createAdmissionOperationStateSchema } from "../../application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeCommand } from "./admission-route-steps";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema, admissionPolicyInitializationSchema, admissionPolicyUpdateSchema, admissionPolicyActivationSchema, admissionPolicyPauseSchema } from "./admission-request-schemas";

/** Framework composition supplies only application ports; no browser actor or authority enters them. */
export type AdmissionPolicyCommandServices = {
  resolveTribe: AdmissionTribeRouting;
  policy: Pick<ManageAdmissionPolicyUseCases, "initialize" | "update" | "activate" | "pause">;
};
type PolicyRouteContext = { params: Promise<{ slug: string }> };
type PolicyCommandIdentity = { operationId: string };
type PolicyCommandResponse = Awaited<ReturnType<ManageAdmissionPolicyUseCases["initialize"]>>;
/** One policy command: its diagnostic operation, body schema and application call. */
type PolicyCommand<Input extends PolicyCommandIdentity> = { operation: string; schema: z.ZodType<Input>; execute: (services: AdmissionPolicyCommandServices, input: Input & AdmissionTribeScope) => Promise<PolicyCommandResponse> };

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
      const route = await openAdmissionTribeCommand(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema, body: schema }, open);
      if ("response" in route) return route.response;
      const result = await execute(route.services, { ...route.body, ...route.scope });
      if (!result.ok) return boundary.failure(result.failure);
      const parsed = createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema).safeParse(result.value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== route.body.operationId.toLowerCase()
        || parsed.data.state === OPERATION_STATE.completed && !isConsistentPolicyResult({ result: parsed.data.result, tribeId: route.scope.tribeId, body: route.body, operation })) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
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
