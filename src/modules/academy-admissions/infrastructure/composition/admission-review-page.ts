/** Validates reviewer page runtime selection before native composition and safe SSR projection. @module admission-review-page */
import "server-only";
import { z } from "zod";
import type { GetAdmissionReviewPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-page-use-case";
import { admissionReviewPageStateSchema, type AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";

const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: z.strictObject({ [ADMISSION_NAVIGATION.requestQuery]: z.uuid().optional() }) });
/** @param input - Untrusted resolved framework params/query. @param open - Server-selected inward page use case. @returns A current safe reviewer snapshot or Spanish failure without private partial data. */
export async function loadAdmissionReviewPageState(input: unknown, open: () => Promise<Pick<GetAdmissionReviewPageUseCase, "execute">>): Promise<AdmissionReviewPageState> {
  const failure = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE]): AdmissionReviewPageState => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const page = await open();
    const selectedId = parsed.data.query[ADMISSION_NAVIGATION.requestQuery];
    const result = await page.execute({ slug: parsed.data.params.slug, requestId: context.requestId, ...(selectedId ? { admissionRequestId: selectedId } : {}) });
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) createServerLogger({ feature: "academy-admissions", operation: "load_admission_review_page", ...context }).error({ message: "Admission reviewer page read failed", metadata: { code: result.failure.code } });
      return failure(result.failure.code);
    }
    const projected = admissionReviewPageStateSchema.safeParse(result.value);
    if (projected.success) return projected.data;
    throw new Error("Admission reviewer page returned an unusable own state");
  } catch {
    createServerLogger({ feature: "academy-admissions", operation: "load_admission_review_page", ...context }).error({ message: "Admission reviewer page could not load safe state", metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failure(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
