/** Reads an exact current reviewer detail without granting membership or configuration access. @module admission-review-detail-route */
import { admissionReviewHandlers } from "../../admission-route-handlers";

/** @param request - Native HTTP request. @param context - Exact tribe slug and request id. @returns Authorized private detail or safe current absence/denial. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return admissionReviewHandlers.detail(request, context);
}
