/** Wires an explicit reviewer selection to one atomic DB-only application owner. @module admission-batch-decision-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createAdmissionBatchDecisionHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-batch-decision-handler";

/** @param request - Native versioned batch intent with explicit confirmation. @param context - Framework tenant params. @returns The minimal original result, without dispatching external messages. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionBatchDecisionHandler(async () => {
    const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
    return { resolveTribe: modules.queries.resolveTribe, decideBatch: modules.manual.decideBatch };
  })(request, context);
}
