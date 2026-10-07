/** Reads current cutover blockers without mutating policy or issuing permission. @module admission-policy-preflight-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionPreflightQueryHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-preflight-query-handler";

/** @param request - Native informational request. @param context - Framework dynamic params. @returns Safe aggregate cutover reasons after current leader authorization. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionPreflightQueryHandler(async () => {
    const modules = await createAdmissionRequestModules();
    return { resolveTribe: modules.queries.resolveTribe, preflight: modules.policyPreflight };
  })(request, context);
}
