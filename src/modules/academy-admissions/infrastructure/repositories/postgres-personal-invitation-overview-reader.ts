/** Resolves private token preview facts with native current account checks and no claims or lifecycle writes. @module postgres-personal-invitation-overview-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { PersonalInvitationOverviewReader, PersonalInvitationOverviewFacts } from "../../domain/repositories/personal-invitation-overview-reader";
import type { AdmissionPolicy } from "../../domain/entities/admission-policy";
import type { AdmissionSubmissionFacts, AdmissionMembershipFacts } from "../../domain/policies/admission-eligibility";
import { evaluateAdmissionSubmission } from "../../domain/policies/admission-eligibility";
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

  /** @param query - Opaque token/correlation and optional own available proof. @param scope - Actual account/session. @returns Current private preview facts or generic absence, never a persisted operation or contact disclosure. */
  async readOverview(query: { token: string; requestId: string; proofId?: string }, scope: PreviewScope): Promise<PersonalInvitationOverviewFacts | null> {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const security = await this.readSecurityConfig(), codec = createPersonalInvitationTokenCodec(security);
      const lookups = await codec.lookup(query.token);
      if (!lookups.length) { await this.authorize(database, scope); return null; }
      const filters = lookups.map((lookup) => sql`(token_key_id=${lookup.keyId} and token_hash=${Buffer.from(lookup.lookupDigest)})`);
      const row = (await database.execute<PreviewInvitationRow>(sql`select * from public.academy_personal_invitations where ${sql.join(filters, sql` or `)}`)).rows[0];
      if (!row?.token_context_digest) { await this.authorize(database, scope); return null; }
      const reference = { tribeId: row.tribe_id, invitationId: row.id, keyId: row.token_key_id, lookupDigest: row.token_hash, digest: row.token_context_digest };
      if (!await codec.verify(query.token, reference)) { await this.authorize(database, scope); return null; }
      // Read mutable facts after the shared tribe lock so revocation and policy
      // mutations cannot cross the final projection inside this transaction.
      const tribe = (await database.execute<{ slug: string; access_model: string }>(sql`select tribe.slug,settings.access_model from public.tribes tribe join public.tribe_academy_settings settings on settings.tribe_id=tribe.id where tribe.id=${row.tribe_id} for share of tribe,settings`)).rows[0];
      if (!tribe || tribe.access_model !== TRIBE_ACCESS_MODEL.academy) return null;
      const current = (await database.execute<PreviewInvitationRow>(sql`select * from public.academy_personal_invitations where id=${row.id} and tribe_id=${row.tribe_id} for share`)).rows[0];
      if (!current?.token_context_digest) return null;
      const invitation = mapPersonalInvitationRow(current), context = { ...scope, tribeId: invitation.tribeId, requestId: query.requestId };
      const refreshed = await this.authorize(database, scope);
      if (invitation.contact.type === ADMISSION_CONTACT_TYPE.email && invitation.contact.value !== refreshed.normalizedEmail && invitation.redeemedByUserId !== scope.userId) return null;
      const overview = await new PostgresAdmissionOverviewReader((run) => run(database), (_own, run) => run(database), async () => (await this.readSecurityConfig()).recoveryLocked).readOverview({ slug: tribe.slug, requestId: query.requestId }, scope);
      if (!overview) return null;
      const policy = (await database.execute<AdmissionPolicy>(sql`select tribe_id as id,tribe_id as "tribeId",mode,contact_type as "contactType",is_open as "isOpen",allow_common_exceptions as "allowCommonExceptions",requires_additional_verification as "requiresAdditionalVerification",phone_channel as "phoneChannel",allow_sms_alternative as "allowSmsAlternative",messaging_connection_id as "messagingConnectionId",messaging_connection_version as "messagingConnectionVersion",verification_epoch as "verificationEpoch",version,activated_at as "activatedAt" from public.academy_admission_policies where tribe_id=${invitation.tribeId} for share`)).rows[0] ?? null;
      const own = await readAllowlistAdmissionFacts(database, context, invitation.contact);
      const membership = (await database.execute<AdmissionMembershipFacts>(sql`select tribe_id as "tribeId",user_id as "userId",role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${invitation.tribeId} and user_id=${scope.userId} for share`)).rows[0] ?? null;
      const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      const eligibility: AdmissionSubmissionFacts = { now, tribe: { id: invitation.tribeId, isAcademy: true, controlActivated: overview.tribe.controlActivated, evaluatorEnabled: overview.tribe.evaluatorEnabled, recoveryLocked: overview.recoveryLocked }, policy: policy ? { ...policy, activatedAt: policy.activatedAt ? new Date(policy.activatedAt) : null } : null, account: own.account, source: { kind: ADMISSION_SOURCE_KIND.personal, invitation: { tribeId: invitation.tribeId, contact: invitation.contact, requiresAllowlist: invitation.requiresAllowlist, status: invitation.status, authorizationRevoked: invitation.authorizationRevokedAt !== null, expiresAt: invitation.expiresAt } }, contact: invitation.contact, baseEvidence: own.baseEvidence, allowlistEntry: own.allowlistEntry, contactBinding: own.contactBinding, membership, localProof: null, currentConnection: null };
      const local = query.proofId ? await new PostgresAdmissionSubmissionProofReader(database, this.readSecurityConfig).read(context, query.proofId, eligibility) : null;
      if (local) { eligibility.localProof = local.proof; eligibility.currentConnection = local.currentConnection; eligibility.contactBinding = local.contactBinding; }
      const bindingMatches = own.contactBinding?.ownerUserId === scope.userId;
      const evaluated = local ? evaluateAdmissionSubmission({ ...eligibility, now: new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now) }) : null;
      const usableLocalProof = evaluated?.outcome === ADMISSION_OUTCOME.admitted || evaluated?.outcome === ADMISSION_OUTCOME.pending;
      const foreignBinding = own.contactBinding !== null && own.contactBinding.ownerUserId !== scope.userId;
      const recipientMatchesAccount = !foreignBinding && (invitation.contact.type === ADMISSION_CONTACT_TYPE.email ? invitation.contact.value === refreshed.normalizedEmail : bindingMatches || !own.contactBinding && policy?.requiresAdditionalVerification === true || usableLocalProof);
      await assertPersonalInvitationTokenCurrent({ invitation, reference, environment: security.environment, securityEpoch: security.securityEpoch }, query.token, await this.readSecurityConfig());
      await this.authorize(database, scope);
      return { overview, eligibility, tokenAvailable: invitation.status === ADMISSION_INVITATION_STATUS.active && invitation.authorizationRevokedAt === null && (!invitation.expiresAt || now < invitation.expiresAt), recipientMatchesAccount: Boolean(recipientMatchesAccount), redeemedByUserId: invitation.redeemedByUserId, redeemedRequestId: invitation.redeemedRequestId };
    });
  }
}
