/** Public/own admission overview outside membership middleware. @module admission-overview-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionQueryHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-query-handlers";

/** @param request - Native HTTP request. @param context - Framework dynamic params. @returns Safe read-only overview. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionQueryHandlers(async () => (await createAdmissionRequestModules()).queries).overview(request, context);
}
