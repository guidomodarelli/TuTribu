/** Loads one read-only personal page snapshot with current native account checks. @module get-personal-invitation-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { GetPersonalInvitationOverviewUseCase } from "./get-personal-invitation-overview-use-case";
import { personalInvitationPageStateSchema } from "../results/personal-invitation-page-state";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { PERSONAL_INVITATION_PAGE_KIND } from "../../constants/personal-invitation-page";

/** Reads cannot claim an operation, issue a code or redeem an invitation. */
export class GetPersonalInvitationPageUseCase {
  /** @param accounts - Current native identity. @param preview - Safe read-only application projection. @param clock - Fresh time after all awaited reads. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly preview: Pick<GetPersonalInvitationOverviewUseCase, "execute">, private readonly clock: () => Date) {}

  /** @param query - Boundary-validated token and correlation. @returns A safe deterministic snapshot or an owned failure without secret diagnostics. */
  async execute(query: { token: string; requestId: string; proofId?: string }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (first && !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const result = await this.preview.execute(query, first);
      if (!result.ok) return result;
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (first ? !current || current.userId !== first.userId || current.session.id !== first.session.id || current.normalizedEmail !== first.normalizedEmail || !isAuthenticatedSessionLive(current.session.expiresAt, now) : current !== null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const parsed = personalInvitationPageStateSchema.safeParse({ kind: PERSONAL_INVITATION_PAGE_KIND.ready, preview: result.value, viewerId: current?.userId ?? null, renderedAt: now.toISOString() });
      if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
