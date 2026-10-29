/** Pauses admission without clearing its irreversible marker, contact choice or evidence epoch. @module admission-policy-pause-route */
import { admissionPolicyCommandHandlers } from "../../admission-route-handlers";

/** @param request - Reasoned confirmed closure of the observed version. @param context - Framework params. @returns Original pause without any provider dependency or implicit reopening. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return admissionPolicyCommandHandlers.pause(request, context);
}
