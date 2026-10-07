/** Publishes informational cutover blockers without creating a claim, reading secrets or granting activation. @module admission-preflight-query-handler */
import "server-only";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { admissionPreflightResultSchema } from "../../application/results/admission-preflight-result-schema";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "./admission-request-schemas";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";

type PreflightQueryServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  preflight: { execute(query: { tribeId: string; requestId: string }): Promise<{ ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }> };
};

/** @param open - Current native read composition after validation. @returns GET of aggregate blockers, independent of sensitive mutation recency. */
export function createAdmissionPreflightQueryHandler(open: () => Promise<PreflightQueryServices>) {
  return async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.policyPreflight });
    try {
      const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await services.preflight.execute({ tribeId: identity.value.tribeId, requestId });
      return result.ok ? boundary.success(admissionPreflightResultSchema, result.value) : boundary.failure(result.failure);
    } catch (error) { return boundary.unexpected(error); }
  };
}
