/** Individual review preserves actual role and prevents self approval before atomic persistence. @module admission-decision-route */
import { admissionMutationHandlers } from "../../../admission-route-handlers";
/** @param request - Native versioned reviewer intent. @param context - Framework resource params. @returns Confirmed minimal original decision. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return admissionMutationHandlers.decide(request, context);
}
