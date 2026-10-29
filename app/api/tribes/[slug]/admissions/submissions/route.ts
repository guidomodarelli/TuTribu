/** Explicit admission presentation uses actual account authority outside membership middleware. @module admission-submissions-route */
import { admissionMutationHandlers } from "../admission-route-handlers";
/** @param request - Native explicit submission. @param context - Framework params. @returns Confirmed original safe admission outcome or failure. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionMutationHandlers.submit(request, context);
}
