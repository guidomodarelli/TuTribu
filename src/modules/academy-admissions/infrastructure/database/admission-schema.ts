/** Projects admission-owned SQL tables; versioned migrations own RLS, triggers and deferred timing. */
import { sql } from "drizzle-orm";
import { boolean, check, customType, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn, PgTableExtraConfig } from "drizzle-orm/pg-core";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {VERIFICATION_ISSUANCE_OPERATION} from "@/src/modules/academy-admissions/constants/verification-issuance";

/** Resolves cross-owner columns after both table factories have finished. */
export type AdmissionMessagingSchemaReferences = {
  versions: { connectionId: AnyPgColumn; tribeId: AnyPgColumn; version: AnyPgColumn };
  deliveries: { id: AnyPgColumn; tribeId: AnyPgColumn; connectionId: AnyPgColumn; connectionVersion: AnyPgColumn };
  codeEnvelopes: { id: AnyPgColumn; challengeId: AnyPgColumn; deliveryId: AnyPgColumn; tribeId: AnyPgColumn; connectionId: AnyPgColumn; connectionVersion: AnyPgColumn };
};

/** Resolves the membership owner after the decision table has been composed. */
export type AdmissionMembershipSchemaReferences = {
  id:AnyPgColumn;decisionId:AnyPgColumn;requestId:AnyPgColumn;tribeId:AnyPgColumn;userId:AnyPgColumn;outcome:AnyPgColumn;
};

/** Existing table references are injected by the shared schema composition root. */
type AdmissionSchemaParents = {
  users: { id: AnyPgColumn }; tribes: { id: AnyPgColumn };
  globalIdentityEvidence: { id: AnyPgColumn; userId: AnyPgColumn };
  tribeInvitations: { id: AnyPgColumn; tribeId: AnyPgColumn };
  messaging: () => AdmissionMessagingSchemaReferences;
  membershipEffects: () => AdmissionMembershipSchemaReferences;
};

/** Maps only the PostgreSQL binary representation consumed by the adapter. */
const binaryData = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea", toDriver: (value) => Buffer.from(value), fromDriver: (value) => new Uint8Array(value),
});

/**
 * Names one parent relationship exactly as the versioned SQL artifact.
 * @param name - Stable constraint name.
 * @param column - Child table column.
 * @param parent - Parent table column injected by composition.
 * @param onDelete - SQL deletion behavior; defaults to tenant cascade.
 * @returns A foreign-key builder without executing SQL.
 */
function parentReference(name: string, column: AnyPgColumn, parent: AnyPgColumn, onDelete: "cascade" | "restrict" | "set null" = "cascade") {
  return foreignKey({ name, columns: [column], foreignColumns: [parent] }).onDelete(onDelete);
}

/**
 * Builds the exact tenant/version relationship from lazily composed parents.
 * @param name - Constraint name shared with the versioned SQL migration.
 * @param columns - Child connection, tribe and version in reference order.
 * @param parents - Factory parents resolved after both owners are composed.
 * @returns A foreign key whose deferred timing remains owned by SQL.
 */
function messagingVersionReference(name: string,columns: [AnyPgColumn,AnyPgColumn,AnyPgColumn],parents: AdmissionSchemaParents) {
  const versions=parents.messaging().versions;
  return foreignKey({name,columns,foreignColumns:[versions.connectionId,versions.tribeId,versions.version]});
}

/**
 * Creates the admission projection with explicit parents, avoiding schema import cycles.
 *
 * @param parents - Existing shared tables; no account or tenant data is read here.
 * @returns Admission-owned table definitions for repositories and schema tooling.
 * @remarks SQL remains authoritative for the deferred request/decision/proof cycle,
 * FORCE RLS and immutable-transition triggers. Policies and grants remain SQL-owned.
 */
