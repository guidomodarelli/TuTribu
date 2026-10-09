/** Commits private leader invitation management with original metadata and one-view initial material. @module postgres-personal-invitation-repository */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { PersonalInvitationReader, PersonalInvitationCommandWriter, PersonalInvitationCreationIntent, PersonalInvitationCreationResult, PersonalInvitationRenameIntent, PersonalInvitationRevocationIntent, PersonalInvitationMutationResult, PersonalInvitationQuery } from "../../domain/repositories/personal-invitation-management";
import { createPersonalInvitation, renamePersonalInvitation, revokePersonalInvitation, expirePersonalInvitation, type PersonalInvitation } from "../../domain/entities/personal-invitation";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ALLOWLIST_ENTRY_STATUS } from "../../constants/admission-resources";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ADMISSION_ACTION, ADMISSION_INVITATION_STATUS } from "../../constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { PERSONAL_INVITATION_EFFECT_SQL, PERSONAL_INVITATION_CURSOR, PERSONAL_INVITATION_MUTATION_DENIED, PERSONAL_INVITATION_DEFAULT_EXPIRY } from "../../constants/personal-invitation-management";
import { personalInvitationMutationSnapshotSchema, personalInvitationMutationDenialSchema } from "../../constants/personal-invitation-management-schemas";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { authorizeAdmissionLeader, admissionDatabaseNow } from "./postgres-admission-leader-authorizer";
import { createAdmissionContactFingerprint } from "../verification/admission-contact-fingerprint";
import { createPersonalInvitationTokenCodec } from "../tokens/personal-invitation-token";
import { mapPersonalInvitationRow, type PersonalInvitationRow } from "./personal-invitation-row-mapper";
import { cancelRevokedPersonalAdmission } from "./cancel-revoked-personal-admission";
import type { AdmissionNotificationObligationWriter } from "../../domain/repositories/admission-repositories";

/** One command retains its exact native resource/recency context across registry phases. */
type InvitationIntent = PersonalInvitationCreationIntent | PersonalInvitationRenameIntent | PersonalInvitationRevocationIntent;
/** Only closed original business codes can be completed after rollback of staged effects. */
type InvitationSnapshot = PersonalInvitationMutationResult | { outcome: "denied"; code: "invalid_input" | "invitation_conflict" | "invitation_unavailable" | "resource_unavailable" };
/** Guards all checkouts with the caller's existing request transaction helper. */
type InvitationExecutor = <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Reads and writes remain private to current canonical leaders; token possession is never administrative authority. */
export class PostgresPersonalInvitationRepository implements PersonalInvitationReader, PersonalInvitationCommandWriter {
  /** @param execute - Guarded native actor context on every transaction. @param readSecurityConfig - Current independent hosting keys and recovery state without provider RPC. @param notifications - Existing scoped DB-only notice collaborator required for redeemed authorization withdrawal. */
  constructor(private readonly execute: InvitationExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly notifications?: (database: RequestDatabase) => AdmissionNotificationObligationWriter) {}

