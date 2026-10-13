/** Explicit admission presentation uses actual account authority outside membership middleware. @module admission-submissions-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createAdmissionMutationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-mutation-handlers";
/** @param request - Native explicit submission. @param context - Framework params. @returns Confirmed original safe admission outcome or failure. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionMutationHandlers(async () => { const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance); return { ...modules.manual, resolveTribe: modules.queries.resolveTribe }; }).submit(request, context);
}
