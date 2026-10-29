/** Serves the same own page snapshot for post-render reads without any writer or provider operation. @module admission-activity-page-handler */
import "server-only";
import type { GetAdmissionActivityPageUseCase } from "../../application/use-cases/get-admission-activity-page-use-case";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { readAdmissionRouteInput, respondWithAdmissionResult } from "./admission-route-steps";
import { admissionActivityQuerySchema } from "../../constants/admission-activity-schemas";
import { admissionTribeParamsSchema } from "../../constants/admission-route-input";
import { admissionActivityReadyPageStateSchema } from "../../constants/admission-activity-page-schemas";
import { ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC } from "../../constants/admission-activity-browser";

/** @param open - Native read-only page use case, opened only after valid input. @returns One private correlated GET handler over the existing authorized owners. */
export function createAdmissionActivityPageHandler(open: () => Promise<Pick<GetAdmissionActivityPageUseCase, "execute">>) {
  return async (request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC.snapshot });
    try {
      const input = await readAdmissionRouteInput(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionActivityQuerySchema });
      if ("response" in input) return input.response;
      const page = await open();
      const result = await page.execute({ slug: input.params.slug, requestId: boundary.requestContext.requestId, filters: input.query });
      return respondWithAdmissionResult(boundary, admissionActivityReadyPageStateSchema, result);
    } catch (error) { return boundary.unexpected(error); }
  };
}
