/** Own request query requires a global account, never a membership. @module admission-own-request-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionQueryHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-query-handlers";

/** @param request - Native HTTP request. @param context - Framework dynamic params. @returns Own masked request or genuine absence. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionQueryHandlers(async () => (await createAdmissionRequestModules()).queries).own(request, context);
}
