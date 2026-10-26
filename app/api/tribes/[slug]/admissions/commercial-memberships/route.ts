/** Lists the leader's memberships blocked by payment that still need a decision. @module commercial-membership-review-list-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createCommercialMembershipReviewHandlers } from "@/src/modules/academy-admissions/infrastructure/api/commercial-membership-review-handlers";

/** @param request - Native leader read. @param context - Framework params. @returns Pending cases and recorded decision count. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createCommercialMembershipReviewHandlers(async () => {
    const modules = await createAdmissionRequestModules();
    return { resolveTribe: modules.queries.resolveTribe, reviews: modules.commercialReviews };
  }).list(request, context);
}
