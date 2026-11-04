/** Validates private management runtime input before selecting native composition and safe SSR props. @module personal-invitation-management-page */
import "server-only";
import type { GetPersonalInvitationManagementPageUseCase } from "../../application/use-cases/get-personal-invitation-management-page-use-case";
import type { PersonalInvitationManagementPageState } from "../../application/results/personal-invitation-management-page-state";
import { personalInvitationManagementPageStateSchema, PERSONAL_INVITATION_MANAGEMENT_PAGE_OPERATION, PERSONAL_INVITATION_MANAGEMENT_PAGE_DIAGNOSTIC } from "../../constants/personal-invitation-management-page";
import { admissionInvitationPageInputSchema } from "../../constants/admission-route-input";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { createAdmissionPageDiagnostics, loadAdmissionPageRead, unavailableAdmissionPage } from "./admission-page-diagnostics";

/** @param value - Page result. @returns Whether it is a ready state, the only one that carries the public origin of its links. */
function isReadyState(value: unknown): value is { kind: "ready" } {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "ready";
}

/**
 * @param input - Untrusted resolved params/query. @param open - Native server-selected read-only entrypoint.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Safe current leader state with no raw exception or partial metadata.
 */
export async function loadPersonalInvitationManagementPageState(input: unknown, open: () => Promise<Pick<GetPersonalInvitationManagementPageUseCase, "execute"> & { publicOrigin?: () => string }>, requestHeaders?: Pick<Headers, "get">): Promise<PersonalInvitationManagementPageState> {
  const parsed = admissionInvitationPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const diagnostics = createAdmissionPageDiagnostics(PERSONAL_INVITATION_MANAGEMENT_PAGE_OPERATION, requestHeaders);
  let publicOrigin: (() => string) | undefined;
  return loadAdmissionPageRead({
    diagnostics, stateSchema: personalInvitationManagementPageStateSchema, messages: PERSONAL_INVITATION_MANAGEMENT_PAGE_DIAGNOSTIC,
    read: async () => { const reader = await open(); publicOrigin = reader.publicOrigin; return reader.execute({ slug: parsed.data.params.slug, filters: parsed.data.query, requestId: diagnostics.context.requestId }); },
    // The public origin of one-time links is composed on the server, never read from the request.
    project: (value) => isReadyState(value) && publicOrigin ? { ...value, publicOrigin: new URL(publicOrigin()).origin } : value,
  });
}
