/** Validates observability selection once and preserves scoped private response/error boundaries. @module admission-activity-handlers */
import "server-only";
import type { GetAdmissionActivityAndMetricsUseCases } from "../../application/use-cases/get-admission-activity-and-metrics-use-cases";
import type { AdmissionQueryServices } from "./admission-query-handlers";
import { admissionActivityQuerySchema, admissionActivityPageSchema } from "../../constants/admission-activity-schemas";
import { admissionMetricsResultSchema } from "../../constants/admission-metrics-schemas";
import { ADMISSION_OBSERVABILITY_HTTP_OPERATION } from "../../constants/admission-http";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "../../constants/admission-route-input";
import { createAdmissionRouteBoundary } from "./admission-route-http";

/** Native composition supplies only inward-facing scoped queries. */
export type AdmissionActivityServices = { resolveTribe: AdmissionQueryServices["resolveTribe"]; observations: Pick<GetAdmissionActivityAndMetricsUseCases, "activity" | "metrics"> };
/** @param open - Current native query composition. @returns Activity/aggregate handlers without keys, arbitrary sends or configuration writes. */
export function createAdmissionActivityHandlers(open: () => Promise<AdmissionActivityServices>) {
  return {
    /** @param request - Native request. @param context - Framework slug selection. @returns A private bounded same-tribe history page. */
    async activity(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_OBSERVABILITY_HTTP_OPERATION.activity });
      try {
        const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
        if (!params.usable) return params.response;
        const query = boundary.input("query", admissionActivityQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
        if (!query.usable) return query.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!tribe.ok) return boundary.failure(tribe.failure);
        const result = await services.observations.activity({ ...query.value, tribeId: tribe.value.tribeId, requestId });
        return result.ok ? boundary.success(admissionActivityPageSchema, result.value) : boundary.failure(result.failure);
      } catch (error) { return boundary.unexpected(error); }
    },
    /** @param request - Native request. @param context - Current framework slug. @returns A private aggregate without account/contact labels or fake history. */
    async metrics(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_OBSERVABILITY_HTTP_OPERATION.metrics });
      try {
        const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
        if (!params.usable) return params.response;
        const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
        if (!query.usable) return query.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!tribe.ok) return boundary.failure(tribe.failure);
        const result = await services.observations.metrics({ tribeId: tribe.value.tribeId, requestId });
        return result.ok ? boundary.success(admissionMetricsResultSchema, result.value) : boundary.failure(result.failure);
      } catch (error) { return boundary.unexpected(error); }
    },
  };
}
