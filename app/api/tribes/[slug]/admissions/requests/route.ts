/** Reads the current active leader/guardian inbox through application-owned queries. @module admission-review-list-route */
import { admissionReviewHandlers } from "../admission-route-handlers";

/** @param request - Native HTTP request. @param context - Framework tribe slug. @returns Current authorized bounded reviewer DTOs. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionReviewHandlers.list(request, context);
}
