/** Activates only through current sensitive leadership and the complete locked cutover owner. @module admission-policy-activate-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionPolicyCommandHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-command-handlers";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param request - Explicit confirmed observed-version activation. @param context - Framework params. @returns Original outcome or a safe closed denial while required runtime paths remain incomplete. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionPolicyCommandHandlers(async () => {
    const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
    return { resolveTribe: modules.queries.resolveTribe, policy: modules.policyCommands };
  }).activate(request, context);
}
