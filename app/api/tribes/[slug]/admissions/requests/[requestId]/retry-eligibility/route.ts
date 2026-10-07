/** A current leader with exact global recency may advance a corrective presentation with a reason. @module admission-retry-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createAdmissionMutationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-mutation-handlers";
/** @param request - Native explicit reason/version/operation. @param context - Framework request reference. @returns Original retry metadata without membership or terminal rewrites. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return createAdmissionMutationHandlers(async () => { const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance); return { ...modules.manual, resolveTribe: modules.queries.resolveTribe }; }).retry(request, context);
}
