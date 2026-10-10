/** Composes explicit replacement of an own admission code without changing recipient or original worker authority. @module admission-challenge-resend-route */
import { createAdmissionContactVerificationRequestModule } from "@/src/modules/setup";
import { createAdmissionContactVerificationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-contact-verification-handlers";

/** @param request - Confirmed original resend or explicit permitted SMS alternative. @param context - Native own challenge params. @returns Replacement metadata or original progress. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; challengeId: string }> }) {
  return createAdmissionContactVerificationHandlers(createAdmissionContactVerificationRequestModule).resend(request, context);
}
