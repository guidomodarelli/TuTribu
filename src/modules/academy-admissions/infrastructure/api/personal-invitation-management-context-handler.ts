/** Exposes one native private management snapshot for interactive reads without a command or issuer. @module personal-invitation-management-context-handler */
import "server-only";
import type { GetPersonalInvitationManagementPageUseCase } from "../../application/use-cases/get-personal-invitation-management-page-use-case";
import { admissionInvitationPageInputSchema } from "../../constants/admission-route-input";
import { personalInvitationManagementPageStateSchema, PERSONAL_INVITATION_MANAGEMENT_PAGE_OPERATION } from "../../constants/personal-invitation-management-page";
import { createAdmissionRouteBoundary } from "./admission-route-http";

/** @param open - Native read-only page composition. @returns A guarded private GET; input never supplies actor or authority. */
export function createPersonalInvitationManagementContextHandler(open: () => Promise<{ page: Pick<GetPersonalInvitationManagementPageUseCase, "execute">; publicOrigin: () => string }>) {
  return async (request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    const boundary = createAdmissionRouteBoundary({ request, operation: PERSONAL_INVITATION_MANAGEMENT_PAGE_OPERATION });
    try {
      const input = boundary.input("params", admissionInvitationPageInputSchema, { params: await context.params, query: Object.fromEntries(new URL(request.url).searchParams) });
      if (!input.usable) return input.response;
      const services = await open(), result = await services.page.execute({ slug: input.value.params.slug, filters: input.value.query, requestId: boundary.requestContext.requestId });
      return result.ok ? boundary.success(personalInvitationManagementPageStateSchema, result.value.kind === "ready" ? { ...result.value, publicOrigin: new URL(services.publicOrigin()).origin } : result.value) : boundary.failure(result.failure);
    } catch (error) { return boundary.unexpected(error); }
  };
}
