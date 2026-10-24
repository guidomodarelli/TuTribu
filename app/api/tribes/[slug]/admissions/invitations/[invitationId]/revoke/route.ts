/** Composes explicitly confirmed revocation without reinterpreting a stale resource state. @module admission-personal-invitation-revoke-route */
import { createPersonalInvitationManagementRequestModule } from "@/src/modules/setup";
import { createPersonalInvitationManagementHandlers } from "@/src/modules/academy-admissions/infrastructure/api/personal-invitation-management-handlers";

/** @param request - Original operation, observed version, action and internal reason. @param context - Exact native resource. @returns Original atomic withdrawal or a safe conflict requiring new confirmation. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; invitationId: string }> }) {
  return createPersonalInvitationManagementHandlers(createPersonalInvitationManagementRequestModule).revoke(request, context);
}
