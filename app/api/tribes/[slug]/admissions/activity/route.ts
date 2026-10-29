/** Serves the current leader's bounded private history through application-owned queries. @module admission-activity-route */
import { admissionActivityHandlers } from "../admission-route-handlers";
/** @param request - Native same-origin request. @param context - Framework slug. @returns Authorized own activity or a safe correlated denial. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionActivityHandlers.activity(request, context);
}
