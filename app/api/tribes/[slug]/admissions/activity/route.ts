/** Serves the current leader's bounded private history through application-owned queries. @module admission-activity-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionActivityHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-activity-handlers";
/** @param request - Native same-origin request. @param context - Framework slug. @returns Authorized own activity or a safe correlated denial. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionActivityHandlers(async () => { const modules = await createAdmissionRequestModules(); return { resolveTribe: modules.queries.resolveTribe, observations: modules.observations }; }).activity(request, context);
}
