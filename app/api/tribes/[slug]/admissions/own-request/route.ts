/** Own request query requires a global account, never a membership. @module admission-own-request-route */
import { admissionQueryHandlers } from "../admission-route-handlers";

/** @param request - Native HTTP request. @param context - Framework dynamic params. @returns Own masked request or genuine absence. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionQueryHandlers.own(request, context);
}
