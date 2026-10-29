/** Public/own admission overview outside membership middleware. @module admission-overview-route */
import { admissionQueryHandlers } from "../admission-route-handlers";

/** @param request - Native HTTP request. @param context - Framework dynamic params. @returns Safe read-only overview. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionQueryHandlers.overview(request, context);
}
