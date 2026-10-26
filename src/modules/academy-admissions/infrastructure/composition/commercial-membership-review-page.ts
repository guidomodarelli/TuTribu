/** Validates the rules route input and loads the leader's commercial membership review for SSR. @module commercial-membership-review-page */
import "server-only";
import { z } from "zod";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import type { ManageCommercialMembershipReviewsUseCases } from "../../application/use-cases/manage-commercial-membership-reviews-use-cases";
import type { CommercialMembershipReviewPageState } from "../../application/results/commercial-membership-review-page-state";
import { commercialMembershipReviewListSchema } from "../../application/results/commercial-membership-review-schemas";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

type ReviewPageServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  reviews: Pick<ManageCommercialMembershipReviewsUseCases, "read">;
};
const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema });

/**
 * @param input - Untrusted resolved route params.
 * @param open - Server-selected composition.
 * @returns The current leader's pending cases, or a contained failure.
 */
export async function loadCommercialMembershipReviewState(input: unknown, open: () => Promise<ReviewPageServices>): Promise<CommercialMembershipReviewPageState> {
  const failure = (code: AdmissionErrorCode): CommercialMembershipReviewPageState => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const services = await open();
    const identity = await services.resolveTribe.execute({ slug: parsed.data.params.slug, requestId: context.requestId });
    if (!identity.ok) return failure(identity.failure.code);
    const result = await services.reviews.read({ tribeId: identity.value.tribeId, requestId: context.requestId });
    if (!result.ok) return failure(result.failure.code);
    const list = commercialMembershipReviewListSchema.safeParse(result.value);
    if (list.success) return { kind: "ready", list: list.data };
    throw new Error("Commercial membership review returned an unusable own state");
  } catch {
    createServerLogger({ feature: "academy-admissions", operation: "load_commercial_membership_review", ...context }).error({ message: "Commercial membership review could not load safe state", metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failure(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
