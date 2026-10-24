/** Pauses admission without clearing its irreversible marker, contact choice or evidence epoch. @module admission-policy-pause-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionPolicyCommandHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-command-handlers";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param request - Reasoned confirmed closure of the observed version. @param context - Framework params. @returns Original pause without any provider dependency or implicit reopening. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionPolicyCommandHandlers(async () => {
    const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
    return { resolveTribe: modules.queries.resolveTribe, policy: modules.policyCommands };
  }).pause(request, context);
}
