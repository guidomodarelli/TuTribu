/** Validates personal page runtime input once and owns safe token-free failure diagnostics. @module personal-invitation-page */
import "server-only";
import type { GetPersonalInvitationPageUseCase } from "../../application/use-cases/get-personal-invitation-page-use-case";
import { personalInvitationPageStateSchema, type PersonalInvitationPageState } from "../../application/results/personal-invitation-page-state";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";
import type { AdmissionErrorCode } from "../../application/results/admission-errors";
import { PERSONAL_INVITATION_PAGE_KIND, PERSONAL_INVITATION_PAGE_OPERATION, personalInvitationPageInputSchema } from "../../constants/personal-invitation-page";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** @param input - Untrusted resolved params/query. @param open - Native read-only framework composition. @returns Allowlisted SSR state without the route token, recipient or private cause. */
export async function loadPersonalInvitationPageState(input: unknown, open: () => Promise<{ page: Pick<GetPersonalInvitationPageUseCase, "execute"> }>): Promise<PersonalInvitationPageState> {
  const failed = (code: AdmissionErrorCode): PersonalInvitationPageState => ({ kind: PERSONAL_INVITATION_PAGE_KIND.unavailable, code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = personalInvitationPageInputSchema.safeParse(input);
  if (!parsed.success) return failed(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  const logger = createServerLogger({ feature: "academy-admissions", operation: PERSONAL_INVITATION_PAGE_OPERATION, ...context });
  try {
    const pageModule = await open();
    const loaded = await pageModule.page.execute({ token: parsed.data.params.token, requestId: context.requestId });
    if (!loaded.ok) {
      if (loaded.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || loaded.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) logger.error({ message: "Personal invitation page application read failed", metadata: { code: loaded.failure.code } });
      return failed(loaded.failure.code);
    }
    const state = personalInvitationPageStateSchema.safeParse(loaded.value);
    if (state.success) return state.data;
    logger.error({ message: "Personal invitation page returned an unusable own state", metadata: { code: ADMISSION_ERROR_CODE.publicContractUnusable } });
    return failed(ADMISSION_ERROR_CODE.publicContractUnusable);
  } catch {
    logger.error({ message: "Personal invitation page could not load safe state", metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failed(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
