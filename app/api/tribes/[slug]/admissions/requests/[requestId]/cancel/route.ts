/** Cancellation uses current own or leader-management authority, including during pause. @module admission-cancel-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createAdmissionMutationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-mutation-handlers";
/** @param request - Native versioned confirmation. @param context - Framework resource params. @returns Confirmed original terminal transition. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return createAdmissionMutationHandlers(async () => { const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance); return { ...modules.manual, resolveTribe: modules.queries.resolveTribe }; }).cancel(request, context);
}
