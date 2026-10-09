/** Validates private management runtime input before selecting native composition and safe SSR props. @module personal-invitation-management-page */
import "server-only";
import type { GetPersonalInvitationManagementPageUseCase } from "../../application/use-cases/get-personal-invitation-management-page-use-case";
import type { PersonalInvitationManagementPageState } from "../../application/results/personal-invitation-management-page-state";
import { personalInvitationManagementPageStateSchema, PERSONAL_INVITATION_MANAGEMENT_PAGE_OPERATION, PERSONAL_INVITATION_MANAGEMENT_PAGE_DIAGNOSTIC } from "../../constants/personal-invitation-management-page";
import { ADMISSION_DIAGNOSTIC_FEATURE } from "../../constants/admission-diagnostics";
import { admissionInvitationPageInputSchema } from "../../constants/admission-route-input";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** @param input - Untrusted resolved params/query. @param open - Native server-selected read-only entrypoint. @returns Safe current leader state with no raw exception or partial metadata. */
export async function loadPersonalInvitationManagementPageState(input: unknown, open: () => Promise<Pick<GetPersonalInvitationManagementPageUseCase, "execute">>): Promise<PersonalInvitationManagementPageState> {
  const parsed = admissionInvitationPageInputSchema.safeParse(input);
  const failure = (code: AdmissionErrorCode): PersonalInvitationManagementPageState => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers()), logger = createServerLogger({ feature: ADMISSION_DIAGNOSTIC_FEATURE, operation: PERSONAL_INVITATION_MANAGEMENT_PAGE_OPERATION, ...context });
  try {
    const reader = await open(), result = await reader.execute({ slug: parsed.data.params.slug, filters: parsed.data.query, requestId: context.requestId });
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) logger.error({ message: PERSONAL_INVITATION_MANAGEMENT_PAGE_DIAGNOSTIC.readFailure, metadata: { code: result.failure.code } });
      return failure(result.failure.code);
    }
    const state = personalInvitationManagementPageStateSchema.safeParse(result.value);
    if (state.success) return state.data;
    logger.error({ message: PERSONAL_INVITATION_MANAGEMENT_PAGE_DIAGNOSTIC.contractFailure, metadata: { code: ADMISSION_ERROR_CODE.publicContractUnusable } });
    return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
  } catch {
    logger.error({ message: PERSONAL_INVITATION_MANAGEMENT_PAGE_DIAGNOSTIC.loadFailure, metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failure(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
