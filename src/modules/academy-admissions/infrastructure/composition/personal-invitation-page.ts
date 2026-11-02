/** Validates personal page runtime input once and owns safe token-free failure diagnostics. @module personal-invitation-page */
import "server-only";
import type { GetPersonalInvitationPageUseCase } from "../../application/use-cases/get-personal-invitation-page-use-case";
import type { PersonalInvitationPageState } from "../../application/results/personal-invitation-page-state";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { PERSONAL_INVITATION_PAGE_OPERATION, personalInvitationPageInputSchema, personalInvitationPageStateSchema } from "../../constants/personal-invitation-page";
import { createAdmissionPageDiagnostics, loadAdmissionPageRead, unavailableAdmissionPage } from "./admission-page-diagnostics";

/** Fixed messages of the personal invitation loader; the token never reaches a log. */
const PERSONAL_INVITATION_PAGE_DIAGNOSTIC = { readFailed: "Personal invitation page application read failed", contractRejected: "Personal invitation page returned an unusable own state", loadFailed: "Personal invitation page could not load safe state" } as const;

/**
 * @param input - Untrusted resolved params/query. @param open - Native read-only framework composition.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Allowlisted SSR state without the route token, recipient or private cause.
 */
export async function loadPersonalInvitationPageState(input: unknown, open: () => Promise<{ page: Pick<GetPersonalInvitationPageUseCase, "execute"> }>, requestHeaders?: Pick<Headers, "get">): Promise<PersonalInvitationPageState> {
  const parsed = personalInvitationPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const diagnostics = createAdmissionPageDiagnostics(PERSONAL_INVITATION_PAGE_OPERATION, requestHeaders);
  return loadAdmissionPageRead({
    diagnostics, stateSchema: personalInvitationPageStateSchema, messages: PERSONAL_INVITATION_PAGE_DIAGNOSTIC,
    read: async () => (await open()).page.execute({ token: parsed.data.params.token, requestId: diagnostics.context.requestId }),
  });
}
