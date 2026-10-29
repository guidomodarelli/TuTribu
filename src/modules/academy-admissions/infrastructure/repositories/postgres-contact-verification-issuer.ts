/** Persists issuance and invalidating resend without a provider call or another checkout. @module postgres-contact-verification-issuer */
import "server-only";
import { appendAdmissionProofInvalidationAudit, type InvalidatedAdmissionProofAuditRow } from "./postgres-admission-proof-invalidation-audit";
import { appendCreatedMessageDeliveryAudit, appendCancelledMessageDeliveryAudit, type CreatedMessageDeliveryAuditRow, type MessageDeliveryAuditRow } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-audit";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { isCurrentVerificationActor, readVerificationDatabaseNow } from "./verification-transaction-checks";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_PHONE_CHANNEL } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_PROOF_STATUS, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_STATE } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { VERIFICATION_FROZEN_PAYLOAD_FORMAT, VERIFICATION_ISSUANCE_LOCK_DOMAIN, VERIFICATION_ISSUANCE_OPERATION, VERIFICATION_ISSUANCE_OUTCOME, VERIFICATION_RESEND_REASON } from "@/src/modules/academy-admissions/constants/verification-issuance";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { ContactVerificationIssuer, ContactVerificationIssuanceResult, IssueContactVerificationCommand } from "@/src/modules/academy-admissions/domain/repositories/contact-verification-issuer";
import type { VerificationRequestBudget } from "@/src/modules/academy-admissions/domain/repositories/verification-request-budget";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { generateVerificationCode } from "@/src/modules/academy-admissions/infrastructure/verification/web-crypto-code-generator";
import { createVerificationCodeMac } from "@/src/modules/academy-admissions/infrastructure/verification/verification-code-mac";
import { MESSAGING_CONNECTION_STATE, MESSAGING_CREDENTIAL_USABLE_STATES } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createVerificationDeliveryPayloadMac } from "@/src/modules/messaging/infrastructure/encryption/verification-delivery-payload-mac";
import { VERIFICATION_CAPABILITY_STATE, VERIFICATION_CREDENTIAL_STATUS, VERIFICATION_DELIVERY_STATE, VERIFICATION_DIAGNOSTIC_OUTCOME, VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createVerificationCodeEnvelope } from "@/src/modules/messaging/infrastructure/encryption/verification-code-envelope";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/** Only fields consumed by the resource authorization are read; rows are not schema-validated. */
type ResourceRow = {
  environment: string; security_epoch: string; retired_at: string | null;
  credential_validation_status: string; is_test_mode: boolean | null; secret_ref: string | null;
  email_sender_id: string | null; sms_sender_id: string | null; whatsapp_sender_id: string | null;
  whatsapp_template_id: string | null; whatsapp_template_language: string | null;
};
/** Private immutable send facts; it contains no API credential or external DTO. */
/** Locked channel capability of one connection version. */
type CapabilityRow = { sender_id: string; template_id: string | null; template_language: string | null; state: string; checked_at: string | null; tested_at: string | null; platform_restrictions: unknown };
/** Closed admission error code. */
type AdmissionErrorCodeValue = (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE];
type PreparedResource = { environment: string; credentialKeyId: string; usagePolicyVersion: number; senderId: string; templateId: string | null; templateLanguage: string | null };
/** The old challenge is observed before locking its delivery, preserving the dispatch lock order. */
type CurrentChallengeRow = { id: string; version: number; delivery_id: string; code_envelope_id: string | null; channel: "email" | "sms" | "whatsapp"; state: string; expires_at: string | Date };

/** @param scope - Requested challenge scope. @returns A fresh diagnostic id for a connection test, else `null`. */
function newDiagnosticId(scope: VerificationChallengeScope): string | null {
  return scope.purpose === ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic ? randomUUID() : null;
}

/** @param command - Original issuance or explicit resend intent. @returns Its ledger operation type: a resend when it names the current challenge. */
function issuanceOperationType(command: IssueContactVerificationCommand) {
  return command.expectedCurrentChallengeId === null ? VERIFICATION_ISSUANCE_OPERATION.issue : VERIFICATION_ISSUANCE_OPERATION.resend;
}

/** @param scope - Requested destination and channel. @returns Whether email contacts use a non-email channel or phone contacts the email channel. */
function isChannelMismatch(scope: VerificationChallengeScope): boolean {
  return scope.contact.type === ADMISSION_CONTACT_TYPE.email ? scope.channel !== VERIFICATION_EMAIL_CHANNEL : scope.channel === VERIFICATION_EMAIL_CHANNEL;
}

