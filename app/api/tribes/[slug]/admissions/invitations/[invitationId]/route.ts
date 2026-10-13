/** Composes current private resource metadata and descriptive CAS edits only. @module admission-personal-invitation-route */
import { createPersonalInvitationManagementRequestModule } from "@/src/modules/setup";
import { createPersonalInvitationManagementHandlers } from "@/src/modules/academy-admissions/infrastructure/api/personal-invitation-management-handlers";

/** @param request - Own empty query. @param context - Exact native resource. @returns Authorized current metadata without secret material. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; invitationId: string }> }) {
  return createPersonalInvitationManagementHandlers(createPersonalInvitationManagementRequestModule).read(request, context);
}
/** @param request - Explicit original operation, observed version and new internal name. @param context - Exact native resource. @returns Historical minimal result without changing recipient or restrictions. */
export async function PATCH(request: Request, context: { params: Promise<{ slug: string; invitationId: string }> }) {
  return createPersonalInvitationManagementHandlers(createPersonalInvitationManagementRequestModule).rename(request, context);
}
