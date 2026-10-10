/** Executes own query ports through native HTTP and one input boundary without membership middleware. @module admission-query-handlers */
import "server-only";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionOverviewSchema, admissionRequestSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema, admissionOwnRequestQuerySchema } from "./admission-request-schemas";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";

/** Own application values are guarded at response; a private cause is never serialized. */
type QueryResult<Value> = { ok: true; value: Value } | { ok: false; failure: AdmissionFailure };
/** Only read ports are exposed; no submit/claim/sender can be invoked by these handlers. */
export type AdmissionQueryServices = {
  overview: { execute(query: { slug: string; requestId: string }): Promise<QueryResult<unknown>> };
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<QueryResult<{ tribeId: string }>> };
  own: { getOwn(query: { tribeId: string; requestId: string; admissionRequestId?: string }): Promise<QueryResult<unknown | null>> };
};
type AdmissionTribeRouteContext = { params: Promise<{ slug: string }> };

/** @param open - Server framework composition; the adapter never imports the cross-module root. @returns Public overview/own handlers, no session or role selected by query. */
export function createAdmissionQueryHandlers(open: () => Promise<AdmissionQueryServices>) {
  /** Runs input validation before opening auth/database composition. */
  async function read(request: Request, context: AdmissionTribeRouteContext, operation: typeof ADMISSION_HTTP_OPERATION.overview | typeof ADMISSION_HTTP_OPERATION.own): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation });
    try {
      const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", operation === ADMISSION_HTTP_OPERATION.own ? admissionOwnRequestQuerySchema : admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      if (operation === ADMISSION_HTTP_OPERATION.overview) {
        const result = await services.overview.execute({ slug: params.value.slug, requestId });
        return result.ok ? boundary.success(admissionOverviewSchema, result.value) : boundary.failure(result.failure);
      }
      const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await services.own.getOwn({ tribeId: identity.value.tribeId, requestId, ...("admissionRequestId" in query.value && typeof query.value.admissionRequestId === "string" ? { admissionRequestId: query.value.admissionRequestId } : {}) });
      return result.ok ? boundary.success(admissionRequestSchema.nullable(), result.value) : boundary.failure(result.failure);
    } catch (error) { return boundary.unexpected(error); }
  }
  return {
    /** @param request - Native HTTP request. @param context - Framework params. @returns Public/own overview without effects. */
    overview: (request: Request, context: AdmissionTribeRouteContext) => read(request, context, ADMISSION_HTTP_OPERATION.overview),
    /** @param request - Native HTTP request. @param context - Framework params. @returns Only the actual account's request or absence. */
    own: (request: Request, context: AdmissionTribeRouteContext) => read(request, context, ADMISSION_HTTP_OPERATION.own),
  };
}