export function createAdmissionSchema(parents: AdmissionSchemaParents) {
  const policies = pgTable("academy_admission_policies", {
    tribeId: uuid("tribe_id").primaryKey(),
    mode: text("mode").notNull().default("manual_review"), contactType: text("contact_type").notNull().default("email"),
    isOpen: boolean("is_open").notNull().default(false), allowCommonExceptions: boolean("allow_common_exceptions").notNull().default(false),
    requiresAdditionalVerification: boolean("requires_additional_verification").notNull().default(false),
    phoneChannel: text("phone_channel"), allowSmsAlternative: boolean("allow_sms_alternative").notNull().default(false),
    messagingConnectionId: uuid("messaging_connection_id"), messagingConnectionVersion: integer("messaging_connection_version"),
    verificationEpoch: integer("verification_epoch").notNull().default(1), version: integer("version").notNull().default(1),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    changedByUserId: text("changed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_policy_tribe_fkey",table.tribeId,parents.tribes.id),
    changerForeignKey: parentReference("admission_policy_changer_fkey",table.changedByUserId,parents.users.id,"set null"),
    messagingVersionForeignKey: messagingVersionReference("admission_policy_messaging_version_fkey",[table.messagingConnectionId,table.tribeId,table.messagingConnectionVersion],parents),
    modeCheck: check("admission_policy_mode_check", sql`${table.mode} in ('manual_review','allowlist')`),
    contactCheck: check("admission_policy_contact_check", sql`${table.contactType} in ('email','phone')`),
    channelCheck: check("admission_policy_channel_check", sql`${table.phoneChannel} in ('whatsapp','sms')`),
    epochCheck: check("admission_policy_epoch_check", sql`${table.verificationEpoch}>0`),
    versionCheck: check("admission_policy_version_check", sql`${table.version}>0`),
    phoneCheck: check("admission_policy_phone_check", sql`${table.contactType}<>'phone' or ${table.mode}<>'allowlist' or ${table.requiresAdditionalVerification}`),
    alternativeCheck: check("admission_policy_alternative_check", sql`not ${table.allowSmsAlternative} or (${table.contactType}='phone' and ${table.phoneChannel} is not distinct from 'whatsapp' and ${table.requiresAdditionalVerification})`),
    connectionPairCheck: check("admission_policy_connection_pair_check", sql`(${table.messagingConnectionId} is null)=(${table.messagingConnectionVersion} is null)`),
    connectionVersionCheck: check("admission_policy_connection_version_check", sql`${table.messagingConnectionVersion} is null or ${table.messagingConnectionVersion}>0`),
  }));
  const allowlistEntries = pgTable("academy_allowlist_entries", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(),
    contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(),
    displayName: text("display_name"), status: text("status").notNull().default("enabled"), version: integer("version").notNull().default(1),
    origin: text("origin").notNull().default("manual"), importId: uuid("import_id"),
    createdByUserId: text("created_by_user_id"), updatedByUserId: text("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_allowlist_tribe_fkey",table.tribeId,parents.tribes.id),
    creatorForeignKey: parentReference("admission_allowlist_creator_fkey",table.createdByUserId,parents.users.id,"set null"),
    updaterForeignKey: parentReference("admission_allowlist_updater_fkey",table.updatedByUserId,parents.users.id,"set null"),
    scopeKey: unique("admission_allowlist_scope_key").on(table.id,table.tribeId),
    contactKey: unique("admission_allowlist_contact_key").on(table.tribeId,table.contactType,table.normalizedContact),
    searchIndex: index("admission_allowlist_search_idx").on(table.tribeId,table.status,table.normalizedContact),
    contactCheck: check("admission_allowlist_contact_check", sql`${table.contactType} in ('email','phone')`),
    normalizedCheck: check("admission_allowlist_normalized_check", sql`${table.normalizedContact}<>'' and ${table.normalizedContact}=btrim(${table.normalizedContact})`),
    nameCheck: check("admission_allowlist_name_check", sql`char_length(${table.displayName})<=${ADMISSION_LIMIT.displayNameCharacters}`.inlineParams()),
    stateCheck: check("admission_allowlist_state_check", sql`${table.status} in ('enabled','disabled')`),
    versionCheck: check("admission_allowlist_version_check", sql`${table.version}>0`),
    originCheck: check("admission_allowlist_origin_check", sql`${table.origin} in ('manual','import')`),
    importForeignKey: foreignKey({ name: "admission_allowlist_import_fkey", columns: [table.importId,table.tribeId], foreignColumns: [imports.id,imports.tribeId] }).onDelete("restrict"),
  }));
  const personalInvitations = pgTable("academy_personal_invitations", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), createdByUserId: text("created_by_user_id"),
    internalName: text("internal_name"), contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(),
    requiresAllowlist: boolean("requires_allowlist").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }).default(sql`clock_timestamp()+interval '7 days'`),
    status: text("status").notNull().default("active"), version: integer("version").notNull().default(1),
    tokenHash: binaryData("token_hash").notNull(), tokenKeyId: text("token_key_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    redeemedByUserId: text("redeemed_by_user_id"),
    redeemedRequestId: uuid("redeemed_request_id"), redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }), authorizationRevokedAt: timestamp("authorization_revoked_at", { withTimezone: true }),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_invitation_tribe_fkey",table.tribeId,parents.tribes.id),
    creatorForeignKey: parentReference("admission_invitation_creator_fkey",table.createdByUserId,parents.users.id,"set null"),
    redeemerForeignKey: parentReference("admission_invitation_redeemer_fkey",table.redeemedByUserId,parents.users.id,"restrict"),
    scopeKey: unique("admission_invitation_scope_key").on(table.id,table.tribeId),
    redemptionScopeKey: unique("admission_invitation_redemption_scope_key").on(table.id,table.redeemedRequestId,table.tribeId,table.redeemedByUserId),
    tokenKey: unique("admission_invitation_token_key").on(table.tokenKeyId,table.tokenHash),
    activeRecipientKey: uniqueIndex("admission_invitation_active_recipient_key").on(table.tribeId,table.contactType,table.normalizedContact).where(sql`${table.status}='active'`),
    nameCheck: check("admission_invitation_name_check", sql`char_length(${table.internalName})<=${ADMISSION_LIMIT.displayNameCharacters}`.inlineParams()),
    contactCheck: check("admission_invitation_contact_check", sql`${table.contactType} in ('email','phone')`),
    normalizedCheck: check("admission_invitation_normalized_check", sql`${table.normalizedContact}<>'' and ${table.normalizedContact}=btrim(${table.normalizedContact})`),
    stateCheck: check("admission_invitation_state_check", sql`${table.status} in ('active','revoked','expired','redeemed')`),
    versionCheck: check("admission_invitation_version_check", sql`${table.version}>0`),
    timeCheck: check("admission_invitation_time_check", sql`${table.expiresAt} is null or ${table.expiresAt}>${table.createdAt}`),
    redemptionCheck: check("admission_invitation_redemption_check", sql`(${table.status}='redeemed' and ${table.redeemedByUserId} is not null and ${table.redeemedRequestId} is not null and ${table.redeemedAt} is not null) or (${table.status}<>'redeemed' and ${table.redeemedByUserId} is null and ${table.redeemedRequestId} is null and ${table.redeemedAt} is null)`),
    authorizationCheck: check("admission_invitation_authorization_check", sql`${table.authorizationRevokedAt} is null or ${table.status}='redeemed'`),
    requestForeignKey: foreignKey({ name: "admission_invitation_request_fkey", columns: [table.redeemedRequestId,table.tribeId,table.redeemedByUserId], foreignColumns: [requests.id,requests.tribeId,requests.userId] }),
  }));

  const challenges = pgTable("contact_verification_challenges", {
    id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), tribeId: uuid("tribe_id").notNull(),
    contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(),
    purpose: text("purpose").notNull(), verificationEpoch: integer("verification_epoch"),
    connectionId: uuid("connection_id").notNull(), connectionVersion: integer("connection_version").notNull(),
    securityEpoch: text("security_epoch").notNull(), channel: text("channel").notNull(),
    state: text("state").notNull().default("issued"), version: integer("version").notNull().default(1), isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0), verifiedAt: timestamp("verified_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }), invalidationReason: text("invalidation_reason"),
    codeMac: binaryData("code_mac"), macKeyId: text("mac_key_id").notNull(), codeEnvelopeId: uuid("code_envelope_id"), deliveryId: uuid("delivery_id").notNull(),
  }, (table): PgTableExtraConfig => ({
    userForeignKey: parentReference("admission_challenge_user_fkey",table.userId,parents.users.id),
    tribeForeignKey: parentReference("admission_challenge_tribe_fkey",table.tribeId,parents.tribes.id),
    scopeKey: unique("admission_challenge_scope_key").on(table.id,table.tribeId,table.userId),
    messagingTenantScopeKey: uniqueIndex("messaging_challenge_tenant_scope_key").on(table.id,table.tribeId),
    messagingVersionForeignKey: messagingVersionReference("admission_challenge_messaging_version_fkey",[table.connectionId,table.tribeId,table.connectionVersion],parents),
    deliveryForeignKey: foreignKey({name:"admission_challenge_delivery_fkey",columns:[table.deliveryId,table.tribeId,table.connectionId,table.connectionVersion],foreignColumns:[parents.messaging().deliveries.id,parents.messaging().deliveries.tribeId,parents.messaging().deliveries.connectionId,parents.messaging().deliveries.connectionVersion]}),
    codeEnvelopeForeignKey: foreignKey({name:"admission_challenge_otp_fkey",columns:[table.codeEnvelopeId,table.id,table.deliveryId,table.tribeId,table.connectionId,table.connectionVersion],foreignColumns:[parents.messaging().codeEnvelopes.id,parents.messaging().codeEnvelopes.challengeId,parents.messaging().codeEnvelopes.deliveryId,parents.messaging().codeEnvelopes.tribeId,parents.messaging().codeEnvelopes.connectionId,parents.messaging().codeEnvelopes.connectionVersion]}),
    currentKey: uniqueIndex("admission_challenge_current_key").on(table.userId,table.tribeId,table.contactType,table.normalizedContact,table.purpose).where(sql`${table.isCurrent}`),
    expiryIndex: index("admission_challenge_expiry_idx").on(table.expiresAt).where(sql`${table.state}='issued'`),
    contactCheck: check("admission_challenge_contact_check", sql`${table.contactType} in ('email','phone')`),
    purposeCheck: check("admission_challenge_purpose_check", sql`${table.purpose} in ('admission','connection_diagnostic')`),
    epochCheck: check("admission_challenge_epoch_check", sql`(${table.purpose}='admission' and ${table.verificationEpoch} is not null and ${table.verificationEpoch}>0) or (${table.purpose}='connection_diagnostic' and ${table.verificationEpoch} is null)`),
    connectionVersionCheck: check("admission_challenge_connection_version_check", sql`${table.connectionVersion}>0`),
    channelCheck: check("admission_challenge_channel_check", sql`${table.channel} in ('email','sms','whatsapp')`),
    stateCheck: check("admission_challenge_state_check", sql`${table.state} in ('issued','verified','invalidated','expired')`),
    versionCheck: check("admission_challenge_version_check", sql`${table.version}>0`),
    failuresCheck: check("admission_challenge_failures_check", sql`${table.failedAttempts} between 0 and ${ADMISSION_LIMIT.verificationChallengeFailureCount}`.inlineParams()),
    timeCheck: check("admission_challenge_time_check", sql`${table.expiresAt}>${table.createdAt} and ${table.expiresAt}<=${table.createdAt}+${ADMISSION_LIMIT.verificationCodeValidityMs}*interval '1 millisecond'`.inlineParams()),
    verifiedCheck: check("admission_challenge_verified_check", sql`(${table.state}='verified')=(${table.verifiedAt} is not null)`),
  }));
  const proofs = pgTable("academy_admission_verification_proofs", {
    id: uuid("id").defaultRandom().primaryKey(), challengeId: uuid("challenge_id").notNull(),
    userId: text("user_id").notNull(), tribeId: uuid("tribe_id").notNull(), contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    verificationEpoch: integer("verification_epoch").notNull(), connectionId: uuid("connection_id").notNull(), connectionVersion: integer("connection_version").notNull(),
    securityEpoch: text("security_epoch").notNull(), verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(), applyBefore: timestamp("apply_before", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("available"), appliedRequestId: uuid("applied_request_id"), appliedAt: timestamp("applied_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }), invalidationReason: text("invalidation_reason"),
  }, (table): PgTableExtraConfig => ({
    userForeignKey: parentReference("admission_proof_user_fkey",table.userId,parents.users.id), tribeForeignKey: parentReference("admission_proof_tribe_fkey",table.tribeId,parents.tribes.id),
    challengeKey: unique("admission_proof_challenge_key").on(table.challengeId),
    scopeKey: unique("admission_proof_scope_key").on(table.id,table.tribeId,table.userId),
    applicationScopeKey: unique("admission_proof_application_scope_key").on(table.id,table.appliedRequestId,table.tribeId,table.userId),
    challengeForeignKey: foreignKey({ name: "admission_proof_challenge_fkey", columns: [table.challengeId,table.tribeId,table.userId], foreignColumns: [challenges.id,challenges.tribeId,challenges.userId] }),
    messagingVersionForeignKey: messagingVersionReference("admission_proof_messaging_version_fkey",[table.connectionId,table.tribeId,table.connectionVersion],parents),
    requestForeignKey: foreignKey({ name: "admission_proof_request_fkey", columns: [table.appliedRequestId,table.tribeId,table.userId], foreignColumns: [requests.id,requests.tribeId,requests.userId] }),
    contactCheck: check("admission_proof_contact_check", sql`${table.contactType} in ('email','phone')`),
    epochCheck: check("admission_proof_epoch_check", sql`${table.verificationEpoch}>0`), connectionVersionCheck: check("admission_proof_connection_version_check", sql`${table.connectionVersion}>0`),
    stateCheck: check("admission_proof_state_check", sql`${table.status} in ('available','applied','invalid')`),
    timeCheck: check("admission_proof_time_check", sql`${table.applyBefore}>${table.verifiedAt} and ${table.applyBefore}<=${table.verifiedAt}+${ADMISSION_LIMIT.verificationProofFreshnessMs}*interval '1 millisecond'`.inlineParams()),
    applicationCheck: check("admission_proof_application_check", sql`(${table.status}='applied' and ${table.appliedRequestId} is not null and ${table.appliedAt} is not null) or (${table.status}='available' and ${table.appliedRequestId} is null and ${table.appliedAt} is null) or (${table.status}='invalid' and ((${table.appliedRequestId} is null)=(${table.appliedAt} is null)))`),
  }));
  const requests = pgTable("academy_admission_requests", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), userId: text("user_id").notNull(),
    source: text("source").notNull(), invitationId: uuid("invitation_id"), legacyInvitationId: uuid("legacy_invitation_id"),
    contactType: text("contact_type"), normalizedContact: text("normalized_contact"), contactFingerprint: binaryData("contact_fingerprint"), fingerprintKeyId: text("fingerprint_key_id"),
    evidenceSource: text("evidence_source").notNull().default("none"), globalIdentityEvidenceId: uuid("global_identity_evidence_id"), proofId: uuid("proof_id"), bindingId: uuid("binding_id"),
    requiresAllowlist: boolean("requires_allowlist").notNull().default(false), originalPolicySnapshot: jsonb("original_policy_snapshot").notNull().default({}),
    applicantMessage: text("applicant_message"), status: text("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1), decisionId: uuid("decision_id"), cancelReason: text("cancel_reason"), retryAllowedAt: timestamp("retry_allowed_at", { withTimezone: true }),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_request_tribe_fkey",table.tribeId,parents.tribes.id), userForeignKey: parentReference("admission_request_user_fkey",table.userId,parents.users.id),
    scopeKey: unique("admission_request_scope_key").on(table.id,table.tribeId,table.userId),
    pendingKey: uniqueIndex("admission_request_pending_key").on(table.tribeId,table.userId).where(sql`${table.status}='pending'`),
    inboxIndex: index("admission_request_inbox_idx").on(table.tribeId,table.status,table.submittedAt),
    accountHistoryIndex: index("admission_request_account_history_idx").on(table.tribeId,table.userId,table.submittedAt.desc(),table.id.desc()),
    sourceCheck: check("admission_request_source_check", sql`${table.source} in ('common','personal','legacy')`), contactCheck: check("admission_request_contact_check", sql`${table.contactType} in ('email','phone')`),
    evidenceCheck: check("admission_request_evidence_check", sql`${table.evidenceSource} in ('none','declared','base','local')`),
    messageCheck: check("admission_request_message_check", sql`char_length(${table.applicantMessage})<=${ADMISSION_LIMIT.internalMessageCharacters}`.inlineParams()),
    stateCheck: check("admission_request_state_check", sql`${table.status} in ('pending','approved','rejected','cancelled','expired')`), versionCheck: check("admission_request_version_check", sql`${table.version}>0`),
    sourceScopeCheck: check("admission_request_source_scope_check", sql`(${table.source}='common' and ${table.invitationId} is null and ${table.legacyInvitationId} is null) or (${table.source}='personal' and ${table.invitationId} is not null and ${table.legacyInvitationId} is null) or (${table.source}='legacy' and ${table.invitationId} is null and ${table.legacyInvitationId} is not null)`),
    contactPairCheck: check("admission_request_contact_pair_check", sql`(${table.contactType} is null)=(${table.normalizedContact} is null)`),
    timeCheck: check("admission_request_time_check", sql`${table.expiresAt}>${table.submittedAt} and ${table.expiresAt}<=${table.submittedAt}+${ADMISSION_LIMIT.pendingValidityMs}*interval '1 millisecond'`.inlineParams()),
    decisionCheck: check("admission_request_decision_check", sql`(${table.status}='pending')=(${table.decisionId} is null)`),
    invitationForeignKey: foreignKey({ name: "admission_request_invitation_fkey", columns: [table.invitationId,table.tribeId], foreignColumns: [personalInvitations.id,personalInvitations.tribeId] }),
    legacyInvitationForeignKey: foreignKey({ name: "admission_request_legacy_invitation_fkey", columns: [table.legacyInvitationId,table.tribeId], foreignColumns: [parents.tribeInvitations.id,parents.tribeInvitations.tribeId] }).onDelete("restrict"),
    globalEvidenceForeignKey: foreignKey({ name: "admission_request_global_evidence_fkey", columns: [table.globalIdentityEvidenceId,table.userId], foreignColumns: [parents.globalIdentityEvidence.id,parents.globalIdentityEvidence.userId] }).onDelete("restrict"),
    redemptionForeignKey: foreignKey({ name: "admission_request_redemption_fkey", columns: [table.invitationId,table.id,table.tribeId,table.userId], foreignColumns: [personalInvitations.id,personalInvitations.redeemedRequestId,personalInvitations.tribeId,personalInvitations.redeemedByUserId] }),
    proofForeignKey: foreignKey({ name: "admission_request_proof_fkey", columns: [table.proofId,table.id,table.tribeId,table.userId], foreignColumns: [proofs.id,proofs.appliedRequestId,proofs.tribeId,proofs.userId] }),
    bindingForeignKey: foreignKey({ name: "admission_request_binding_fkey", columns: [table.bindingId,table.tribeId,table.userId], foreignColumns: [bindings.id,bindings.tribeId,bindings.ownerUserId] }),
    decisionForeignKey: foreignKey({ name: "admission_request_decision_fkey", columns: [table.decisionId,table.id,table.tribeId,table.userId,table.status], foreignColumns: [decisions.id,decisions.requestId,decisions.tribeId,decisions.userId,decisions.outcome] }),
  }));
  const bindings = pgTable("academy_admission_contact_bindings", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(), ownerUserId: text("owner_user_id").notNull(),
    firstRequestId: uuid("first_request_id"), firstProofId: uuid("first_proof_id"), evidenceSource: text("evidence_source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_binding_tribe_fkey",table.tribeId,parents.tribes.id,"restrict"), userForeignKey: parentReference("admission_binding_user_fkey",table.ownerUserId,parents.users.id,"restrict"),
    scopeKey: unique("admission_binding_scope_key").on(table.id,table.tribeId,table.ownerUserId), contactKey: unique("admission_binding_contact_key").on(table.tribeId,table.contactType,table.normalizedContact),
    contactCheck: check("admission_binding_contact_check", sql`${table.contactType} in ('email','phone')`), evidenceCheck: check("admission_binding_evidence_check", sql`${table.evidenceSource} in ('base','local')`),
    originCheck: check("admission_binding_origin_check", sql`${table.firstRequestId} is not null or ${table.firstProofId} is not null`),
    requestForeignKey: foreignKey({ name: "admission_binding_request_fkey", columns: [table.firstRequestId,table.tribeId,table.ownerUserId], foreignColumns: [requests.id,requests.tribeId,requests.userId] }),
    proofForeignKey: foreignKey({ name: "admission_binding_proof_fkey", columns: [table.firstProofId,table.tribeId,table.ownerUserId], foreignColumns: [proofs.id,proofs.tribeId,proofs.userId] }),
  }));
  const decisions = pgTable("academy_admission_decisions", {
    id: uuid("id").defaultRandom().primaryKey(), requestId: uuid("request_id").notNull(), tribeId: uuid("tribe_id").notNull(), userId: text("user_id").notNull(), requestVersion: integer("request_version").notNull(),
    outcome: text("outcome").notNull(), actorUserId: text("actor_user_id"), actorKind: text("actor_kind").notNull(), rule: text("rule").notNull(),
    policyVersion: integer("policy_version").notNull(), verificationEpoch: integer("verification_epoch").notNull(), evidenceSnapshot: jsonb("evidence_snapshot").notNull().default({}),
    allowlistEntryId: uuid("allowlist_entry_id"), allowlistEntryVersion: integer("allowlist_entry_version"),
    internalReason: text("internal_reason"), externalMessage: text("external_message"), decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), membershipEffectId: uuid("membership_effect_id"),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_decision_tribe_fkey",table.tribeId,parents.tribes.id), userForeignKey: parentReference("admission_decision_user_fkey",table.userId,parents.users.id), actorForeignKey: parentReference("admission_decision_actor_fkey",table.actorUserId,parents.users.id,"set null"),
    requestKey: unique("admission_decision_request_key").on(table.requestId), scopeKey: unique("admission_decision_scope_key").on(table.id,table.requestId,table.tribeId,table.userId,table.outcome),
    requestForeignKey: foreignKey({ name: "admission_decision_request_fkey", columns: [table.requestId,table.tribeId,table.userId], foreignColumns: [requests.id,requests.tribeId,requests.userId] }),
    allowlistForeignKey: foreignKey({ name: "admission_decision_allowlist_scope_fkey", columns: [table.allowlistEntryId,table.tribeId], foreignColumns: [allowlistEntries.id,allowlistEntries.tribeId] }).onDelete("restrict"),
    allowlistPairCheck: check("admission_decision_allowlist_pair_check", sql`(${table.allowlistEntryId} is null and ${table.allowlistEntryVersion} is null) or (${table.allowlistEntryId} is not null and ${table.allowlistEntryVersion} is not null and ${table.allowlistEntryVersion}>0)`),
    versionCheck: check("admission_decision_version_check", sql`${table.requestVersion}>0`), outcomeCheck: check("admission_decision_outcome_check", sql`${table.outcome} in ('approved','rejected','cancelled','expired')`),
    actorCheck: check("admission_decision_actor_check", sql`${table.actorKind} in ('user','system')`), policyVersionCheck: check("admission_decision_policy_version_check", sql`${table.policyVersion}>0`), epochCheck: check("admission_decision_epoch_check", sql`${table.verificationEpoch}>0`),
    reasonCheck: check("admission_decision_reason_check", sql`char_length(${table.internalReason})<=${ADMISSION_LIMIT.internalMessageCharacters}`.inlineParams()), messageCheck: check("admission_decision_message_check", sql`char_length(${table.externalMessage})<=${ADMISSION_LIMIT.externalMessageCharacters}`.inlineParams()),
    effectCheck: check("admission_decision_effect_check", sql`(${table.outcome}='approved')=(${table.membershipEffectId} is not null)`),
    membershipEffectForeignKey: foreignKey({name:"admission_decision_membership_effect_fkey",columns:[table.membershipEffectId,table.id,table.requestId,table.tribeId,table.userId,table.outcome],foreignColumns:[parents.membershipEffects().id,parents.membershipEffects().decisionId,parents.membershipEffects().requestId,parents.membershipEffects().tribeId,parents.membershipEffects().userId,parents.membershipEffects().outcome]}),
  }));
  const operations = pgTable("academy_admission_operations", {
    id: uuid("id").defaultRandom().primaryKey(), actorUserId: text("actor_user_id").notNull(), tribeId: uuid("tribe_id").notNull(), operationType: text("operation_type").notNull(), idempotencyKey: uuid("idempotency_key").notNull(),
    intentFingerprint: binaryData("intent_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(), state: text("state").notNull().default("started"), verificationPurpose:text("verification_purpose"),
    leaseOwner: uuid("lease_owner"), leaseUntil: timestamp("lease_until", { withTimezone: true }), version: integer("version").notNull().default(1), publicResult: jsonb("public_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), completedAt: timestamp("completed_at", { withTimezone: true }),
  }, (table): PgTableExtraConfig => ({
    actorForeignKey: parentReference("admission_operation_actor_fkey",table.actorUserId,parents.users.id), tribeForeignKey: parentReference("admission_operation_tribe_fkey",table.tribeId,parents.tribes.id),
    identityKey: unique("admission_operation_identity_key").on(table.actorUserId,table.tribeId,table.operationType,table.idempotencyKey),
    scopeKey: unique("admission_operation_scope_key").on(table.id,table.tribeId),
    verificationPurposeCheck:check("admission_operation_verification_purpose_check",sql`${table.verificationPurpose} is null or (${table.operationType} in (${VERIFICATION_ISSUANCE_OPERATION.issue},${VERIFICATION_ISSUANCE_OPERATION.resend}) and ${table.verificationPurpose} in (${ADMISSION_VERIFICATION_PURPOSE.admission},${ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic}))`.inlineParams()),
    stateCheck: check("admission_operation_state_check", sql`${table.state} in ('started','completed')`), versionCheck: check("admission_operation_version_check", sql`${table.version}>0`),
    resultCheck: check("admission_operation_result_check", sql`(${table.state}='completed' and ${table.publicResult} is not null and ${table.completedAt} is not null) or (${table.state}='started' and ${table.publicResult} is null and ${table.completedAt} is null)`),
    leasePairCheck: check("admission_operation_lease_pair_check", sql`(${table.leaseOwner} is null)=(${table.leaseUntil} is null)`),
    completedClaimCheck: check("admission_operation_completed_claim_check", sql`${table.state}<>'completed' or (${table.leaseOwner} is null and ${table.leaseUntil} is null)`),
  }));
  const imports = pgTable("academy_allowlist_imports", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), actorUserId: text("actor_user_id").notNull(), contactType: text("contact_type").notNull(), policyVersion: integer("policy_version").notNull(),
    fileFingerprint: binaryData("file_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(), selectedRows: integer("selected_rows").array().notNull().default([]),
    version: integer("version").notNull().default(1), state: text("state").notNull().default("preview"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_import_tribe_fkey",table.tribeId,parents.tribes.id), actorForeignKey: parentReference("admission_import_actor_fkey",table.actorUserId,parents.users.id),
    scopeKey: unique("admission_import_scope_key").on(table.id,table.tribeId), contactCheck: check("admission_import_contact_check", sql`${table.contactType} in ('email','phone')`), policyVersionCheck: check("admission_import_policy_version_check", sql`${table.policyVersion}>0`),
    versionCheck: check("admission_import_version_check", sql`${table.version}>0`), stateCheck: check("admission_import_state_check", sql`${table.state} in ('preview','processing','completed','cancelled','expired')`),
    timeCheck: check("admission_import_time_check", sql`${table.expiresAt}>${table.createdAt} and ${table.purgeAfter}>=${table.expiresAt} and ${table.purgeAfter}<=${table.createdAt}+interval '24 hours'`),
  }));
  const importRows = pgTable("academy_allowlist_import_rows", {
    importId: uuid("import_id").notNull(), tribeId: uuid("tribe_id").notNull(), rowNumber: integer("row_number").notNull(), inputData: jsonb("input_data").notNull(), validationResult: jsonb("validation_result").notNull(),
    outcome: text("outcome"), entryId: uuid("entry_id"), committedAt: timestamp("committed_at", { withTimezone: true }),
  }, (table): PgTableExtraConfig => ({
    primaryKey: primaryKey({ name: "academy_allowlist_import_rows_pkey", columns: [table.importId,table.rowNumber] }),
    rowNumberCheck: check("admission_import_row_number_check", sql`${table.rowNumber} between 1 and ${ADMISSION_LIMIT.csvDataRowCount}`.inlineParams()),
    outcomeCheck: check("admission_import_row_outcome_check", sql`${table.outcome} in ('added','unchanged','skipped','conflict')`), commitCheck: check("admission_import_row_commit_check", sql`(${table.outcome} is null)=(${table.committedAt} is null)`),
    importForeignKey: foreignKey({ name: "admission_import_row_import_fkey", columns: [table.importId,table.tribeId], foreignColumns: [imports.id,imports.tribeId] }).onDelete("cascade"),
    entryForeignKey: foreignKey({ name: "admission_import_row_entry_fkey", columns: [table.entryId,table.tribeId], foreignColumns: [allowlistEntries.id,allowlistEntries.tribeId] }),
  }));
  const auditEvents = pgTable("academy_admission_audit_events", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), actorUserId: text("actor_user_id"), resourceType: text("resource_type").notNull(), resourceId: uuid("resource_id"),
    operationId: uuid("operation_id"), eventType: text("event_type").notNull(), rule: text("rule"), cause: text("cause"), resourceVersion: integer("resource_version"), metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_audit_tribe_fkey",table.tribeId,parents.tribes.id,"restrict"), actorForeignKey: parentReference("admission_audit_actor_fkey",table.actorUserId,parents.users.id,"set null"),
    operationForeignKey: foreignKey({name:"admission_audit_operation_fkey",columns:[table.operationId,table.tribeId],foreignColumns:[operations.id,operations.tribeId]}).onDelete("restrict"),
    historyIndex: index("admission_audit_history_idx").on(table.tribeId,table.createdAt.desc()),
  }));
  const notificationObligations = pgTable("academy_admission_notification_obligations", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), requestId: uuid("request_id").notNull(), applicantUserId: text("applicant_user_id").notNull(), eventType: text("event_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), materializedAt: timestamp("materialized_at", { withTimezone: true }),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: parentReference("admission_obligation_tribe_fkey",table.tribeId,parents.tribes.id), applicantForeignKey: parentReference("admission_obligation_applicant_fkey",table.applicantUserId,parents.users.id),
    eventKey: unique("admission_obligation_event_key").on(table.requestId,table.eventType), eventCheck: check("admission_obligation_event_check", sql`${table.eventType} in ('pending_created','approved','rejected','cancelled','expired','reminder')`),
    tenantKey: unique("admission_obligation_tenant_key").on(table.id,table.tribeId),
    requestForeignKey: foreignKey({ name: "admission_obligation_request_fkey", columns: [table.requestId,table.tribeId,table.applicantUserId], foreignColumns: [requests.id,requests.tribeId,requests.userId] }).onDelete("cascade"),
  }));
  return {
    policies: policies.enableRLS(), allowlistEntries: allowlistEntries.enableRLS(), personalInvitations: personalInvitations.enableRLS(), challenges: challenges.enableRLS(),
    proofs: proofs.enableRLS(), requests: requests.enableRLS(), bindings: bindings.enableRLS(), decisions: decisions.enableRLS(), operations: operations.enableRLS(),
    imports: imports.enableRLS(), importRows: importRows.enableRLS(), auditEvents: auditEvents.enableRLS(), notificationObligations: notificationObligations.enableRLS(),
  };
}