/** @param config - Live protection. @param resource - Prepared send facts. @param scopeEpoch - Epoch of the authorized scope. @returns Whether recovery locked, the deployment scope moved or the credential key is gone. */
function isIssuanceSecurityChanged(config: MessagingSecurityConfig, resource: PreparedResource, scopeEpoch: string): boolean {
  return config.recoveryLocked || config.environment !== resource.environment || config.securityEpoch !== scopeEpoch || !config.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(resource.credentialKeyId);
}

/** @param channel - Requested delivery channel. @param resource - Locked connection version. @returns The configured sender for that channel, if any. */
function channelSenderId(channel: VerificationChallengeScope["channel"], resource: ResourceRow): string | null {
  if (channel === VERIFICATION_EMAIL_CHANNEL) return resource.email_sender_id;
  return channel === ADMISSION_PHONE_CHANNEL.sms ? resource.sms_sender_id : resource.whatsapp_sender_id;
}

/** @param check - Own scope, locked resource, its channel capability and sender, saved countries and whether this is a connection test. @returns Why the capability or recipient cannot be used, or `null` when it can. */
function senderCapabilityDenial({ scope, resource, capability, senderId, allowedCountries, diagnostic }: { scope: VerificationChallengeScope; resource: ResourceRow; capability: CapabilityRow; senderId: string; allowedCountries: string[]; diagnostic: boolean }): AdmissionErrorCodeValue | null {
  if (capability.sender_id !== senderId || capability.checked_at === null || capability.state === VERIFICATION_CAPABILITY_STATE.unavailable || !diagnostic && (capability.state !== VERIFICATION_CAPABILITY_STATE.prepared || capability.tested_at === null) || scope.channel === ADMISSION_PHONE_CHANNEL.whatsapp && (!resource.whatsapp_template_id || !resource.whatsapp_template_language || capability.template_id !== resource.whatsapp_template_id || capability.template_language !== resource.whatsapp_template_language)) return ADMISSION_ERROR_CODE.missingCapability;
  if (scope.contact.type !== ADMISSION_CONTACT_TYPE.phone) return null;
  if (!allowedCountries.includes(scope.contact.country) || !Array.isArray(capability.platform_restrictions)) return ADMISSION_ERROR_CODE.recipientNotAllowed;
  const restrictions: unknown[] = capability.platform_restrictions;
  for (const restriction of restrictions) {
    if (typeof restriction !== "object" || restriction === null || !("country" in restriction) || restriction.country !== scope.contact.country || !("channel" in restriction) || restriction.channel !== scope.channel) continue;
    if (!("allowed" in restriction) || restriction.allowed !== true) return ADMISSION_ERROR_CODE.recipientNotAllowed;
  }
  return null;
}

/** Reuses the caller's ledger and guarded transaction for all local issuance effects. */
export class PostgresContactVerificationIssuer implements ContactVerificationIssuer {
  /**
   * @param database - Existing transaction, rolled back on unexpected or lost-authority failures.
   * @param authorize - Mandatory current account/session/policy/purpose reader, locking tribe first.
   * @param readSecurityConfig - Local hosting-secret snapshot; no outbound work under locks.
   * @param requestBudget - Contact/account/diagnostic limiter bound to this transaction.
   */
  constructor(private readonly database: RequestDatabase, private readonly authorize: (database: RequestDatabase, scope: VerificationChallengeScope) => Promise<boolean>, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly requestBudget: VerificationRequestBudget) {}

