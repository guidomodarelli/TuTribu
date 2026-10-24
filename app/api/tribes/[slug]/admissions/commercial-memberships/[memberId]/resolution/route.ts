/** Records one audited prospective decision for a membership blocked by payment. @module commercial-membership-resolution-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createCommercialMembershipReviewHandlers } from "@/src/modules/academy-admissions/infrastructure/api/commercial-membership-review-handlers";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param request - Same-origin confirmed decision. @param context - Framework params. @returns The original confirmed result or registered progress. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; memberId: string }> }) {
  return createCommercialMembershipReviewHandlers(async () => {
    const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
    return { resolveTribe: modules.queries.resolveTribe, reviews: modules.commercialReviews };
  }).resolve(request, context);
}
