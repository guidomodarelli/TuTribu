/** Loads current private management facts through inward owners without dispatching a command. @module get-personal-invitation-management-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { ManagePersonalInvitationsUseCases } from "./manage-personal-invitations-use-cases";
import type { GetAdmissionPolicyUseCase } from "./get-admission-policy-use-case";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { PersonalInvitationAvailabilityReader } from "../../domain/repositories/personal-invitation-availability-reader";
import type { PersonalInvitationQuery } from "../../domain/repositories/personal-invitation-management";
import type { PersonalInvitationManagementPageState } from "../results/personal-invitation-management-page-state";
import { personalInvitationManagementPageStateSchema } from "../../constants/personal-invitation-management-page";
import { PERSONAL_INVITATION_CURSOR } from "../../constants/personal-invitation-management";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_POLICY_PUBLIC_STATE } from "../../constants/admission-policy";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** The single SSR entrypoint combines metadata, current policy and exact-type list availability. */
export class GetPersonalInvitationManagementPageUseCase {
  /** @param accounts - Native current identity. @param readers - Authorized inward read-only owners. @param clock - Fresh final render time. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { invitations: Pick<ManagePersonalInvitationsUseCases, "list">; policy: Pick<GetAdmissionPolicyUseCase, "execute">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">; resolveContext: Pick<ResolveAdmissionContextUseCase, "execute">; availability: PersonalInvitationAvailabilityReader }, private readonly clock: () => Date) {}

  /** @param query - Once-validated native route and own filters. @returns Safe current leader props or a closed failure with no partial contacts. */
  async execute(query: { slug: string; requestId: string; filters: PersonalInvitationQuery }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const viewer = { userId: first.userId, sessionId: first.session.id, normalizedEmail: first.normalizedEmail };
      /** Checks account/session/email at every read boundary; a changed identity discards all partial private facts. */
      const assertViewer = async () => {
        const current = await this.accounts.getAuthenticatedAccount();
        if (!current || current.userId !== viewer.userId || current.session.id !== viewer.sessionId || current.normalizedEmail !== viewer.normalizedEmail || !isAuthenticatedSessionLive(current.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      };
      const tribe = await this.readers.resolveTribe.execute({ slug: query.slug, requestId: query.requestId });
      if (!tribe.ok) return tribe;
      await assertViewer();
      const scope = { tribeId: tribe.value.tribeId, requestId: query.requestId };
      const authority = await this.readers.resolveContext.execute({ ...scope, action: ADMISSION_ACTION.manageInvitations });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      if (authority.context.userId !== viewer.userId || authority.context.sessionId !== viewer.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const policy = await this.readers.policy.execute(scope);
      if (!policy.ok) return policy;
      await assertViewer();
      if (policy.value.state === ADMISSION_POLICY_PUBLIC_STATE.unavailable) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const contactType = policy.value.policy?.contactType ?? null;
      const hasUsableAllowlist = contactType === null ? false : await this.readers.availability.hasUsableAllowlist(authority.context, contactType);
      await assertViewer();
      const page = await this.readers.invitations.list({ ...scope, ...query.filters }, viewer);
      if (!page.ok) return page;
      await assertViewer();
      const now = this.clock(), { cursor, ...filters } = query.filters;
      const value: PersonalInvitationManagementPageState = personalInvitationManagementPageStateSchema.parse({ kind: "ready", slug: query.slug, tribeId: tribe.value.tribeId, viewerId: viewer.userId, renderedAt: now.toISOString(), contactType, requiresAdditionalVerification: policy.value.policy?.requiresAdditionalVerification ?? false, allowedCountries: policy.value.usage?.allowedCountries ?? [], hasUsableAllowlist, page: page.value, query: { ...filters, ...(cursor ? { cursor: [cursor.createdAt, cursor.id].join(PERSONAL_INVITATION_CURSOR.separator) } : {}) } });
      return { ok: true as const, value };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