  /**
   * Holds policy/resource facts through commit without retrieving credentials or trusting a queue snapshot.
   * @param scope - Current own scope, already checked by the account/policy owner.
   * @returns Exact send facts or a closed own denial.
   */
  private async prepare(scope: VerificationChallengeScope): Promise<PreparedResource | { code: AdmissionErrorCodeValue }> {
    const diagnostic = scope.purpose === ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic;
    const policy = (await this.database.execute<{ version: number; allowed_countries: string[] }>(sql`select version,allowed_countries from public.messaging_usage_policies where tribe_id=${scope.tribeId} for share`)).rows[0];
    // Without saved countries and quotas there is no daily code budget to consume; the connection itself may be complete.
    if (!policy) return { code: ADMISSION_ERROR_CODE.usagePolicyMissing };
    const connectionDenial = await this.connectionDenial(scope, diagnostic);
    if (connectionDenial) return { code: connectionDenial };
    const resource = (await this.database.execute<ResourceRow>(sql`select environment,security_epoch,retired_at,credential_validation_status,is_test_mode,secret_ref,email_sender_id,sms_sender_id,whatsapp_sender_id,whatsapp_template_id,whatsapp_template_language from public.messaging_connection_versions where connection_id=${scope.connectionId} and tribe_id=${scope.tribeId} and version=${scope.connectionVersion} for share`)).rows[0];
    if (resource?.retired_at !== null || resource.security_epoch !== scope.securityEpoch || resource.credential_validation_status !== VERIFICATION_CREDENTIAL_STATUS.valid || resource.is_test_mode === null || !diagnostic && resource.is_test_mode || resource.secret_ref === null) return { code: ADMISSION_ERROR_CODE.connectionIncomplete };
    const credential = (await this.database.execute<{ key_id: string }>(sql`select key_id from public.messaging_secret_envelopes where secret_ref=${resource.secret_ref} and tribe_id=${scope.tribeId} and connection_id=${scope.connectionId} and connection_version=${scope.connectionVersion} and environment=${resource.environment} and security_epoch=${scope.securityEpoch} and retired_at is null for share`)).rows[0];
    if (!credential) return { code: ADMISSION_ERROR_CODE.connectionIncomplete };
    const capability = (await this.database.execute<CapabilityRow>(sql`select sender_id,template_id,template_language,state,checked_at,tested_at,platform_restrictions from public.messaging_connection_capabilities where connection_id=${scope.connectionId} and tribe_id=${scope.tribeId} and connection_version=${scope.connectionVersion} and channel=${scope.channel} for share`)).rows[0];
    const senderId = channelSenderId(scope.channel, resource);
    if (!capability || !senderId) return { code: ADMISSION_ERROR_CODE.missingCapability };
    const capabilityDenial = senderCapabilityDenial({ scope, resource, capability, senderId, allowedCountries: policy.allowed_countries, diagnostic });
    if (capabilityDenial) return { code: capabilityDenial };
    return { environment: resource.environment, credentialKeyId: credential.key_id, usagePolicyVersion: policy.version, senderId, templateId: capability.template_id, templateLanguage: capability.template_language };
  }

  /** @param scope - Current own scope. @param diagnostic - Whether this is a connection test. @returns Why the locked connection cannot send this code, or `null` when it can. */
  private async connectionDenial(scope: VerificationChallengeScope, diagnostic: boolean): Promise<AdmissionErrorCodeValue | null> {
    const connection = (await this.database.execute<{ contributed_by_user_id: string | null; state: string; is_selected: boolean; is_candidate: boolean; selected_version: number | null; candidate_version: number | null; retired_at: string | null }>(sql`select contributed_by_user_id,state,is_selected,is_candidate,selected_version,candidate_version,retired_at from public.tenant_messaging_connections where id=${scope.connectionId} and tribe_id=${scope.tribeId} for share`)).rows[0];
    if (connection?.retired_at !== null || !MESSAGING_CREDENTIAL_USABLE_STATES.has(connection.state)) return ADMISSION_ERROR_CODE.connectionIncomplete;
    const leader = (await this.database.execute(sql`select id from public.tribe_members where tribe_id=${scope.tribeId} and user_id=${connection.contributed_by_user_id} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} for share`)).rows[0];
    if (!leader || diagnostic && connection.contributed_by_user_id !== scope.userId) return ADMISSION_ERROR_CODE.permissionDenied;
    if (diagnostic ? !(connection.is_candidate && connection.candidate_version === scope.connectionVersion || connection.is_selected && connection.selected_version === scope.connectionVersion) : !(connection.is_selected && connection.selected_version === scope.connectionVersion && (connection.state === MESSAGING_CONNECTION_STATE.active || connection.state === MESSAGING_CONNECTION_STATE.degraded))) return ADMISSION_ERROR_CODE.connectionIncomplete;
    return null;
  }

