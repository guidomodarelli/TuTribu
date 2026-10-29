/** Serves actual current leader aggregates without secrets, cross-tribe data or caller-selected dimensions. @module admission-metrics-route */
import { admissionActivityHandlers } from "../admission-route-handlers";
/** @param request - Native request. @param context - Framework slug selection. @returns Own finite aggregate or safe current denial. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionActivityHandlers.metrics(request, context);
}
