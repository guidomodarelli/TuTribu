/** Composes the single private management read used after explicit browser interactions. @module personal-invitation-management-context-route */
import { createPersonalInvitationManagementRequestModule } from "@/src/modules/setup";
import { createPersonalInvitationManagementContextHandler } from "@/src/modules/academy-admissions/infrastructure/api/personal-invitation-management-context-handler";

/** @param request - Bounded own filters. @param context - Native tribe. @returns Current safe private snapshot without initialization or emission. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createPersonalInvitationManagementContextHandler(createPersonalInvitationManagementRequestModule)(request, context);
}
