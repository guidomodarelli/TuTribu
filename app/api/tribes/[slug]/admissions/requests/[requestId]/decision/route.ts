/** Individual review preserves actual role and prevents self approval before atomic persistence. @module admission-decision-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createAdmissionMutationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-mutation-handlers";
/** @param request - Native versioned reviewer intent. @param context - Framework resource params. @returns Confirmed minimal original decision. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return createAdmissionMutationHandlers(async () => { const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance); return { ...modules.manual, resolveTribe: modules.queries.resolveTribe }; }).decide(request, context);
}
