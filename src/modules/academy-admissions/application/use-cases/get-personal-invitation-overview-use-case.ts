/** Projects a personal preview without effects, recipient disclosure or assuming possession is authority. @module get-personal-invitation-overview-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { PersonalInvitationOverviewReader } from "../../domain/repositories/personal-invitation-overview-reader";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { PERSONAL_INVITATION_OVERVIEW_STATE, PERSONAL_INVITATION_OVERVIEW_MESSAGE } from "../../constants/personal-invitation-overview";
import { personalInvitationOverviewSchema } from "../../constants/personal-invitation-overview-schemas";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { projectPersonalInvitationOverview } from "../results/personal-invitation-overview";

/** The writer still rechecks all current facts before explicit confirmation. */
export class GetPersonalInvitationOverviewUseCase {
  /** @param accounts - Actual native current session/account. @param reader - Private read-only token/eligibility owner. @param clock - Fresh time after awaited reads. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly reader: PersonalInvitationOverviewReader, private readonly clock: () => Date) {}

  /** @param query - Boundary-validated token/correlation and optional own proof reference. @returns A guarded generic or authorized preview, never the recipient, name, token or cryptographic reference. */
  async execute(query: { token: string; requestId: string; proofId?: string }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first) return { ok: true as const, value: personalInvitationOverviewSchema.parse({ state: PERSONAL_INVITATION_OVERVIEW_STATE.signInRequired, safeMessage: PERSONAL_INVITATION_OVERVIEW_MESSAGE.signIn }) };
      if (!isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const facts = await this.reader.readOverview(query, { userId: first.userId, sessionId: first.session.id });
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (!current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      return { ok: true as const, value: projectPersonalInvitationOverview(facts, current, now) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
