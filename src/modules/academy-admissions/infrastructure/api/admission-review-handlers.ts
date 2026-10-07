/** Validates reviewer HTTP selection once and projects only current authorized own DTOs. @module admission-review-handlers */
import "server-only";
import type { GetAdmissionReviewUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-use-cases";
import type { AdmissionQueryServices } from "./admission-query-handlers";
import { admissionReviewSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionReviewPageSchema } from "@/src/modules/academy-admissions/application/results/admission-review-page-result";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";
import { admissionTribeParamsSchema, admissionRequestParamsSchema, admissionReviewQuerySchema, admissionEmptyQuerySchema } from "./admission-request-schemas";
import { createAdmissionRouteBoundary } from "./admission-route-http";

/** Auth, role and session never come from route/query fields. */
export type AdmissionReviewServices = { resolveTribe: AdmissionQueryServices["resolveTribe"]; review: Pick<GetAdmissionReviewUseCases, "list" | "detail"> };

/** @param open - Native server composition of inward-facing queries. @returns Bounded reviewer list/detail handlers with no writers or provider client. */
export function createAdmissionReviewHandlers(open: () => Promise<AdmissionReviewServices>) {
  return {
    /** @param request - Native same-origin request. @param context - Framework tribe slug. @returns Private/no-store oldest-first reviewer DTOs or current safe denial. */
    async list(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.reviewList });
      try {
        const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
        if (!params.usable) return params.response;
        const query = boundary.input("query", admissionReviewQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
        if (!query.usable) return query.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!tribe.ok) return boundary.failure(tribe.failure);
        const result = await services.review.list({ ...query.value, tribeId: tribe.value.tribeId, requestId });
        return result.ok ? boundary.success(admissionReviewPageSchema, result.value) : boundary.failure(result.failure);
      } catch (error) { return boundary.unexpected(error); }
    },
    /** @param request - Native request selecting one exact request id. @param context - Current tribe slug and request id. @returns Authorized private detail or genuine absence; never a caller-selected audience. */
    async detail(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.reviewDetail });
      try {
        const params = boundary.input("params", admissionRequestParamsSchema, await context.params);
        if (!params.usable) return params.response;
        const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
        if (!query.usable) return query.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!tribe.ok) return boundary.failure(tribe.failure);
        const result = await services.review.detail({ tribeId: tribe.value.tribeId, admissionRequestId: params.value.requestId, requestId });
        return result.ok ? boundary.success(admissionReviewSchema, result.value) : boundary.failure(result.failure);
      } catch (error) { return boundary.unexpected(error); }
    },
  };
}
