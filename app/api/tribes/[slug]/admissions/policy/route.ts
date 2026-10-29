/** Reads current leader policy without initializing or activating it. @module admission-policy-route */
import { admissionPolicyCommandHandlers } from "../admission-route-handlers";
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionPolicyQueryHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-query-handler";

/** @param request - Native readonly request. @param context - Framework dynamic params. @returns Current safe policy/impact, including genuine protected absence. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionPolicyQueryHandler(async () => {
    const modules = await createAdmissionRequestModules();
    return { resolveTribe: modules.queries.resolveTribe, policy: modules.policyQuery };
  })(request, context);
}

/** @param request - Explicit confirmed first-configuration request. @param context - Framework params. @returns Closed draft creation after actual leader checks. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionPolicyCommandHandlers.initialize(request, context);
}

/** @param request - Explicit observed-version settings request. @param context - Framework params. @returns Original CAS change without implicit activation or provider work. */
export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionPolicyCommandHandlers.update(request, context);
}
