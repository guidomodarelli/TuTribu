/** Composes local admission code verification with native identity and fixed proof purpose. @module admission-challenge-verify-route */
import { createAdmissionContactVerificationRequestModule } from "@/src/modules/setup";
import { createAdmissionContactVerificationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-contact-verification-handlers";

/** @param request - Exact local code and original operation identity. @param context - Native own challenge params. @returns Opaque admission proof or safe failure. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; challengeId: string }> }) {
  return createAdmissionContactVerificationHandlers(createAdmissionContactVerificationRequestModule).verify(request, context);
}
