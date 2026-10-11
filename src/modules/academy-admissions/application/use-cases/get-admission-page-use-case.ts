/** Builds one native current-account page snapshot through read-only application ports. @module get-admission-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { GetAdmissionOverviewUseCase } from "./get-admission-overview-use-case";
import type { GetOwnAdmissionUseCases } from "./get-own-admission-use-cases";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import { admissionPageStateSchema } from "../results/admission-page-state";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import type { LegacyAdmissionInvitationReader } from "../../domain/repositories/legacy-admission-invitation-reader";
import { ADMISSION_OVERVIEW_STATE } from "../../constants/admission-public-contract";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";

/** Application reads never claim an operation or use membership as a login prerequisite. */
export class GetAdmissionPageUseCase {
  /** @param accounts - Current native server identity. @param readers - Own composed use cases. @param clock - Fresh time after all reads. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { overview: Pick<GetAdmissionOverviewUseCase, "execute">; own: Pick<GetOwnAdmissionUseCases, "getOwn">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">; legacyInvitations?: LegacyAdmissionInvitationReader }, private readonly clock: () => Date) {}

  /** @param query - Validated slug, optional exact request id and correlation. @returns An allowlisted page snapshot with a deterministic clock or safe Spanish failure. */
  async execute(query: { slug: string; requestId: string; admissionRequestId?: string; legacyInvitationToken?: string }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (first && !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const overview = await this.readers.overview.execute({ slug: query.slug, requestId: query.requestId });
      if (!overview.ok) throw new AdmissionOperationError(overview.failure.code);
      if (query.legacyInvitationToken && first && overview.value.request?.status !== ADMISSION_REQUEST_STATUS.pending && (overview.value.state === ADMISSION_OVERVIEW_STATE.available || overview.value.state === ADMISSION_OVERVIEW_STATE.verificationRequired)) {
        const tribe = await this.readers.resolveTribe.execute({ slug: query.slug, requestId: query.requestId });
        if (!tribe.ok) throw new AdmissionOperationError(tribe.failure.code);
        const arrival = await this.readers.legacyInvitations?.findActiveByToken({ userId: first.userId, sessionId: first.session.id, tribeId: tribe.value.tribeId, token: query.legacyInvitationToken });
        if (!arrival) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
      }
      let request = overview.value.request ?? null;
      if (query.admissionRequestId) {
        if (!first) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        const tribe = await this.readers.resolveTribe.execute({ slug: query.slug, requestId: query.requestId });
        if (!tribe.ok) throw new AdmissionOperationError(tribe.failure.code);
        const exact = await this.readers.own.getOwn({ tribeId: tribe.value.tribeId, requestId: query.requestId, admissionRequestId: query.admissionRequestId });
        if (!exact.ok) throw new AdmissionOperationError(exact.failure.code);
        if (!exact.value) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        request = exact.value;
      }
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (first ? !current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now) : current !== null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const parsed = admissionPageStateSchema.safeParse({ kind: "ready", overview: overview.value, request, viewerId: first?.userId ?? null, renderedAt: now.toISOString() });
      if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) {
      return admissionOperationFailure(error);
    }
  }
}