  /**
   * Rechecks every key used by the local issuance, independently of the ledger's operation keyring.
   * @param original - External configuration that protected this original intent.
   * @param resource - Current locked resource and its credential reference.
   * @param keys - Exact private ids used for the MAC, envelope, delivery and contact index.
   * @returns Nothing while every used key and external security scope remains available.
   * @throws AdmissionOperationError when a current key or security scope changes, requiring rollback.
   */
  private async assertCurrentSecurity(original: MessagingSecurityConfig, resource: PreparedResource, keys: { mac: string; otp: string; payload: string; contact: string }): Promise<void> {
    const current = await this.readSecurityConfig();
    if (current.recoveryLocked || current.environment !== original.environment || current.securityEpoch !== original.securityEpoch
      || !current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(resource.credentialKeyId)
      || !current.keyrings[MESSAGING_KEY_PURPOSE.verificationMac].keys.has(keys.mac)
      || !current.keyrings[MESSAGING_KEY_PURPOSE.otpEnvelope].keys.has(keys.otp)
      || !current.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].keys.has(keys.payload)
      || !current.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint].keys.has(keys.contact)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
  }

  /**
   * Locks the current challenge for this destination in the shared delivery, challenge, proof and envelope order.
   * @param command - Original issuance or explicit resend intent.
   * @returns The locked current challenge, if any, or a stale-resend denial.
   */
  private async lockCurrentChallenge(command: IssueContactVerificationCommand): Promise<{ current: CurrentChallengeRow | undefined } | { denial: typeof ADMISSION_ERROR_CODE.challengeInvalidated }> {
    const scope = command.scope;
    let current: CurrentChallengeRow | undefined = (await this.database.execute<CurrentChallengeRow>(sql`select id,version,delivery_id,code_envelope_id,channel,state,expires_at from public.contact_verification_challenges where user_id=${scope.userId} and tribe_id=${scope.tribeId} and contact_type=${scope.contact.type} and normalized_contact=${scope.contact.value} and purpose=${scope.purpose} and is_current`)).rows[0];
    /** A connection test is retaken from scratch once its previous code was confirmed or expired; that finished challenge is superseded below instead of blocking every later test to the same destination. */
    const finishedConnectionTest = scope.purpose === ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic && current !== undefined && command.expectedCurrentChallengeId === null
      && (current.state === VERIFICATION_CHALLENGE_STATE.verified || new Date(current.expires_at) <= await readVerificationDatabaseNow(this.database));
    if (!finishedConnectionTest && (current?.id ?? null) !== command.expectedCurrentChallengeId) return { denial: ADMISSION_ERROR_CODE.challengeInvalidated };
    if (current) {
      await this.database.execute(sql`select id from public.message_deliveries where id=${current.delivery_id} and tribe_id=${scope.tribeId} for update`);
      current = (await this.database.execute<CurrentChallengeRow>(sql`select id,version,delivery_id,code_envelope_id,channel,state,expires_at from public.contact_verification_challenges where id=${current.id} and is_current for update`)).rows[0];
      if (!current) return { denial: ADMISSION_ERROR_CODE.challengeInvalidated };
      await this.database.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${current.id} for update`);
      if (current.code_envelope_id) await this.database.execute(sql`select id from public.verification_code_envelopes where id=${current.code_envelope_id} for update`);
    }
    return { current };
  }

  /**
   * Invalidates the superseded challenge with its proofs, code envelope, queued delivery and pending diagnostic.
   * @param command - Original issuance or explicit resend intent.
   * @param current - Locked superseded challenge.
   * @returns After every superseded effect and its audit are staged.
   */
  private async supersedeChallenge(command: IssueContactVerificationCommand, current: CurrentChallengeRow): Promise<void> {
    const scope = command.scope;
    const invalidatedAt = await readVerificationDatabaseNow(this.database);
    const invalidatedProofs = (await this.database.execute<InvalidatedAdmissionProofAuditRow>(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.invalid},invalidated_at=${invalidatedAt},invalidation_reason=${VERIFICATION_RESEND_REASON} where challenge_id=${current.id} and status=${ADMISSION_PROOF_STATUS.available} returning id,challenge_id,verification_epoch,applied_request_id,invalidated_at`)).rows;
    await appendAdmissionProofInvalidationAudit(this.database, { tribeId: scope.tribeId, actorUserId: scope.userId, operationId: command.ledgerId, cause: VERIFICATION_RESEND_REASON }, { proofs: invalidatedProofs, channels: new Map([[current.id, current.channel]]), previousStates: ADMISSION_PROOF_STATUS.available });
    await this.database.execute(sql`update public.contact_verification_challenges set is_current=false,state=case when state=${VERIFICATION_CHALLENGE_STATE.verified} then state else ${VERIFICATION_CHALLENGE_STATE.invalidated} end,version=version+1,invalidated_at=coalesce(invalidated_at,${invalidatedAt}),invalidation_reason=coalesce(invalidation_reason,${VERIFICATION_RESEND_REASON}),code_mac=null,code_envelope_id=null where id=${current.id} and version=${current.version}`);
    if (current.code_envelope_id) await this.database.execute(sql`delete from public.verification_code_envelopes where id=${current.code_envelope_id}`);
    const cancelled = (await this.database.execute<MessageDeliveryAuditRow>(sql`update public.message_deliveries set state=${VERIFICATION_DELIVERY_STATE.cancelled},last_outcome=${VERIFICATION_RESEND_REASON},lease_token=null,lease_until=null,version=version+1 where id=${current.delivery_id} and state=${VERIFICATION_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts where delivery_id=${current.delivery_id}) returning id,state,version,connection_id,connection_version,channel`)).rows;
    await appendCancelledMessageDeliveryAudit(this.database, { tribeId: scope.tribeId, actorUserId: scope.userId, operationId: command.ledgerId, cause: VERIFICATION_RESEND_REASON, createdAt: invalidatedAt }, cancelled);
    await this.database.execute(sql`update public.messaging_connection_diagnostics set outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.invalidated} where challenge_id=${current.id} and outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.pending}`);
  }

  /** @param command - Original issuance or explicit resend intent. @returns Whether its own ledger operation is still started. */
  private async hasStartedOperation(command: IssueContactVerificationCommand): Promise<boolean> {
    const scope = command.scope;
    const operationType = issuanceOperationType(command);
    const operation = (await this.database.execute(sql`select id from public.academy_admission_operations where id=${command.ledgerId} and actor_user_id=${scope.userId} and tribe_id=${scope.tribeId} and operation_type=${operationType} and idempotency_key=${command.operationId} and state=${OPERATION_STATE.started} for share`)).rows[0];
    return Boolean(operation);
  }

  /**
   * Creates a fresh current challenge while retaining all confirmed usage and external-attempt identities.
   * @param command - Original ledger-bound issuance or explicit resend intent.
   * @returns A minimal stored issuance or a denial without a new challenge/delivery.
   * @throws AdmissionOperationError when post-write authority changes, forcing the caller to roll back.
   */
  async issue(command: IssueContactVerificationCommand): Promise<ContactVerificationIssuanceResult> {
    const denied = (code: Extract<ContactVerificationIssuanceResult, { outcome: "denied" }>["code"]): ContactVerificationIssuanceResult => ({ outcome: VERIFICATION_ISSUANCE_OUTCOME.denied, code });
    const scope = command.scope;
    if (!await isCurrentVerificationActor(this.database, this.authorize, scope)) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    if (isChannelMismatch(scope)) return denied(ADMISSION_ERROR_CODE.invalidInput);
    // Dispatch takes an exclusive tribe lock. Keep the reader's shared lock without upgrading it.
    await this.database.execute(sql`select id from public.tribes where id=${scope.tribeId} for share`);
    if (!await this.hasStartedOperation(command)) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    const resource = await this.prepare(scope);
    if ("code" in resource) return denied(resource.code);
    await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([VERIFICATION_ISSUANCE_LOCK_DOMAIN, scope.userId, scope.tribeId, scope.contact.type, scope.purpose])},0))`);
    const locked = await this.lockCurrentChallenge(command);
    if ("denial" in locked) return denied(locked.denial);
    const current = locked.current;
    const config = await this.readSecurityConfig();
    if (isIssuanceSecurityChanged(config, resource, scope.securityEpoch) || !await isCurrentVerificationActor(this.database, this.authorize, scope)) return denied(ADMISSION_ERROR_CODE.connectionIncomplete);
    const challengeId = randomUUID(), deliveryId = randomUUID(), envelopeId = randomUUID();
    const diagnosticId = newDiagnosticId(scope);
    // The private global ledger id isolates client keys reused in another actor/tenant/type namespace.
    const budget = await this.requestBudget.consume({ scope, operationId: command.ledgerId, challengeId });
    if (!budget.allowed) return denied(budget.code);
    if (budget.replayed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
    const createdAt = await readVerificationDatabaseNow(this.database), expiresAt = new Date(createdAt.getTime() + ADMISSION_LIMIT.verificationCodeValidityMs);
    const context = { ...scope, challengeId, createdAt, expiresAt };
    const code = generateVerificationCode();
    const signed = await createVerificationCodeMac(config).sign(code, context);
    const envelope = await createVerificationCodeEnvelope(config).seal(code, context, createdAt);
    const frozenIntent = { format: VERIFICATION_FROZEN_PAYLOAD_FORMAT, challengeId, deliveryId, envelopeId, senderId: resource.senderId, templateId: resource.templateId, templateLanguage: resource.templateLanguage, channel: scope.channel, purpose: scope.purpose };
    const payload = await createVerificationDeliveryPayloadMac(config).sign({ tribeId: scope.tribeId, connectionId: scope.connectionId, connectionVersion: scope.connectionVersion, challengeId, diagnosticId, deliveryId, contactSubjectId: budget.contactSubjectId, fingerprintKeyId: budget.fingerprintKeyId, contactFingerprint: budget.contactFingerprint, frozenIntent, createdAt, expiresAt });
    const payloadKeyId = payload.keyId;
    const payloadFingerprint = payload.mac;
    const keyIds = { mac: signed.keyId, otp: envelope.keyId, payload: payloadKeyId, contact: budget.fingerprintKeyId };
    await this.assertCurrentSecurity(config, resource, keyIds);
    if (!await isCurrentVerificationActor(this.database, this.authorize, scope) || await readVerificationDatabaseNow(this.database) >= expiresAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    if (current) await this.supersedeChallenge(command, current);
    const createdDelivery = (await this.database.execute<CreatedMessageDeliveryAuditRow>(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,contact_subject_id,recipient_ref,recipient_country,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${deliveryId},${scope.tribeId},${scope.connectionId},${scope.connectionVersion},${config.environment},${config.securityEpoch},${scope.purpose},${diagnosticId ?? challengeId},${scope.userId},${budget.contactSubjectId},${challengeId},${scope.contact.type === ADMISSION_CONTACT_TYPE.phone ? scope.contact.country : null},${scope.channel},${command.ledgerId},${Buffer.from(payloadFingerprint)},${payloadKeyId},${JSON.stringify(frozenIntent)}::jsonb,${resource.usagePolicyVersion},${createdAt},${createdAt},${expiresAt}) returning id,state,version,connection_id,connection_version,channel,created_at`)).rows[0];
    await appendCreatedMessageDeliveryAudit(this.database, { tribeId: scope.tribeId, actorUserId: scope.userId, operationId: command.ledgerId }, createdDelivery, issuanceOperationType(command));
    const personalColumn = command.personalInvitationId ? sql`,personal_invitation_id,personal_request_id` : sql``;
    const personalValue = command.personalInvitationId ? sql`,${command.personalInvitationId},${command.personalRequestId??null}` : sql``;
    await this.database.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,verification_epoch,connection_id,connection_version,security_epoch,channel,created_at,expires_at,code_mac,mac_key_id,code_envelope_id,delivery_id${personalColumn}) values (${challengeId},${scope.userId},${scope.tribeId},${scope.contact.type},${scope.contact.value},${Buffer.from(budget.contactFingerprint)},${budget.fingerprintKeyId},${scope.purpose},${scope.verificationEpoch},${scope.connectionId},${scope.connectionVersion},${scope.securityEpoch},${scope.channel},${createdAt},${expiresAt},${Buffer.from(signed.mac)},${signed.keyId},${envelopeId},${deliveryId}${personalValue})`);
    await this.database.execute(sql`insert into public.verification_code_envelopes(id,tribe_id,connection_id,connection_version,challenge_id,delivery_id,environment,security_epoch,key_id,iv,ciphertext,created_at,expires_at) values (${envelopeId},${scope.tribeId},${scope.connectionId},${scope.connectionVersion},${challengeId},${deliveryId},${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)},${createdAt},${expiresAt})`);
    if (diagnosticId) await this.database.execute(sql`insert into public.messaging_connection_diagnostics(id,tribe_id,connection_id,connection_version,leader_user_id,challenge_id,channel,sender_id,template_id,template_language,created_at) values (${diagnosticId},${scope.tribeId},${scope.connectionId},${scope.connectionVersion},${scope.userId},${challengeId},${scope.channel},${resource.senderId},${resource.templateId},${resource.templateLanguage},${createdAt})`);
    await this.assertCurrentSecurity(config, resource, keyIds);
    if (!await isCurrentVerificationActor(this.database, this.authorize, scope)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    return { outcome: VERIFICATION_ISSUANCE_OUTCOME.issued, challengeId, deliveryId, diagnosticId, expiresAt, resendAllowedAt: new Date(createdAt.getTime() + ADMISSION_LIMIT.verificationResendWaitMs) };
  }
}
