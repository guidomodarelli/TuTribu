/** Validates reviewer page runtime selection before native composition and safe SSR projection. @module admission-review-page */
import "server-only";
import type { GetAdmissionReviewPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-page-use-case";
import { admissionReviewPageStateSchema, type AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import { admissionReviewPageInputSchema } from "@/src/modules/academy-admissions/constants/admission-review-page-input";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { loadAdmissionLeaderPageState } from "./admission-page-loading";

/** @param input - Untrusted resolved framework params/query. @param open - Server-selected inward page use case. @returns A current safe reviewer snapshot or Spanish failure without private partial data. */
export async function loadAdmissionReviewPageState(input: unknown, open: () => Promise<Pick<GetAdmissionReviewPageUseCase, "execute">>): Promise<AdmissionReviewPageState> {
  return loadAdmissionLeaderPageState({
    input, inputSchema: admissionReviewPageInputSchema, open, stateSchema: admissionReviewPageStateSchema,
    read: (page, { params, query }, requestId) => {
      const { [ADMISSION_NAVIGATION.requestQuery]: selectedId, ...filters } = query;
      return page.execute({ slug: params.slug, requestId, filters, ...(selectedId ? { admissionRequestId: selectedId } : {}) });
    },
    diagnostic: { operation: "load_admission_review_page", readFailed: "Admission reviewer page read failed", loadFailed: "Admission reviewer page could not load safe state" },
  });
}
