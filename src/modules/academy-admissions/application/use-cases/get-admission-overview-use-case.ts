/** Projects public/own admission entry state without claiming work or consuming a link. @module get-admission-overview-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { AdmissionOverviewReader } from "@/src/modules/academy-admissions/domain/repositories/admission-query-reader";
import { admissionOverviewSchema, admissionRequestSchema } from "../results/admission-flow-result-schemas";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_OVERVIEW_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-overview";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { evaluateAcademyMembershipEligibility } from "@/src/modules/tribes/domain/value-objects/academy-membership-eligibility";
import { ACADEMY_MEMBERSHIP_ELIGIBILITY } from "@/src/modules/tribes/constants/academy-membership";

/** The application owns navigation hints; the writer rechecks real eligibility under locks. */
export class GetAdmissionOverviewUseCase {
  /** @param accounts - Native current account; null is an explicit public read. @param reader - Own read-only fact projection, not a provider DTO. @param clock - Fresh time sampled after awaited facts. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly reader: AdmissionOverviewReader<unknown>, private readonly clock: () => Date) {}
  /** @param query - Boundary-validated tribe slug and safe correlation. @returns Safe overview or a closed failure, without any new request, operation or message. */
  async execute(query: { slug: string; requestId: string }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (first && !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const scope = first ? { userId: first.userId, sessionId: first.session.id } : null;
      const facts = await this.reader.readOverview(query, scope);
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (first ? !current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now) : current !== null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (!facts || facts.tribe.slug !== query.slug) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      if (!scope && (facts.membership !== null || facts.request !== null)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      const request = facts.request === null ? null : admissionRequestSchema.parse(facts.request);
      const membership = facts.membership;
      const membershipEligibility = evaluateAcademyMembershipEligibility(membership);
      let state: typeof ADMISSION_OVERVIEW_STATE[keyof typeof ADMISSION_OVERVIEW_STATE] = ADMISSION_OVERVIEW_STATE.available;
      let nextAction: typeof ADMISSION_NEXT_ACTION[keyof typeof ADMISSION_NEXT_ACTION] = ADMISSION_NEXT_ACTION.requestAdmission;
      let safeMessage: string = ADMISSION_OVERVIEW_MESSAGE.available;
      if (membership?.status === TRIBE_MEMBERSHIP_STATUS.active || membership?.status === TRIBE_MEMBERSHIP_STATUS.muted) {
        state = ADMISSION_OVERVIEW_STATE.alreadyMember; nextAction = ADMISSION_NEXT_ACTION.openAcademy; safeMessage = ADMISSION_OVERVIEW_MESSAGE.alreadyMember;
      } else if (request?.status === ADMISSION_REQUEST_STATUS.pending && now < new Date(request.expiresAt)) {
        state = ADMISSION_OVERVIEW_STATE.pending; nextAction = ADMISSION_NEXT_ACTION.viewRequest; safeMessage = ADMISSION_OVERVIEW_MESSAGE.pending;
      } else if (facts.recoveryLocked || !facts.tribe.controlActivated || !facts.tribe.evaluatorEnabled || !facts.policy?.isOpen || membershipEligibility.outcome === ACADEMY_MEMBERSHIP_ELIGIBILITY.blocked) {
        state = ADMISSION_OVERVIEW_STATE.closed; nextAction = ADMISSION_NEXT_ACTION.contactLeader; safeMessage = ADMISSION_OVERVIEW_MESSAGE.closed;
      } else if (request?.retryAllowedAt && now < new Date(request.retryAllowedAt)) {
        state = ADMISSION_OVERVIEW_STATE.closed; nextAction = ADMISSION_NEXT_ACTION.wait; safeMessage = ADMISSION_OVERVIEW_MESSAGE.waiting;
      } else if (!scope) {
        state = ADMISSION_OVERVIEW_STATE.signInRequired; nextAction = ADMISSION_NEXT_ACTION.signIn; safeMessage = ADMISSION_OVERVIEW_MESSAGE.signIn;
      } else if (facts.policy.requiresAdditionalVerification) {
        state = ADMISSION_OVERVIEW_STATE.verificationRequired; nextAction = ADMISSION_NEXT_ACTION.verifyContact; safeMessage = ADMISSION_OVERVIEW_MESSAGE.verification;
      }
      const parsed = admissionOverviewSchema.safeParse({ tribe: { slug: facts.tribe.slug, name: facts.tribe.name, accessModel: facts.tribe.accessModel }, policy: facts.policy, state, nextAction, safeMessage, ...(request ? { request } : {}) });
      if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
