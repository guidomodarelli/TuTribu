/** Validates observability selection once and preserves scoped private response/error boundaries. @module admission-activity-handlers */
import "server-only";
import type { GetAdmissionActivityAndMetricsUseCases } from "../../application/use-cases/get-admission-activity-and-metrics-use-cases";
import type { AdmissionQueryServices } from "./admission-query-handlers";
import { admissionActivityQuerySchema, admissionActivityPageSchema } from "../../constants/admission-activity-schemas";
import { admissionMetricsResultSchema } from "../../constants/admission-metrics-schemas";
import { ADMISSION_OBSERVABILITY_HTTP_OPERATION } from "../../constants/admission-http";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "../../constants/admission-route-input";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeRoute, respondWithAdmissionResult } from "./admission-route-steps";

/** Native composition supplies only inward-facing scoped queries. */
export type AdmissionActivityServices = { resolveTribe: AdmissionQueryServices["resolveTribe"]; observations: Pick<GetAdmissionActivityAndMetricsUseCases, "activity" | "metrics"> };
/** @param open - Current native query composition. @returns Activity/aggregate handlers without keys, arbitrary sends or configuration writes. */
export function createAdmissionActivityHandlers(open: () => Promise<AdmissionActivityServices>) {
  return {
    /** @param request - Native request. @param context - Framework slug selection. @returns A private bounded same-tribe history page. */
    async activity(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_OBSERVABILITY_HTTP_OPERATION.activity });
      try {
        const route = await openAdmissionTribeRoute(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionActivityQuerySchema }, open);
        if ("response" in route) return route.response;
        return respondWithAdmissionResult(boundary, admissionActivityPageSchema, await route.services.observations.activity({ ...route.query, ...route.scope }));
      } catch (error) { return boundary.unexpected(error); }
    },
    /** @param request - Native request. @param context - Current framework slug. @returns A private aggregate without account/contact labels or fake history. */
    async metrics(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_OBSERVABILITY_HTTP_OPERATION.metrics });
      try {
        const route = await openAdmissionTribeRoute(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema }, open);
        if ("response" in route) return route.response;
        return respondWithAdmissionResult(boundary, admissionMetricsResultSchema, await route.services.observations.metrics(route.scope));
      } catch (error) { return boundary.unexpected(error); }
    },
  };
}
