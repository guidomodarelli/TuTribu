/** Resolves private token preview facts with native current account checks and no claims or lifecycle writes. @module postgres-personal-invitation-overview-reader */
import "server-only";
import { assertUnreservedAdmissionContact } from "./assert-unreserved-admission-contact";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { PersonalInvitationOverviewReader, PersonalInvitationOverviewFacts } from "../../domain/repositories/personal-invitation-overview-reader";
import { type AdmissionSubmissionFacts, type AdmissionMembershipFacts, evaluateAdmissionPreview  } from "../../domain/policies/admission-eligibility";
import { readAdmissionPolicy } from "./postgres-admission-policy-storage";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_SOURCE_KIND, ADMISSION_INVITATION_STATUS, ADMISSION_OUTCOME } from "../../constants/admission-eligibility";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { createPersonalInvitationTokenCodec } from "../tokens/personal-invitation-token";
import { mapPersonalInvitationRow, type PersonalInvitationRow } from "./personal-invitation-row-mapper";
import { readAllowlistAdmissionFacts } from "./postgres-allowlist-admission-facts";
import { PostgresAdmissionSubmissionProofReader } from "./postgres-admission-submission-proof-reader";
import { PostgresAdmissionOverviewReader } from "./postgres-admission-overview-reader";
import { assertPersonalInvitationTokenCurrent } from "./postgres-personal-invitation-redemption";
import { rejectWithoutPlatformSecurity } from "./admission-platform-security-rejection";
import { assertMessagingAuthenticatedMacKeyMaterials } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { ADMISSION_OPERATION_MAC_KEY_PURPOSES } from "../../constants/admission-operation";

/** Preview authority is fixed to the actual account/session by the composition root. */
type PreviewScope = Pick<AdmissionCommandScope, "userId" | "sessionId">;
/** PostgreSQL fields stay inside the adapter and are consumed without schema revalidation. */
type PreviewInvitationRow = PersonalInvitationRow & { token_key_id: string; token_hash: Uint8Array; token_context_digest: Uint8Array | null };

