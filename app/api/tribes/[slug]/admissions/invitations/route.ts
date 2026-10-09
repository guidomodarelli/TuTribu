/** Composes current leader metadata and explicit personal issuance without provider transport. @module admission-personal-invitations-route */
import { createPersonalInvitationManagementRequestModule } from "@/src/modules/setup";
import { createPersonalInvitationManagementHandlers } from "@/src/modules/academy-admissions/infrastructure/api/personal-invitation-management-handlers";

/** @param request - Own bounded history query. @param context - Native tribe params. @returns Current leader metadata without token recovery or writes. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createPersonalInvitationManagementHandlers(createPersonalInvitationManagementRequestModule).list(request, context);
}
/** @param request - Explicit confirmed recipient/restrictions proposal. @param context - Native tribe params. @returns Original creation, with a one-view URL only on initial acknowledgement. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createPersonalInvitationManagementHandlers(createPersonalInvitationManagementRequestModule).create(request, context);
}
