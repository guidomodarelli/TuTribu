/** Publishes current policy/impact through one own GET boundary, independently of original operation snapshots. @module admission-policy-query-handler */
import "server-only";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { admissionFailure } from "../../application/results/admission-errors";
import { admissionPolicyStateResultSchema } from "../../application/results/admission-policy-result-schemas";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "./admission-request-schemas";

type PolicyQueryServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  policy: { execute(query: { tribeId: string; requestId: string }): Promise<{ ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }> };
};

/** @param open - Native readonly application composition after input validation. @returns GET of current leader data, never initialization or activation. */
export function createAdmissionPolicyQueryHandler(open: () => Promise<PolicyQueryServices>) {
  return async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.policyRead });
    try {
      const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await services.policy.execute({ tribeId: identity.value.tribeId, requestId });
      if (!result.ok) return boundary.failure(result.failure);
      const parsed = admissionPolicyStateResultSchema.safeParse(result.value);
      if (!parsed.success || parsed.data.policy && parsed.data.policy.id !== identity.value.tribeId.toLowerCase()) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      return boundary.success(admissionPolicyStateResultSchema, parsed.data);
    } catch (error) { return boundary.unexpected(error); }
  };
}
