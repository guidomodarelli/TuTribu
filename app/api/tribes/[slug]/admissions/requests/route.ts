/** Reads the current active leader/guardian inbox through application-owned queries. @module admission-review-list-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionReviewHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-review-handlers";

/** @param request - Native HTTP request. @param context - Framework tribe slug. @returns Current authorized bounded reviewer DTOs. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionReviewHandlers(async () => { const modules = await createAdmissionRequestModules(); return { resolveTribe: modules.queries.resolveTribe, review: modules.reviews.review }; }).list(request, context);
}
