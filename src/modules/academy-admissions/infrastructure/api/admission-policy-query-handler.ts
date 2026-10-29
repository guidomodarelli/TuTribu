/** Publishes current policy/impact through one own GET boundary, independently of original operation snapshots. @module admission-policy-query-handler */
import "server-only";
import { type AdmissionFailure, admissionFailure  } from "../../application/results/admission-errors";
import { admissionPolicyStateResultSchema } from "../../application/results/admission-policy-result-schemas";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import type { AdmissionTribeRouting, AdmissionTribeScope } from "../../application/use-cases/admission-tribe-scope";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeRoute } from "./admission-route-steps";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "./admission-request-schemas";

type PolicyQueryServices = {
  resolveTribe: AdmissionTribeRouting;
  policy: { execute(query: AdmissionTribeScope): Promise<{ ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }> };
};

/** @param open - Native readonly application composition after input validation. @returns GET of current leader data, never initialization or activation. */
export function createAdmissionPolicyQueryHandler(open: () => Promise<PolicyQueryServices>) {
  return async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.policyRead });
    try {
      const route = await openAdmissionTribeRoute(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema }, open);
      if ("response" in route) return route.response;
      const result = await route.services.policy.execute(route.scope);
      if (!result.ok) return boundary.failure(result.failure);
      const parsed = admissionPolicyStateResultSchema.safeParse(result.value);
      if (!parsed.success || parsed.data.policy && parsed.data.policy.id !== route.scope.tribeId.toLowerCase()) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      return boundary.success(admissionPolicyStateResultSchema, parsed.data);
    } catch (error) { return boundary.unexpected(error); }
  };
}
