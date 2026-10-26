/** Original-operation recovery is a current-account read outside membership middleware. @module admission-operation-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionOperationHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-operation-handler";
/** @param request - Native readonly query. @param context - Framework resource params. @returns Genuine registered original state/result or a safe failure. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; operationId: string }> }) {
  return createAdmissionOperationHandler(async () => (await createAdmissionRequestModules()).queries)(request, context);
}
