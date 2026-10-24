/** Composes explicit applicant code issuance through native request authority and focal post-commit dispatch. @module admission-challenges-route */
import { createAdmissionContactVerificationRequestModule } from "@/src/modules/setup";
import { createAdmissionContactVerificationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-contact-verification-handlers";

/** @param request - Same-origin explicit contact/channel confirmation. @param context - Native tribe params. @returns Original safe challenge or registered progress. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionContactVerificationHandlers(createAdmissionContactVerificationRequestModule).issue(request, context);
}
