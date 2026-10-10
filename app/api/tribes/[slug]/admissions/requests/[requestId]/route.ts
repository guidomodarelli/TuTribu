/** Reads an exact current reviewer detail without granting membership or configuration access. @module admission-review-detail-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionReviewHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-review-handlers";

/** @param request - Native HTTP request. @param context - Exact tribe slug and request id. @returns Authorized private detail or safe current absence/denial. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return createAdmissionReviewHandlers(async () => { const modules = await createAdmissionRequestModules(); return { resolveTribe: modules.queries.resolveTribe, review: modules.reviews.review }; }).detail(request, context);
}