  /** @param database - Authorized transaction. @param tribeId - Fixed native scope. @returns Current own configuration needed for phone/list issuance. */
  private async policy(database: RequestDatabase, tribeId: string) {
    const settings = (await database.execute<{ access_model: string }>(sql`select access_model from public.tribe_academy_settings where tribe_id=${tribeId} for share`)).rows[0];
    const policy = (await database.execute<{ contact_type: "email" | "phone"; requires_additional_verification: boolean }>(sql`select contact_type,requires_additional_verification from public.academy_admission_policies where tribe_id=${tribeId} for share`)).rows[0];
    if (settings?.access_model !== TRIBE_ACCESS_MODEL.academy || !policy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    return { contactType: policy.contact_type, requiresAdditionalVerification: policy.requires_additional_verification };
  }

  /** @param database - Current locked command transaction. @param context - Actual native leader. @param ledgerId - Original private registry identity. @param operation - Confirmed purpose. @param invitation - Effectively changed resource. @returns After minimal audit is staged without recipient/token material. */
  private async audit(database: RequestDatabase, context: AuthorizedAdmissionContext, ledgerId: string, operation: string, invitation: PersonalInvitation) {
    await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,resource_version) values (${context.tribeId},${context.userId},${ADMISSION_RESOURCE_KIND.personalInvitation},${invitation.id},${ledgerId},${operation},${invitation.version})`);
  }

  /** @param database - Original transaction. @param context - Authorized tenant. @param invitationId - Exact resource. @returns Its locked inward entity, closing on absent/crossed identity. */
  private async current(database: RequestDatabase, context: AuthorizedAdmissionContext, invitationId: string) {
    const row = (await database.execute<PersonalInvitationRow>(sql`select * from public.academy_personal_invitations where id=${invitationId} and tribe_id=${context.tribeId} for update`)).rows[0];
    if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    return mapPersonalInvitationRow(row);
  }

  /** @param intent - Server-derived explicit command. @param operation - Exact recency/namespace. @param resourceId - Tribe or observed invitation. @param payload - Canonical protected intent without token. @param mutate - Atomic DB-only mutation. @returns Confirmed original metadata or recorded progress; expected refusal rolls back effects first. */
  private async run(intent: InvitationIntent, operation: ReauthenticationOperation, resourceId: string, payload: Parameters<PostgresAdmissionOperationRepository["run"]>[0]["intent"], mutate: (database: RequestDatabase, ledgerId: string) => Promise<PersonalInvitationMutationResult>) {
    const command = { actorUserId: intent.context.userId, tribeId: intent.context.tribeId, operationType: operation, idempotencyKey: intent.operationId, intent: payload };
    const ledger = new PostgresAdmissionOperationRepository((work) => this.execute(intent.context, work), async (database) => { await authorizeAdmissionLeader(database, intent.context, { action: ADMISSION_ACTION.manageInvitations, resourceId, operation }); return true; }, this.readSecurityConfig);
    let original, refusalCause: unknown;
    try { original = await ledger.run(command, personalInvitationMutationSnapshotSchema, async (database, ledgerId) => {
      await database.execute(sql.raw(PERSONAL_INVITATION_EFFECT_SQL.begin));
      let snapshot: InvitationSnapshot;
      try { snapshot = await mutate(database, ledgerId); }
      catch (error) {
        const denial = error instanceof AdmissionOperationError ? personalInvitationMutationDenialSchema.safeParse({ outcome: PERSONAL_INVITATION_MUTATION_DENIED, code: error.code }) : null;
        if (!denial?.success) throw error;
        refusalCause = error; snapshot = denial.data;
        await database.execute(sql.raw(PERSONAL_INVITATION_EFFECT_SQL.rollback));
      }
      await database.execute(sql.raw(PERSONAL_INVITATION_EFFECT_SQL.release));
      return snapshot;
    }); }
    catch (error) {
      if (!(error instanceof AdmissionOperationError) || error.code !== ADMISSION_ERROR_CODE.operationUnresolved) throw error;
      try { original = await ledger.read(command, personalInvitationMutationSnapshotSchema); }
      catch (recoveryError) { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: intent.operationId, cause: new AggregateError([error, recoveryError], "Personal invitation original commit recovery failed", { cause: error }) }); }
      if (original?.state !== OPERATION_STATE.completed) throw error;
    }
    if (original.state === OPERATION_STATE.started) return original;
    if ("outcome" in original.result) throw new AdmissionOperationError(original.result.code, { ...(refusalCause !== undefined ? { cause: refusalCause } : {}), operationId: original.operationId, operationState: OPERATION_STATE.completed });
    return { ...original, result: original.result };
  }

  /** @param intent - Explicit issuance/replacement and restrictions. @returns Initial token only after a newly acknowledged original commit; replay or lost COMMIT response returns metadata alone. */
  async create(intent: PersonalInvitationCreationIntent): Promise<PersonalInvitationCreationResult> {
    if (!intent.confirmed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    let initialToken: string | undefined;
    const original = await this.run(intent, REAUTHENTICATION_OPERATION.createPersonalInvitation, intent.context.tribeId, { confirmed: true, contact: intent.contact, internalName: intent.internalName, requiresAllowlist: intent.requiresAllowlist, allowlistExemptionAcknowledged: intent.allowlistExemptionAcknowledged, expiry: intent.expiresAt === undefined ? PERSONAL_INVITATION_DEFAULT_EXPIRY : intent.expiresAt?.toISOString() ?? null, replacement: intent.replacement ?? null }, async (database, ledgerId) => {
      const policy = await this.policy(database, intent.context.tribeId), now = await admissionDatabaseNow(database);
      const invitation = createPersonalInvitation({ id: randomUUID(), tribeId: intent.context.tribeId, actorUserId: intent.context.userId, contact: intent.contact, internalName: intent.internalName, requiresAllowlist: intent.requiresAllowlist, allowlistExemptionAcknowledged: intent.allowlistExemptionAcknowledged, expiresAt: intent.expiresAt, now, policy });
      if (invitation.requiresAllowlist && !(await database.execute(sql`select id from public.academy_allowlist_entries where tribe_id=${intent.context.tribeId} and contact_type=${invitation.contact.type} and status=${ALLOWLIST_ENTRY_STATUS.enabled} limit 1`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
      const row = (await database.execute<PersonalInvitationRow>(sql`select * from public.academy_personal_invitations where tribe_id=${intent.context.tribeId} and contact_type=${invitation.contact.type} and normalized_contact=${invitation.contact.value} and status=${ADMISSION_INVITATION_STATUS.active} for update`)).rows[0];
      if (row) {
        const existing = mapPersonalInvitationRow(row);
        if (intent.replacement && (intent.replacement.invitationId !== existing.id || intent.replacement.expectedVersion !== existing.version)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationConflict);
        const expired = expirePersonalInvitation({ invitation: existing, expectedVersion: existing.version, now });
        if (expired.changed) { await database.execute(sql`update public.academy_personal_invitations set status=${ADMISSION_INVITATION_STATUS.expired},version=version+1,updated_at=${now} where id=${existing.id} and version=${existing.version}`); await this.audit(database, intent.context, ledgerId, ADMISSION_INVITATION_STATUS.expired, expired.invitation); }
        else {
          if (intent.replacement?.invitationId !== existing.id || intent.replacement.expectedVersion !== existing.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationConflict);
          const revoked = revokePersonalInvitation({ invitation: existing, expectedVersion: existing.version, revokeRedeemedAuthorization: false, now }).invitation;
          await database.execute(sql`update public.academy_personal_invitations set status=${ADMISSION_INVITATION_STATUS.revoked},revoked_at=${now},version=${revoked.version},updated_at=${now} where id=${existing.id} and version=${existing.version}`);
          await this.audit(database, intent.context, ledgerId, REAUTHENTICATION_OPERATION.revokePersonalInvitation, revoked);
        }
      } else if (intent.replacement) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationConflict);
      const config = await this.readSecurityConfig(), fingerprint = await createAdmissionContactFingerprint(invitation.contact, config), token = await createPersonalInvitationTokenCodec(config).issue({ tribeId: invitation.tribeId, invitationId: invitation.id });
      await database.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitation.id},${invitation.tribeId},${invitation.createdByUserId},${invitation.internalName},${invitation.contact.type},${invitation.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${invitation.requiresAllowlist},${invitation.expiresAt},${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},${now},${now})`);
      await this.audit(database, intent.context, ledgerId, REAUTHENTICATION_OPERATION.createPersonalInvitation, invitation);
      const current = await this.readSecurityConfig();
      if (current.recoveryLocked || current.environment !== config.environment || current.securityEpoch !== config.securityEpoch || !current.keyrings.invitation_token.keys.has(token.keyId) || !current.keyrings.contact_fingerprint.keys.has(fingerprint.keyId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      initialToken = token.token;
      return { invitationId: invitation.id, version: 1, changed: true, created: true };
    });
    if (original.state === OPERATION_STATE.started) return original;
    if (original.replayed) return { ...original, replayed: true };
    return { ...original, replayed: false, ...(initialToken ? { initialToken } : {}) };
  }

  /** @param intent - Exact observed name edit and recency. @returns One increment or a current no-op; immutable restrictions remain unchanged. */
  async rename(intent: PersonalInvitationRenameIntent) {
    if (!intent.confirmed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    return this.run(intent, REAUTHENTICATION_OPERATION.renamePersonalInvitation, intent.invitationId, { confirmed: true, invitationId: intent.invitationId, expectedVersion: intent.expectedVersion, internalName: intent.internalName }, async (database, ledgerId) => {
      const original = await this.current(database, intent.context, intent.invitationId), now = await admissionDatabaseNow(database), proposal = renamePersonalInvitation({ invitation: original, expectedVersion: intent.expectedVersion, internalName: intent.internalName, now });
      if (proposal.changed) { await database.execute(sql`update public.academy_personal_invitations set internal_name=${proposal.invitation.internalName},version=${proposal.invitation.version},updated_at=${now} where id=${original.id} and version=${intent.expectedVersion}`); await this.audit(database, intent.context, ledgerId, REAUTHENTICATION_OPERATION.renamePersonalInvitation, proposal.invitation); }
      return { invitationId: original.id, version: proposal.invitation.version, changed: proposal.changed, created: false };
    });
  }

  /** @param intent - Explicit observed active revocation or redeemed authorization withdrawal. @returns The original versioned result with any redeemed pending cancellation in the same commit; approved members remain untouched. */
  async revoke(intent: PersonalInvitationRevocationIntent) {
    if (!intent.confirmed || !intent.internalReason.trim() || intent.internalReason.trim().length > ADMISSION_LIMIT.internalMessageCharacters) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    return this.run(intent, REAUTHENTICATION_OPERATION.revokePersonalInvitation, intent.invitationId, { confirmed: true, invitationId: intent.invitationId, expectedVersion: intent.expectedVersion, revokeRedeemedAuthorization: intent.revokeRedeemedAuthorization, internalReason: intent.internalReason.trim() }, async (database, ledgerId) => {
      const original = await this.current(database, intent.context, intent.invitationId), now = await admissionDatabaseNow(database), proposal = revokePersonalInvitation({ invitation: original, expectedVersion: intent.expectedVersion, revokeRedeemedAuthorization: intent.revokeRedeemedAuthorization, now });
      if (proposal.cancelPendingRequestId) {
        if (!this.notifications) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        await cancelRevokedPersonalAdmission(database, { context: intent.context, invitation: original, ledgerId, internalReason: intent.internalReason.trim(), now }, this.notifications(database));
      }
      if (proposal.changed) { await database.execute(sql`update public.academy_personal_invitations set status=${proposal.invitation.status},revoked_at=${proposal.invitation.revokedAt},authorization_revoked_at=${proposal.invitation.authorizationRevokedAt},version=${proposal.invitation.version},updated_at=${now} where id=${original.id} and version=${intent.expectedVersion}`); await this.audit(database, intent.context, ledgerId, REAUTHENTICATION_OPERATION.revokePersonalInvitation, proposal.invitation); }
      return { invitationId: original.id, version: proposal.invitation.version, changed: proposal.changed, created: false };
    });
  }

  /** @param context - Actual current leader. @param invitationId - Exact private identity. @returns Metadata without digest or initial token; no state is materialized on read. */
  async read(context: AuthorizedAdmissionContext, invitationId: string) {
    return this.execute(context, async (database) => {
      await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageInvitations, resourceId: invitationId });
      const row = (await database.execute<PersonalInvitationRow>(sql`select * from public.academy_personal_invitations where id=${invitationId} and tribe_id=${context.tribeId}`)).rows[0];
      await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageInvitations, resourceId: invitationId });
      return row ? mapPersonalInvitationRow(row) : null;
    });
  }

  /** @param context - Native current leader and tribe. @param query - Bounded own status/cursor. @returns Private metadata page with microsecond keyset; never token material or writes. */
  async list(context: AuthorizedAdmissionContext, query: PersonalInvitationQuery) {
    return this.execute(context, async (database) => {
      await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageInvitations, resourceId: context.tribeId });
      const filters = [sql`tribe_id=${context.tribeId}`];
      if (query.status) filters.push(sql`status=${query.status}`);
      if (query.cursor) filters.push(sql`(created_at,id)<(${query.cursor.createdAt}::timestamptz,${query.cursor.id}::uuid)`);
      const rows = (await database.execute<PersonalInvitationRow & { cursor_timestamp: string }>(sql`select *,to_char(created_at at time zone ${PERSONAL_INVITATION_CURSOR.timeZone},${PERSONAL_INVITATION_CURSOR.timestampFormat}) as cursor_timestamp from public.academy_personal_invitations where ${sql.join(filters, sql` and `)} order by created_at desc,id desc limit ${query.limit + 1}`)).rows;
      const visible = rows.slice(0, query.limit), last = visible.at(-1);
      await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageInvitations, resourceId: context.tribeId });
      return { invitations: visible.map(mapPersonalInvitationRow), nextCursor: rows.length > query.limit && last ? [last.cursor_timestamp, last.id].join(PERSONAL_INVITATION_CURSOR.separator) : null };
    });
  }
}