/** The reader has no operation ledger, issuer, writer, delivery or membership-effect collaborator. */
export class PostgresPersonalInvitationOverviewReader implements PersonalInvitationOverviewReader {
  /** @param execute - Native current account transaction. @param readSecurityConfig - Current private token/environment keys, never a provider request. */
  constructor(private readonly execute: <Result>(scope: PreviewScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param database - Current read transaction. @param scope - Actual native account/session. @returns Current private account after real SQL session checks. */
  private async authorize(database: RequestDatabase, scope: PreviewScope) {
    const valid = (await database.execute(sql`select id from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp()`)).rows[0];
    if (!valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const account = await new PostgresAuthenticatedAccountProvider(async () => scope, (_identity, run) => run(database)).getAuthenticatedAccount();
    if (!account) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return account;
  }

  /** @param database - Same read transaction. @param codec - Current token codec. @param token - Opaque presented token. @returns The invitation whose context digest verifies the token, with its reference, or `null`. */
  private async readTokenInvitation(database: RequestDatabase, codec: ReturnType<typeof createPersonalInvitationTokenCodec>, token: string) {
    const lookups = await codec.lookup(token);
    if (!lookups.length) return null;
    const filters = lookups.map((lookup) => sql`(token_key_id=${lookup.keyId} and token_hash=${Buffer.from(lookup.lookupDigest)})`);
    const row = (await database.execute<PreviewInvitationRow>(sql`select * from public.academy_personal_invitations where ${sql.join(filters, sql` or `)}`)).rows[0];
    if (!row?.token_context_digest) return null;
    const reference = { tribeId: row.tribe_id, invitationId: row.id, keyId: row.token_key_id, lookupDigest: row.token_hash, digest: row.token_context_digest };
    return await codec.verify(token, reference) ? { row, reference } : null;
  }

  /**
   * @param query - Opaque token/correlation and optional own available proof. @param scope - Actual account/session.
   * @returns Current private preview facts or generic absence, never a persisted operation or contact disclosure.
   * @throws AdmissionOperationError platform_security_unavailable before the token lookup when the platform cannot protect the submission the
   * preview would offer (the same import and enrolled-proof checks the ledger claim runs), so the page never offers a write that always fails.
   */
  async readOverview(query: { token: string; requestId: string; proofId?: string }, scope: PreviewScope): Promise<PersonalInvitationOverviewFacts | null> {
    return rejectWithoutPlatformSecurity(() => this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const security = await this.readSecurityConfig(), codec = createPersonalInvitationTokenCodec(security);
      await assertMessagingAuthenticatedMacKeyMaterials(database, security, ADMISSION_OPERATION_MAC_KEY_PURPOSES);
      const verified = await this.readTokenInvitation(database, codec, query.token);
      if (!verified) { await this.authorize(database, scope); return null; }
      const { row, reference } = verified;
      // Read mutable facts after the shared tribe lock so revocation and policy
      // mutations cannot cross the final projection inside this transaction.
      const tribe = (await database.execute<{ slug: string; access_model: string }>(sql`select tribe.slug,settings.access_model from public.tribes tribe join public.tribe_academy_settings settings on settings.tribe_id=tribe.id where tribe.id=${row.tribe_id} for share of tribe,settings`)).rows[0];
      if (tribe?.access_model !== TRIBE_ACCESS_MODEL.academy) return null;
      const current = (await database.execute<PreviewInvitationRow>(sql`select * from public.academy_personal_invitations where id=${row.id} and tribe_id=${row.tribe_id} for share`)).rows[0];
      if (!current?.token_context_digest) return null;
      const invitation = mapPersonalInvitationRow(current), context = { ...scope, tribeId: invitation.tribeId, requestId: query.requestId };
      const refreshed = await this.authorize(database, scope);
      if (invitation.contact.type === ADMISSION_CONTACT_TYPE.email && invitation.contact.value !== refreshed.normalizedEmail && invitation.redeemedByUserId !== scope.userId) return null;
      const overview = await new PostgresAdmissionOverviewReader((run) => run(database), (_own, run) => run(database), async () => (await this.readSecurityConfig()).recoveryLocked).readOverview({ slug: tribe.slug, requestId: query.requestId }, scope);
      if (!overview) return null;
      const policy = await readAdmissionPolicy(database, invitation.tribeId, false);
      try { await assertUnreservedAdmissionContact(database, context.tribeId, invitation.contact, this.readSecurityConfig); }
      catch (error) { if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.contactBindingConflict) return null; throw error; }
      const own = await readAllowlistAdmissionFacts(database, context, invitation.contact);
      const membership = (await database.execute<AdmissionMembershipFacts>(sql`select tribe_id as "tribeId",user_id as "userId",role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${invitation.tribeId} and user_id=${scope.userId} for share`)).rows[0] ?? null;
      const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      const eligibility: AdmissionSubmissionFacts = { now, tribe: { id: invitation.tribeId, isAcademy: true, controlActivated: overview.tribe.controlActivated, evaluatorEnabled: overview.tribe.evaluatorEnabled, recoveryLocked: overview.recoveryLocked }, policy: policyFacts(policy), account: own.account, source: { kind: ADMISSION_SOURCE_KIND.personal, invitation: { tribeId: invitation.tribeId, contact: invitation.contact, requiresAllowlist: invitation.requiresAllowlist, status: invitation.status, authorizationRevoked: invitation.authorizationRevokedAt !== null, expiresAt: invitation.expiresAt } }, contact: invitation.contact, baseEvidence: own.baseEvidence, allowlistEntry: own.allowlistEntry, contactBinding: own.contactBinding, membership, localProof: null, currentConnection: null };
      const local = query.proofId ? await new PostgresAdmissionSubmissionProofReader(database, this.readSecurityConfig).read(context, query.proofId, eligibility) : null;
      if (local) { eligibility.localProof = local.proof; eligibility.currentConnection = local.currentConnection; eligibility.contactBinding = local.contactBinding; }
      const evaluated = local ? evaluateAdmissionPreview({ ...eligibility, now: new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now) }) : null;
      const usableLocalProof = evaluated?.outcome === ADMISSION_OUTCOME.admitted || evaluated?.outcome === ADMISSION_OUTCOME.pending;
      const recipientMatchesAccount = invitationRecipientMatches({ invitation, accountEmail: refreshed.normalizedEmail, binding: own.contactBinding, userId: scope.userId, requiresAdditionalVerification: policy?.requiresAdditionalVerification === true, usableLocalProof });
      await assertPersonalInvitationTokenCurrent({ invitation, reference, environment: security.environment, securityEpoch: security.securityEpoch }, query.token, await this.readSecurityConfig());
      await this.authorize(database, scope);
      return { overview, eligibility, tokenAvailable: isInvitationTokenAvailable(invitation, now), recipientMatchesAccount, redeemedByUserId: invitation.redeemedByUserId, redeemedRequestId: invitation.redeemedRequestId };
    }));
  }
}

/** @param invitation - Current invitation. @param now - Database clock. @returns Whether its token can still be used: active, authorized and unexpired. */
function isInvitationTokenAvailable(invitation: ReturnType<typeof mapPersonalInvitationRow>, now: Date): boolean {
  return invitation.status === ADMISSION_INVITATION_STATUS.active && invitation.authorizationRevokedAt === null && (!invitation.expiresAt || now < invitation.expiresAt);
}

/** @param match - Invitation, current account email, current contact binding, actual applicant, whether the policy verifies contacts and whether a local proof is usable. @returns Whether the invitation recipient is this account; a foreign binding never matches. */
function invitationRecipientMatches({ invitation, accountEmail, binding, userId, requiresAdditionalVerification, usableLocalProof }: { invitation: ReturnType<typeof mapPersonalInvitationRow>; accountEmail: string | null; binding: { ownerUserId: string } | null; userId: string; requiresAdditionalVerification: boolean; usableLocalProof: boolean }): boolean {
  if (binding !== null && binding.ownerUserId !== userId) return false;
  if (invitation.contact.type === ADMISSION_CONTACT_TYPE.email) return invitation.contact.value === accountEmail;
  return binding?.ownerUserId === userId || !binding && requiresAdditionalVerification || usableLocalProof;
}

/** @param policy - Current stored policy, if any. @returns The policy facts with its activation instant as a date. */
function policyFacts(policy: Awaited<ReturnType<typeof readAdmissionPolicy>>): AdmissionSubmissionFacts["policy"] {
  return policy ? { ...policy, activatedAt: policy.activatedAt ? new Date(policy.activatedAt) : null } : null;
}
