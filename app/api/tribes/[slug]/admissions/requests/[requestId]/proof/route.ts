/** Composes DB-only proof attachment to an own pending request through native session and original version checks. @module admission-request-proof-route */
import { createAdmissionProofApplicationRequestModule } from "@/src/modules/setup";
import { createAdmissionProofAttachmentHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-contact-verification-handlers";

/** @param request - Opaque proof reference and observed request version. @param context - Native own pending request params. @returns Incremental original pending state or safe failure. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return createAdmissionProofAttachmentHandler(createAdmissionProofApplicationRequestModule)(request, context);
}
