/** Publishes informational cutover blockers without creating a claim, reading secrets or granting activation. @module admission-preflight-query-handler */
import "server-only";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import type { AdmissionTribeRouting, AdmissionTribeScope } from "../../application/use-cases/admission-tribe-scope";
import { admissionPreflightResultSchema } from "../../application/results/admission-preflight-result-schema";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeRoute, respondWithAdmissionResult } from "./admission-route-steps";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "./admission-request-schemas";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";

/** Readonly aggregate blockers of one resolved tribe; shared by the GET route and the SSR loader. */
export type AdmissionPreflightServices = {
  resolveTribe: AdmissionTribeRouting;
  preflight: { execute(query: AdmissionTribeScope): Promise<{ ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }> };
};

/** @param open - Current native read composition after validation. @returns GET of aggregate blockers. */
export function createAdmissionPreflightQueryHandler(open: () => Promise<AdmissionPreflightServices>) {
  return async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.policyPreflight });
    try {
      const route = await openAdmissionTribeRoute(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema }, open);
      if ("response" in route) return route.response;
      return respondWithAdmissionResult(boundary, admissionPreflightResultSchema, await route.services.preflight.execute(route.scope));
    } catch (error) { return boundary.unexpected(error); }
  };
}
