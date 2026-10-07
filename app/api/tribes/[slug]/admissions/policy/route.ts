/** Reads current leader policy without initializing or activating it. @module admission-policy-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionPolicyQueryHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-query-handler";
import { createAdmissionPolicyCommandHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-command-handlers";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param request - Native readonly request. @param context - Framework dynamic params. @returns Current safe policy/impact, including genuine protected absence. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionPolicyQueryHandler(async () => {
    const modules = await createAdmissionRequestModules();
    return { resolveTribe: modules.queries.resolveTribe, policy: modules.policyQuery };
  })(request, context);
}

/** @param request - Explicit confirmed first-configuration request. @param context - Framework params. @returns Closed draft creation after actual leader/recency checks. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionPolicyCommandHandlers(async () => {
    const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
    return { resolveTribe: modules.queries.resolveTribe, policy: modules.policyCommands };
  }).initialize(request, context);
}

/** @param request - Explicit observed-version settings request. @param context - Framework params. @returns Original CAS change without implicit activation or provider work. */
export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionPolicyCommandHandlers(async () => {
    const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
    return { resolveTribe: modules.queries.resolveTribe, policy: modules.policyCommands };
  }).update(request, context);
}
