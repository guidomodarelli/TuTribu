/** Validates reviewer HTTP selection once and projects only current authorized own DTOs. @module admission-review-handlers */
import "server-only";
import type { GetAdmissionReviewUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-use-cases";
import type { AdmissionQueryServices } from "./admission-query-handlers";
import { admissionReviewSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionReviewPageSchema } from "@/src/modules/academy-admissions/application/results/admission-review-page-result";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";
import { admissionTribeParamsSchema, admissionRequestParamsSchema, admissionReviewQuerySchema, admissionEmptyQuerySchema } from "./admission-request-schemas";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeRoute, respondWithAdmissionResult } from "./admission-route-steps";

/** Auth, role and session never come from route/query fields. */
export type AdmissionReviewServices = { resolveTribe: AdmissionQueryServices["resolveTribe"]; review: Pick<GetAdmissionReviewUseCases, "list" | "detail"> };

/** @param open - Native server composition of inward-facing queries. @returns Bounded reviewer list/detail handlers with no writers or provider client. */
export function createAdmissionReviewHandlers(open: () => Promise<AdmissionReviewServices>) {
  return {
    /** @param request - Native same-origin request. @param context - Framework tribe slug. @returns Private/no-store oldest-first reviewer DTOs or current safe denial. */
    async list(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.reviewList });
      try {
        const route = await openAdmissionTribeRoute(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionReviewQuerySchema }, open);
        if ("response" in route) return route.response;
        return respondWithAdmissionResult(boundary, admissionReviewPageSchema, await route.services.review.list({ ...route.query, ...route.scope }));
      } catch (error) { return boundary.unexpected(error); }
    },
    /** @param request - Native request selecting one exact request id. @param context - Current tribe slug and request id. @returns Authorized private detail or genuine absence; never a caller-selected audience. */
    async detail(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.reviewDetail });
      try {
        const route = await openAdmissionTribeRoute(boundary, { request, params: context.params }, { params: admissionRequestParamsSchema, query: admissionEmptyQuerySchema }, open);
        if ("response" in route) return route.response;
        const { tribeId, requestId } = route.scope;
        return respondWithAdmissionResult(boundary, admissionReviewSchema, await route.services.review.detail({ tribeId, admissionRequestId: route.params.requestId, requestId }));
      } catch (error) { return boundary.unexpected(error); }
    },
  };
}
