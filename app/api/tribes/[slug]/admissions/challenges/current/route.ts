/** Composes own exact-contact selection for an explicitly confirmed resend decision. @module admission-current-challenge-route */
import { createAdmissionCurrentChallengeRequestModule } from "@/src/modules/setup";
import { createAdmissionCurrentChallengeHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-current-challenge-handler";

/** @param request - Same-origin read proposal; no write permission or actor is accepted. @param context - Native tribe params. @returns Only a safe candidate, never a proof or dispatched code. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionCurrentChallengeHandler(createAdmissionCurrentChallengeRequestModule)(request, context);
}
