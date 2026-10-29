/** Activates only through current sensitive leadership and the complete locked cutover owner. @module admission-policy-activate-route */
import { admissionPolicyCommandHandlers } from "../../admission-route-handlers";

/** @param request - Explicit confirmed observed-version activation. @param context - Framework params. @returns Original outcome or a safe closed denial while required runtime paths remain incomplete. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionPolicyCommandHandlers.activate(request, context);
}
