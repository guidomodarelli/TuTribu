/** A current leader with a live session may advance a corrective presentation with a reason. @module admission-retry-route */
import { admissionMutationHandlers } from "../../../admission-route-handlers";
/** @param request - Native explicit reason/version/operation. @param context - Framework request reference. @returns Original retry metadata without membership or terminal rewrites. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return admissionMutationHandlers.retry(request, context);
}
