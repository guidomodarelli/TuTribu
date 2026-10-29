/** Cancellation uses current own or leader-management authority, including during pause. @module admission-cancel-route */
import { admissionMutationHandlers } from "../../../admission-route-handlers";
/** @param request - Native versioned confirmation. @param context - Framework resource params. @returns Confirmed original terminal transition. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return admissionMutationHandlers.cancel(request, context);
}
