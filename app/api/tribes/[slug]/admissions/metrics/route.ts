/** Serves actual current leader aggregates without secrets, cross-tribe data or caller-selected dimensions. @module admission-metrics-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionActivityHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-activity-handlers";
/** @param request - Native request. @param context - Framework slug selection. @returns Own finite aggregate or safe current denial. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionActivityHandlers(async () => { const modules = await createAdmissionRequestModules(); return { resolveTribe: modules.queries.resolveTribe, observations: modules.observations }; }).metrics(request, context);
}
