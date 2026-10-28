/** Projects admission-owned SQL tables; versioned migrations own RLS, triggers and deferred timing. */
import { ADMISSION_PRIVATE_DATA_RETENTION } from "../../constants/admission-retention";
import { sql } from "drizzle-orm";
import { boolean, check, customType, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn, type PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {VERIFICATION_ISSUANCE_OPERATION} from "@/src/modules/academy-admissions/constants/verification-issuance";
import { ADMISSION_TRIBE_NAMESPACE_DATABASE } from "@/src/modules/academy-admissions/constants/admission-tribe-namespace";
import { ADMISSION_TRIBE_ARCHIVE_DATABASE } from "@/src/modules/academy-admissions/constants/admission-tribe-archive";
import { ADMISSION_METRIC_RUN_OPERATION, ADMISSION_WORKER_RUN_DATABASE } from "@/src/modules/academy-admissions/constants/admission-metrics";
import { ADMISSION_ACTIVITY_DATABASE } from "@/src/modules/academy-admissions/constants/admission-activity";
import type { AdmissionMetricRunOperation } from "@/src/modules/academy-admissions/domain/entities/admission-metric-dimensions";
import { ADMISSION_NOTIFICATION_AUDIT } from "@/src/modules/notifications/constants/admission-notification-audit";
import { ADMISSION_WHATSAPP_NUMBER_CONSTRAINT, ADMISSION_WHATSAPP_CANONICAL_PATTERN } from "../../constants/admission-whatsapp-number";
import { ADMISSION_NOTIFICATION_SOURCE_POSITION_INDEX } from "@/src/modules/notifications/constants/admission-notification-source-selection";

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

/** Sibling admission columns referenced by constraints, resolved once every table has been created. */
type AdmissionTableReferences = {
  tribeNamespaces: { tribeId: AnyPgColumn };
  retiredOperations: { id: AnyPgColumn; tribeId: AnyPgColumn };
  allowlistEntries: { id: AnyPgColumn; tribeId: AnyPgColumn };
  personalInvitations: { id: AnyPgColumn; redeemedByUserId: AnyPgColumn; redeemedRequestId: AnyPgColumn; tribeId: AnyPgColumn };
  challenges: { id: AnyPgColumn; tribeId: AnyPgColumn; userId: AnyPgColumn };
  proofs: { appliedRequestId: AnyPgColumn; id: AnyPgColumn; tribeId: AnyPgColumn; userId: AnyPgColumn };
  requests: { id: AnyPgColumn; invitationId: AnyPgColumn; tribeId: AnyPgColumn; userId: AnyPgColumn };
  bindings: { id: AnyPgColumn; ownerUserId: AnyPgColumn; tribeId: AnyPgColumn };
  decisions: { id: AnyPgColumn; outcome: AnyPgColumn; requestId: AnyPgColumn; tribeId: AnyPgColumn; userId: AnyPgColumn };
  operations: { id: AnyPgColumn; tribeId: AnyPgColumn };
  imports: { id: AnyPgColumn; tribeId: AnyPgColumn };
};

/** Inputs shared by every admission table factory. */
type AdmissionTableContext = {
  parents: AdmissionSchemaParents;
  /** Reads sibling tables; only constraint and reference callbacks call it, after composition. */
  tables: () => AdmissionTableReferences;
};

/**
 * Reads the composed sibling tables for a lazily evaluated constraint.
 * @param references - Sibling tables, assigned once every factory has run.
 * @returns The composed sibling tables.
 * @throws Error when a constraint is evaluated before the schema has been composed.
 */
function readComposedReferences(references: AdmissionTableReferences | undefined): AdmissionTableReferences {
  if (!references) throw new Error("Admission schema references were read before composition.");
  return references;
}

/**
 * Projects a private namespace whose lifetime is independent of the live tribe row.
 * @returns The table definition, before RLS is enabled.
 */
function createTribeNamespacesTable() {
  return pgTable(ADMISSION_TRIBE_NAMESPACE_DATABASE.tableName, {
    tribeId: uuid("tribe_id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  }, (table): PgTableExtraConfigValue[] => [check(ADMISSION_TRIBE_NAMESPACE_DATABASE.retirementConstraintName, sql`${table.retiredAt} is null or ${table.retiredAt}>=${table.createdAt}`)]);
}

/**
 * Retains protected contact ownership without normalized contact or account identity.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createRetiredBindingsTable({ tables }: AdmissionTableContext) {
  return pgTable(ADMISSION_TRIBE_ARCHIVE_DATABASE.bindings.tableName, {
    id: uuid("id").primaryKey(),
    tribeId: uuid("tribe_id").notNull().references(() => tables().tribeNamespaces.tribeId),
    contactType: text("contact_type").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(),
    fingerprintKeyId: text("fingerprint_key_id").notNull(),
    ownerReferenceId: uuid("owner_reference_id").notNull(),
    firstRequestReferenceId: uuid("first_request_reference_id"),
    firstProofReferenceId: uuid("first_proof_reference_id"),
    evidenceSource: text("evidence_source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfigValue[] => [
    unique(ADMISSION_TRIBE_ARCHIVE_DATABASE.bindings.scopeConstraint).on(table.id, table.tribeId),
    check(ADMISSION_TRIBE_ARCHIVE_DATABASE.bindings.timeConstraint, sql`${table.retiredAt}>=${table.createdAt}`),
    check(ADMISSION_TRIBE_ARCHIVE_DATABASE.bindings.contactConstraint, sql`${table.contactType} in ('email','phone')`),
    index(ADMISSION_TRIBE_ARCHIVE_DATABASE.bindings.contactIndex).on(table.tribeId, table.contactType, table.fingerprintKeyId, table.contactFingerprint),
  ]);
}

/**
 * Retains operation identity and terminal metadata without public result or claim material.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createRetiredOperationsTable({ tables }: AdmissionTableContext) {
  return pgTable(ADMISSION_TRIBE_ARCHIVE_DATABASE.operations.tableName, {
    id: uuid("id").primaryKey(),
    tribeId: uuid("tribe_id").notNull().references(() => tables().tribeNamespaces.tribeId),
    actorReferenceId: uuid("actor_reference_id").notNull(),
    operationType: text("operation_type").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    intentFingerprint: binaryData("intent_fingerprint").notNull(),
    fingerprintKeyId: text("fingerprint_key_id").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfigValue[] => [
    unique(ADMISSION_TRIBE_ARCHIVE_DATABASE.operations.scopeConstraint).on(table.id, table.tribeId),
    check(ADMISSION_TRIBE_ARCHIVE_DATABASE.operations.timeConstraint, sql`${table.retiredAt}>=${table.createdAt}`),
    check(ADMISSION_TRIBE_ARCHIVE_DATABASE.operations.versionConstraint, sql`${table.version}>0`),
  ]);
}

/**
 * Keeps opaque originals and selected scope facts without free metadata or account identifiers.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createRetiredAuditEventsTable({ tables }: AdmissionTableContext) {
  return pgTable(ADMISSION_TRIBE_ARCHIVE_DATABASE.auditEvents.tableName, {
    id: uuid("id").primaryKey(),
    tribeId: uuid("tribe_id").notNull().references(() => tables().tribeNamespaces.tribeId),
    actorReferenceId: uuid("actor_reference_id"),
    operationId: uuid("operation_id"),
    tribeLifecycleOperationId: uuid("tribe_lifecycle_operation_id"),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    eventType: text("event_type").notNull(),
    rule: text("rule"),
    cause: text("cause"),
    resourceVersion: integer("resource_version"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfigValue[] => [
    foreignKey({ name: ADMISSION_TRIBE_ARCHIVE_DATABASE.auditEvents.operationConstraint, columns: [table.operationId, table.tribeId], foreignColumns: [tables().retiredOperations.id, tables().retiredOperations.tribeId] }),
    check(ADMISSION_TRIBE_ARCHIVE_DATABASE.auditEvents.timeConstraint, sql`${table.retiredAt}>=${table.createdAt}`),
    index(ADMISSION_TRIBE_ARCHIVE_DATABASE.auditEvents.historyIndex).on(table.tribeId, table.createdAt.desc()),
    index(ADMISSION_PRIVATE_DATA_RETENTION.archivedAuditIndex).on(table.createdAt,table.id),
  ]);
}

/**
 * Projects the `academy_admission_policies` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createPoliciesTable({ parents }: AdmissionTableContext) {
  return pgTable("academy_admission_policies", {
    tribeId: uuid("tribe_id").primaryKey(),
    mode: text("mode").notNull().default("manual_review"), contactType: text("contact_type").notNull().default("email"),
    isOpen: boolean("is_open").notNull().default(false), allowCommonExceptions: boolean("allow_common_exceptions").notNull().default(false),
    requiresAdditionalVerification: boolean("requires_additional_verification").notNull().default(false),
    requiresWhatsappNumber: boolean("requires_whatsapp_number").notNull().default(true),
    phoneChannel: text("phone_channel"), allowSmsAlternative: boolean("allow_sms_alternative").notNull().default(false),
    messagingConnectionId: uuid("messaging_connection_id"), messagingConnectionVersion: integer("messaging_connection_version"),
    verificationEpoch: integer("verification_epoch").notNull().default(1), version: integer("version").notNull().default(1),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    changedByUserId: text("changed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_policy_tribe_fkey",table.tribeId,parents.tribes.id),
    parentReference("admission_policy_changer_fkey",table.changedByUserId,parents.users.id,"set null"),
    messagingVersionReference("admission_policy_messaging_version_fkey",[table.messagingConnectionId,table.tribeId,table.messagingConnectionVersion],parents),
    check("admission_policy_mode_check", sql`${table.mode} in ('manual_review','allowlist')`),
    check("admission_policy_contact_check", sql`${table.contactType} in ('email','phone')`),
    check("admission_policy_channel_check", sql`${table.phoneChannel} in ('whatsapp','sms')`),
    check("admission_policy_epoch_check", sql`${table.verificationEpoch}>0`),
    check("admission_policy_version_check", sql`${table.version}>0`),
    check("admission_policy_phone_check", sql`${table.contactType}<>'phone' or ${table.mode}<>'allowlist' or ${table.requiresAdditionalVerification}`),
    check("admission_policy_alternative_check", sql`not ${table.allowSmsAlternative} or (${table.contactType}='phone' and ${table.phoneChannel} is not distinct from 'whatsapp' and ${table.requiresAdditionalVerification})`),
    check("admission_policy_connection_pair_check", sql`(${table.messagingConnectionId} is null)=(${table.messagingConnectionVersion} is null)`),
    check("admission_policy_connection_version_check", sql`${table.messagingConnectionVersion} is null or ${table.messagingConnectionVersion}>0`),
  ]);
}

/**
 * Projects the `academy_allowlist_entries` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createAllowlistEntriesTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_allowlist_entries", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(),
    contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(),
    displayName: text("display_name"), status: text("status").notNull().default("enabled"), version: integer("version").notNull().default(1),
    origin: text("origin").notNull().default("manual"), importId: uuid("import_id"),
    createdByUserId: text("created_by_user_id"), updatedByUserId: text("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_allowlist_tribe_fkey",table.tribeId,parents.tribes.id),
    parentReference("admission_allowlist_creator_fkey",table.createdByUserId,parents.users.id,"set null"),
    parentReference("admission_allowlist_updater_fkey",table.updatedByUserId,parents.users.id,"set null"),
    unique("admission_allowlist_scope_key").on(table.id,table.tribeId),
    unique("admission_allowlist_contact_key").on(table.tribeId,table.contactType,table.normalizedContact),
    index("admission_allowlist_search_idx").on(table.tribeId,table.status,table.normalizedContact),
    check("admission_allowlist_contact_check", sql`${table.contactType} in ('email','phone')`),
    check("admission_allowlist_normalized_check", sql`${table.normalizedContact}<>'' and ${table.normalizedContact}=btrim(${table.normalizedContact})`),
    check("admission_allowlist_name_check", sql`char_length(${table.displayName})<=${ADMISSION_LIMIT.displayNameCharacters}`.inlineParams()),
    check("admission_allowlist_state_check", sql`${table.status} in ('enabled','disabled')`),
    check("admission_allowlist_version_check", sql`${table.version}>0`),
    check("admission_allowlist_origin_check", sql`${table.origin} in ('manual','import')`),
    foreignKey({ name: "admission_allowlist_import_fkey", columns: [table.importId,table.tribeId], foreignColumns: [tables().imports.id,tables().imports.tribeId] }).onDelete("restrict"),
  ]);
}

/**
 * Projects the `academy_personal_invitations` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createPersonalInvitationsTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_personal_invitations", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), createdByUserId: text("created_by_user_id"),
    internalName: text("internal_name"), contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(),
    requiresAllowlist: boolean("requires_allowlist").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }).default(sql`clock_timestamp()+interval '7 days'`),
    status: text("status").notNull().default("active"), version: integer("version").notNull().default(1),
    tokenHash: binaryData("token_hash").notNull(), tokenKeyId: text("token_key_id").notNull(),
    tokenContextDigest: binaryData("token_context_digest"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    redeemedByUserId: text("redeemed_by_user_id"),
    redeemedRequestId: uuid("redeemed_request_id"), redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }), authorizationRevokedAt: timestamp("authorization_revoked_at", { withTimezone: true }),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_invitation_tribe_fkey",table.tribeId,parents.tribes.id),
    parentReference("admission_invitation_creator_fkey",table.createdByUserId,parents.users.id,"set null"),
    parentReference("admission_invitation_redeemer_fkey",table.redeemedByUserId,parents.users.id,"restrict"),
    unique("admission_invitation_scope_key").on(table.id,table.tribeId),
    unique("admission_invitation_redemption_scope_key").on(table.id,table.redeemedRequestId,table.tribeId,table.redeemedByUserId),
    unique("admission_invitation_token_key").on(table.tokenKeyId,table.tokenHash),
    check("admission_invitation_context_digest_check", sql`${table.tokenContextDigest} is null or octet_length(${table.tokenContextDigest})=32`),
    uniqueIndex("admission_invitation_active_recipient_key").on(table.tribeId,table.contactType,table.normalizedContact).where(sql`${table.status}='active'`),
    check("admission_invitation_name_check", sql`char_length(${table.internalName})<=${ADMISSION_LIMIT.displayNameCharacters}`.inlineParams()),
    check("admission_invitation_contact_check", sql`${table.contactType} in ('email','phone')`),
    check("admission_invitation_normalized_check", sql`${table.normalizedContact}<>'' and ${table.normalizedContact}=btrim(${table.normalizedContact})`),
    check("admission_invitation_state_check", sql`${table.status} in ('active','revoked','expired','redeemed')`),
    check("admission_invitation_version_check", sql`${table.version}>0`),
    check("admission_invitation_time_check", sql`${table.expiresAt} is null or ${table.expiresAt}>${table.createdAt}`),
    check("admission_invitation_redemption_check", sql`(${table.status}='redeemed' and ${table.redeemedByUserId} is not null and ${table.redeemedRequestId} is not null and ${table.redeemedAt} is not null) or (${table.status}<>'redeemed' and ${table.redeemedByUserId} is null and ${table.redeemedRequestId} is null and ${table.redeemedAt} is null)`),
    check("admission_invitation_authorization_check", sql`${table.authorizationRevokedAt} is null or ${table.status}='redeemed'`),
    foreignKey({ name: "admission_invitation_request_fkey", columns: [table.redeemedRequestId,table.tribeId,table.redeemedByUserId], foreignColumns: [tables().requests.id,tables().requests.tribeId,tables().requests.userId] }),
  ]);
}

/**
 * Projects the `contact_verification_challenges` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createChallengesTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("contact_verification_challenges", {
    id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), tribeId: uuid("tribe_id").notNull(),
    contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(),
    purpose: text("purpose").notNull(), verificationEpoch: integer("verification_epoch"), personalInvitationId: uuid("personal_invitation_id"), personalRequestId: uuid("personal_request_id"),
    connectionId: uuid("connection_id").notNull(), connectionVersion: integer("connection_version").notNull(),
    securityEpoch: text("security_epoch").notNull(), channel: text("channel").notNull(),
    state: text("state").notNull().default("issued"), version: integer("version").notNull().default(1), isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0), verifiedAt: timestamp("verified_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }), invalidationReason: text("invalidation_reason"),
    codeMac: binaryData("code_mac"), macKeyId: text("mac_key_id").notNull(), codeEnvelopeId: uuid("code_envelope_id"), deliveryId: uuid("delivery_id").notNull(),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_challenge_user_fkey",table.userId,parents.users.id),
    parentReference("admission_challenge_tribe_fkey",table.tribeId,parents.tribes.id),
    unique("admission_challenge_scope_key").on(table.id,table.tribeId,table.userId),
    foreignKey({ name: "admission_challenge_personal_invitation_fkey", columns: [table.personalInvitationId,table.tribeId], foreignColumns: [tables().personalInvitations.id,tables().personalInvitations.tribeId] }),
    check("admission_challenge_personal_purpose_check", sql`${table.personalInvitationId} is null or ${table.purpose}='admission'`),
    foreignKey({name:"admission_challenge_personal_request_fkey",columns:[table.personalRequestId,table.tribeId,table.userId,table.personalInvitationId],foreignColumns:[tables().requests.id,tables().requests.tribeId,tables().requests.userId,tables().requests.invitationId]}),
    check("admission_challenge_personal_request_origin_check",sql`${table.personalRequestId} is null or ${table.personalInvitationId} is not null`),
    uniqueIndex("messaging_challenge_tenant_scope_key").on(table.id,table.tribeId),
    messagingVersionReference("admission_challenge_messaging_version_fkey",[table.connectionId,table.tribeId,table.connectionVersion],parents),
    foreignKey({name:"admission_challenge_delivery_fkey",columns:[table.deliveryId,table.tribeId,table.connectionId,table.connectionVersion],foreignColumns:[parents.messaging().deliveries.id,parents.messaging().deliveries.tribeId,parents.messaging().deliveries.connectionId,parents.messaging().deliveries.connectionVersion]}),
    foreignKey({name:"admission_challenge_otp_fkey",columns:[table.codeEnvelopeId,table.id,table.deliveryId,table.tribeId,table.connectionId,table.connectionVersion],foreignColumns:[parents.messaging().codeEnvelopes.id,parents.messaging().codeEnvelopes.challengeId,parents.messaging().codeEnvelopes.deliveryId,parents.messaging().codeEnvelopes.tribeId,parents.messaging().codeEnvelopes.connectionId,parents.messaging().codeEnvelopes.connectionVersion]}),
    uniqueIndex("admission_challenge_current_key").on(table.userId,table.tribeId,table.contactType,table.normalizedContact,table.purpose).where(sql`${table.isCurrent}`),
    index("admission_challenge_expiry_idx").on(table.expiresAt).where(sql`${table.state}='issued'`),
    check("admission_challenge_contact_check", sql`${table.contactType} in ('email','phone')`),
    check("admission_challenge_purpose_check", sql`${table.purpose} in ('admission','connection_diagnostic')`),
    check("admission_challenge_epoch_check", sql`(${table.purpose}='admission' and ${table.verificationEpoch} is not null and ${table.verificationEpoch}>0) or (${table.purpose}='connection_diagnostic' and ${table.verificationEpoch} is null)`),
    check("admission_challenge_connection_version_check", sql`${table.connectionVersion}>0`),
    check("admission_challenge_channel_check", sql`${table.channel} in ('email','sms','whatsapp')`),
    check("admission_challenge_state_check", sql`${table.state} in ('issued','verified','invalidated','expired')`),
    check("admission_challenge_version_check", sql`${table.version}>0`),
    check("admission_challenge_failures_check", sql`${table.failedAttempts} between 0 and ${ADMISSION_LIMIT.verificationChallengeFailureCount}`.inlineParams()),
    check("admission_challenge_time_check", sql`${table.expiresAt}>${table.createdAt} and ${table.expiresAt}<=${table.createdAt}+${ADMISSION_LIMIT.verificationCodeValidityMs}*interval '1 millisecond'`.inlineParams()),
    check("admission_challenge_verified_check", sql`(${table.state}='verified')=(${table.verifiedAt} is not null)`),
  ]);
}

/**
 * Projects the `academy_admission_verification_proofs` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createProofsTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_admission_verification_proofs", {
    id: uuid("id").defaultRandom().primaryKey(), challengeId: uuid("challenge_id").notNull(),
    userId: text("user_id").notNull(), tribeId: uuid("tribe_id").notNull(), contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact").notNull(),
    verificationEpoch: integer("verification_epoch").notNull(), connectionId: uuid("connection_id").notNull(), connectionVersion: integer("connection_version").notNull(),
    securityEpoch: text("security_epoch").notNull(), verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(), applyBefore: timestamp("apply_before", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("available"), appliedRequestId: uuid("applied_request_id"), appliedAt: timestamp("applied_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }), invalidationReason: text("invalidation_reason"),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_proof_user_fkey",table.userId,parents.users.id), parentReference("admission_proof_tribe_fkey",table.tribeId,parents.tribes.id),
    unique("admission_proof_challenge_key").on(table.challengeId),
    unique("admission_proof_scope_key").on(table.id,table.tribeId,table.userId),
    unique("admission_proof_application_scope_key").on(table.id,table.appliedRequestId,table.tribeId,table.userId),
    foreignKey({ name: "admission_proof_challenge_fkey", columns: [table.challengeId,table.tribeId,table.userId], foreignColumns: [tables().challenges.id,tables().challenges.tribeId,tables().challenges.userId] }),
    messagingVersionReference("admission_proof_messaging_version_fkey",[table.connectionId,table.tribeId,table.connectionVersion],parents),
    foreignKey({ name: "admission_proof_request_fkey", columns: [table.appliedRequestId,table.tribeId,table.userId], foreignColumns: [tables().requests.id,tables().requests.tribeId,tables().requests.userId] }),
    check("admission_proof_contact_check", sql`${table.contactType} in ('email','phone')`),
    check("admission_proof_epoch_check", sql`${table.verificationEpoch}>0`), check("admission_proof_connection_version_check", sql`${table.connectionVersion}>0`),
    check("admission_proof_state_check", sql`${table.status} in ('available','applied','invalid')`),
    check("admission_proof_time_check", sql`${table.applyBefore}>${table.verifiedAt} and ${table.applyBefore}<=${table.verifiedAt}+${ADMISSION_LIMIT.verificationProofFreshnessMs}*interval '1 millisecond'`.inlineParams()),
    check("admission_proof_application_check", sql`(${table.status}='applied' and ${table.appliedRequestId} is not null and ${table.appliedAt} is not null) or (${table.status}='available' and ${table.appliedRequestId} is null and ${table.appliedAt} is null) or (${table.status}='invalid' and ((${table.appliedRequestId} is null)=(${table.appliedAt} is null)))`),
  ]);
}

/**
 * Projects the `academy_admission_requests` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createRequestsTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_admission_requests", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), userId: text("user_id").notNull(),
    source: text("source").notNull(), invitationId: uuid("invitation_id"), legacyInvitationId: uuid("legacy_invitation_id"),
    contactType: text("contact_type"), normalizedContact: text("normalized_contact"), contactFingerprint: binaryData("contact_fingerprint"), fingerprintKeyId: text("fingerprint_key_id"),
    evidenceSource: text("evidence_source").notNull().default("none"), globalIdentityEvidenceId: uuid("global_identity_evidence_id"), proofId: uuid("proof_id"), bindingId: uuid("binding_id"),
    requiresAllowlist: boolean("requires_allowlist").notNull().default(false), originalPolicySnapshot: jsonb("original_policy_snapshot").notNull().default({}),
    whatsappNumber: text("whatsapp_number"), applicantMessage: text("applicant_message"), status: text("status").notNull().default("pending"),
    privateMaterialMinimizedAt: timestamp("private_material_minimized_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1), decisionId: uuid("decision_id"), cancelReason: text("cancel_reason"), retryAllowedAt: timestamp("retry_allowed_at", { withTimezone: true }),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_request_tribe_fkey",table.tribeId,parents.tribes.id), parentReference("admission_request_user_fkey",table.userId,parents.users.id),
    unique("admission_request_scope_key").on(table.id,table.tribeId,table.userId),
    unique("admission_request_personal_origin_key").on(table.id,table.tribeId,table.userId,table.invitationId),
    uniqueIndex("admission_request_pending_key").on(table.tribeId,table.userId).where(sql`${table.status}='pending'`),
    index("admission_request_inbox_idx").on(table.tribeId,table.status,table.submittedAt),
    index(ADMISSION_PRIVATE_DATA_RETENTION.requestIndex).on(table.decisionId,table.id).where(sql`${table.privateMaterialMinimizedAt} is null and ${table.status}<>'pending'`),
    check(ADMISSION_PRIVATE_DATA_RETENTION.requestMinimizationCheck, sql`${table.privateMaterialMinimizedAt} is null or (${table.status}<>'pending' and ${table.privateMaterialMinimizedAt}>=${table.submittedAt} and ${table.contactType} is null and ${table.normalizedContact} is null and ${table.whatsappNumber} is null and ${table.contactFingerprint} is null and ${table.fingerprintKeyId} is null and ${table.applicantMessage} is null)`),
    index("admission_request_account_history_idx").on(table.tribeId,table.userId,table.submittedAt.desc(),table.id.desc()),
    check("admission_request_source_check", sql`${table.source} in ('common','personal','legacy')`), check("admission_request_contact_check", sql`${table.contactType} in ('email','phone')`),
    check("admission_request_evidence_check", sql`${table.evidenceSource} in ('none','declared','base','local')`),
    check(ADMISSION_WHATSAPP_NUMBER_CONSTRAINT, sql`${table.whatsappNumber} is null or ${table.whatsappNumber} ~ ${ADMISSION_WHATSAPP_CANONICAL_PATTERN.source}`.inlineParams()),
    check("admission_request_message_check", sql`char_length(${table.applicantMessage})<=${ADMISSION_LIMIT.internalMessageCharacters}`.inlineParams()),
    check("admission_request_state_check", sql`${table.status} in ('pending','approved','rejected','cancelled','expired')`), check("admission_request_version_check", sql`${table.version}>0`),
    check("admission_request_source_scope_check", sql`(${table.source}='common' and ${table.invitationId} is null and ${table.legacyInvitationId} is null) or (${table.source}='personal' and ${table.invitationId} is not null and ${table.legacyInvitationId} is null) or (${table.source}='legacy' and ${table.invitationId} is null and ${table.legacyInvitationId} is not null)`),
    check("admission_request_contact_pair_check", sql`(${table.contactType} is null)=(${table.normalizedContact} is null)`),
    check("admission_request_time_check", sql`${table.expiresAt}>${table.submittedAt} and ${table.expiresAt}<=${table.submittedAt}+${ADMISSION_LIMIT.pendingValidityMs}*interval '1 millisecond'`.inlineParams()),
    check("admission_request_decision_check", sql`(${table.status}='pending')=(${table.decisionId} is null)`),
    foreignKey({ name: "admission_request_invitation_fkey", columns: [table.invitationId,table.tribeId], foreignColumns: [tables().personalInvitations.id,tables().personalInvitations.tribeId] }),
    foreignKey({ name: "admission_request_legacy_invitation_fkey", columns: [table.legacyInvitationId,table.tribeId], foreignColumns: [parents.tribeInvitations.id,parents.tribeInvitations.tribeId] }).onDelete("restrict"),
    foreignKey({ name: "admission_request_global_evidence_fkey", columns: [table.globalIdentityEvidenceId,table.userId], foreignColumns: [parents.globalIdentityEvidence.id,parents.globalIdentityEvidence.userId] }).onDelete("restrict"),
    foreignKey({ name: "admission_request_redemption_fkey", columns: [table.invitationId,table.id,table.tribeId,table.userId], foreignColumns: [tables().personalInvitations.id,tables().personalInvitations.redeemedRequestId,tables().personalInvitations.tribeId,tables().personalInvitations.redeemedByUserId] }),
    foreignKey({ name: "admission_request_proof_fkey", columns: [table.proofId,table.id,table.tribeId,table.userId], foreignColumns: [tables().proofs.id,tables().proofs.appliedRequestId,tables().proofs.tribeId,tables().proofs.userId] }),
    foreignKey({ name: "admission_request_binding_fkey", columns: [table.bindingId,table.tribeId,table.userId], foreignColumns: [tables().bindings.id,tables().bindings.tribeId,tables().bindings.ownerUserId] }),
    foreignKey({ name: "admission_request_decision_fkey", columns: [table.decisionId,table.id,table.tribeId,table.userId,table.status], foreignColumns: [tables().decisions.id,tables().decisions.requestId,tables().decisions.tribeId,tables().decisions.userId,tables().decisions.outcome] }),
  ]);
}

/**
 * Projects the `academy_admission_contact_bindings` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createBindingsTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_admission_contact_bindings", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), contactType: text("contact_type").notNull(), normalizedContact: text("normalized_contact"),
    contactFingerprint: binaryData("contact_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(), ownerUserId: text("owner_user_id"),
    ownerReferenceId: uuid("owner_reference_id").notNull().defaultRandom(), minimizedAt: timestamp("minimized_at", { withTimezone: true }),
    firstRequestId: uuid("first_request_id"), firstProofId: uuid("first_proof_id"), evidenceSource: text("evidence_source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_binding_tribe_fkey",table.tribeId,parents.tribes.id,"restrict"), parentReference("admission_binding_user_fkey",table.ownerUserId,parents.users.id,"set null"),
    unique("admission_binding_scope_key").on(table.id,table.tribeId,table.ownerUserId), unique("admission_binding_contact_key").on(table.tribeId,table.contactType,table.normalizedContact),
    check("admission_binding_contact_check", sql`${table.contactType} in ('email','phone')`), check("admission_binding_evidence_check", sql`${table.evidenceSource} in ('base','local')`),
    index("admission_minimized_contact_lookup_idx").on(table.tribeId,table.contactType,table.fingerprintKeyId,table.contactFingerprint).where(sql`${table.normalizedContact} is null`),
    check("admission_binding_origin_check", sql`${table.minimizedAt} is not null or ${table.firstRequestId} is not null or ${table.firstProofId} is not null`),
    check("admission_binding_minimization_check", sql`(${table.minimizedAt} is null and ${table.ownerUserId} is not null and ${table.normalizedContact} is not null) or (${table.minimizedAt} is not null and ${table.ownerUserId} is null and ${table.normalizedContact} is null and ${table.firstRequestId} is null and ${table.firstProofId} is null and ${table.minimizedAt}>=${table.createdAt})`),
    foreignKey({ name: "admission_binding_request_fkey", columns: [table.firstRequestId,table.tribeId,table.ownerUserId], foreignColumns: [tables().requests.id,tables().requests.tribeId,tables().requests.userId] }),
    foreignKey({ name: "admission_binding_proof_fkey", columns: [table.firstProofId,table.tribeId,table.ownerUserId], foreignColumns: [tables().proofs.id,tables().proofs.tribeId,tables().proofs.userId] }),
  ]);
}

/**
 * Projects the `academy_admission_decisions` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createDecisionsTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_admission_decisions", {
    id: uuid("id").defaultRandom().primaryKey(), requestId: uuid("request_id").notNull(), tribeId: uuid("tribe_id").notNull(), userId: text("user_id").notNull(), requestVersion: integer("request_version").notNull(),
    outcome: text("outcome").notNull(), actorUserId: text("actor_user_id"), actorKind: text("actor_kind").notNull(), rule: text("rule").notNull(),
    policyVersion: integer("policy_version").notNull(), verificationEpoch: integer("verification_epoch").notNull(), evidenceSnapshot: jsonb("evidence_snapshot").notNull().default({}),
    allowlistEntryId: uuid("allowlist_entry_id"), allowlistEntryVersion: integer("allowlist_entry_version"),
    internalReason: text("internal_reason"), externalMessage: text("external_message"), decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), membershipEffectId: uuid("membership_effect_id"),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_decision_tribe_fkey",table.tribeId,parents.tribes.id), parentReference("admission_decision_user_fkey",table.userId,parents.users.id), parentReference("admission_decision_actor_fkey",table.actorUserId,parents.users.id,"set null"),
    index(ADMISSION_PRIVATE_DATA_RETENTION.decisionIndex).on(table.decidedAt,table.id),
    unique("admission_decision_request_key").on(table.requestId), unique("admission_decision_scope_key").on(table.id,table.requestId,table.tribeId,table.userId,table.outcome),
    foreignKey({ name: "admission_decision_request_fkey", columns: [table.requestId,table.tribeId,table.userId], foreignColumns: [tables().requests.id,tables().requests.tribeId,tables().requests.userId] }),
    foreignKey({ name: "admission_decision_allowlist_scope_fkey", columns: [table.allowlistEntryId,table.tribeId], foreignColumns: [tables().allowlistEntries.id,tables().allowlistEntries.tribeId] }).onDelete("restrict"),
    check("admission_decision_allowlist_pair_check", sql`(${table.allowlistEntryId} is null and ${table.allowlistEntryVersion} is null) or (${table.allowlistEntryId} is not null and ${table.allowlistEntryVersion} is not null and ${table.allowlistEntryVersion}>0)`),
    check("admission_decision_version_check", sql`${table.requestVersion}>0`), check("admission_decision_outcome_check", sql`${table.outcome} in ('approved','rejected','cancelled','expired')`),
    check("admission_decision_actor_check", sql`${table.actorKind} in ('user','system')`), check("admission_decision_policy_version_check", sql`${table.policyVersion}>0`), check("admission_decision_epoch_check", sql`${table.verificationEpoch}>0`),
    check("admission_decision_reason_check", sql`char_length(${table.internalReason})<=${ADMISSION_LIMIT.internalMessageCharacters}`.inlineParams()), check("admission_decision_message_check", sql`char_length(${table.externalMessage})<=${ADMISSION_LIMIT.externalMessageCharacters}`.inlineParams()),
    check("admission_decision_effect_check", sql`(${table.outcome}='approved')=(${table.membershipEffectId} is not null)`),
    foreignKey({name:"admission_decision_membership_effect_fkey",columns:[table.membershipEffectId,table.id,table.requestId,table.tribeId,table.userId,table.outcome],foreignColumns:[parents.membershipEffects().id,parents.membershipEffects().decisionId,parents.membershipEffects().requestId,parents.membershipEffects().tribeId,parents.membershipEffects().userId,parents.membershipEffects().outcome]}),
  ]);
}

/**
 * Projects the `academy_admission_operations` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createOperationsTable({ parents }: AdmissionTableContext) {
  return pgTable("academy_admission_operations", {
    id: uuid("id").defaultRandom().primaryKey(), actorUserId: text("actor_user_id"), actorReferenceId: uuid("actor_reference_id").notNull().defaultRandom(), minimizedAt: timestamp("minimized_at", { withTimezone: true }), tribeId: uuid("tribe_id").notNull(), operationType: text("operation_type").notNull(), idempotencyKey: uuid("idempotency_key").notNull(),
    intentFingerprint: binaryData("intent_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(), state: text("state").notNull().default("started"), verificationPurpose:text("verification_purpose"),
    leaseOwner: uuid("lease_owner"), leaseUntil: timestamp("lease_until", { withTimezone: true }), version: integer("version").notNull().default(1), publicResult: jsonb("public_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), completedAt: timestamp("completed_at", { withTimezone: true }),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_operation_actor_fkey",table.actorUserId,parents.users.id,"set null"), parentReference("admission_operation_tribe_fkey",table.tribeId,parents.tribes.id),
    check("admission_operation_minimization_check", sql`(${table.minimizedAt} is null and ${table.actorUserId} is not null) or (${table.minimizedAt} is not null and ${table.actorUserId} is null and ${table.minimizedAt}>=${table.createdAt})`),
    unique("admission_operation_identity_key").on(table.actorUserId,table.tribeId,table.operationType,table.idempotencyKey),
    unique("admission_operation_scope_key").on(table.id,table.tribeId),
    check("admission_operation_verification_purpose_check",sql`${table.verificationPurpose} is null or (${table.operationType} in (${VERIFICATION_ISSUANCE_OPERATION.issue},${VERIFICATION_ISSUANCE_OPERATION.resend}) and ${table.verificationPurpose} in (${ADMISSION_VERIFICATION_PURPOSE.admission},${ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic}))`.inlineParams()),
    check("admission_operation_state_check", sql`${table.state} in ('started','completed')`), check("admission_operation_version_check", sql`${table.version}>0`),
    check("admission_operation_result_check", sql`(${table.state}='completed' and ${table.publicResult} is not null and ${table.completedAt} is not null) or (${table.state}='started' and ${table.publicResult} is null and ${table.completedAt} is null)`),
    check("admission_operation_lease_pair_check", sql`(${table.leaseOwner} is null)=(${table.leaseUntil} is null)`),
    check("admission_operation_completed_claim_check", sql`${table.state}<>'completed' or (${table.leaseOwner} is null and ${table.leaseUntil} is null)`),
  ]);
}

/**
 * Projects the `academy_allowlist_imports` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createImportsTable({ parents }: AdmissionTableContext) {
  return pgTable("academy_allowlist_imports", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), actorUserId: text("actor_user_id").notNull(), contactType: text("contact_type").notNull(), policyVersion: integer("policy_version").notNull(),
    fileFingerprint: binaryData("file_fingerprint").notNull(), fingerprintKeyId: text("fingerprint_key_id").notNull(), selectedRows: integer("selected_rows").array().notNull().default([]),
    version: integer("version").notNull().default(1), state: text("state").notNull().default("preview"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_import_tribe_fkey",table.tribeId,parents.tribes.id), parentReference("admission_import_actor_fkey",table.actorUserId,parents.users.id),
    unique("admission_import_scope_key").on(table.id,table.tribeId), check("admission_import_contact_check", sql`${table.contactType} in ('email','phone')`), check("admission_import_policy_version_check", sql`${table.policyVersion}>0`),
    check("admission_import_version_check", sql`${table.version}>0`), check("admission_import_state_check", sql`${table.state} in ('preview','processing','completed','cancelled','expired')`),
    check("admission_import_time_check", sql`${table.expiresAt}>${table.createdAt} and ${table.purgeAfter}>=${table.expiresAt} and ${table.purgeAfter}<=${table.createdAt}+interval '24 hours'`),
  ]);
}

/**
 * Projects the `academy_allowlist_import_rows` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createImportRowsTable({ tables }: AdmissionTableContext) {
  return pgTable("academy_allowlist_import_rows", {
    importId: uuid("import_id").notNull(), tribeId: uuid("tribe_id").notNull(), rowNumber: integer("row_number").notNull(), inputData: jsonb("input_data").notNull(), validationResult: jsonb("validation_result").notNull(),
    outcome: text("outcome"), entryId: uuid("entry_id"), committedAt: timestamp("committed_at", { withTimezone: true }),
  }, (table): PgTableExtraConfigValue[] => [
    primaryKey({ name: "academy_allowlist_import_rows_pkey", columns: [table.importId,table.rowNumber] }),
    check("admission_import_row_number_check", sql`${table.rowNumber} between 1 and ${ADMISSION_LIMIT.csvDataRowCount}`.inlineParams()),
    check("admission_import_row_outcome_check", sql`${table.outcome} in ('added','unchanged','skipped','conflict')`), check("admission_import_row_commit_check", sql`(${table.outcome} is null)=(${table.committedAt} is null)`),
    foreignKey({ name: "admission_import_row_import_fkey", columns: [table.importId,table.tribeId], foreignColumns: [tables().imports.id,tables().imports.tribeId] }).onDelete("cascade"),
    foreignKey({ name: "admission_import_row_entry_fkey", columns: [table.entryId,table.tribeId], foreignColumns: [tables().allowlistEntries.id,tables().allowlistEntries.tribeId] }),
  ]);
}

/**
 * Projects the `academy_admission_audit_events` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createAuditEventsTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_admission_audit_events", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), actorUserId: text("actor_user_id"), resourceType: text("resource_type").notNull(), resourceId: uuid("resource_id"),
    operationId: uuid("operation_id"), tribeLifecycleOperationId: uuid("tribe_lifecycle_operation_id"), eventType: text("event_type").notNull(), rule: text("rule"), cause: text("cause"), resourceVersion: integer("resource_version"), metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_audit_tribe_fkey",table.tribeId,parents.tribes.id,"restrict"), parentReference("admission_audit_actor_fkey",table.actorUserId,parents.users.id,"set null"),
    foreignKey({name:"admission_audit_operation_fkey",columns:[table.operationId,table.tribeId],foreignColumns:[tables().operations.id,tables().operations.tribeId]}).onDelete("restrict"),
    index("admission_audit_history_idx").on(table.tribeId,table.createdAt.desc()),
    index(ADMISSION_PRIVATE_DATA_RETENTION.auditIndex).on(table.createdAt,table.id),
    index(ADMISSION_ACTIVITY_DATABASE.resourceHistoryIndex).on(table.tribeId,table.resourceType,table.resourceId,table.createdAt.desc(),table.id.desc()),
    uniqueIndex(ADMISSION_NOTIFICATION_AUDIT.factIndex).on(table.tribeId,table.resourceId,table.eventType).where(sql`${table.resourceType}=${ADMISSION_NOTIFICATION_AUDIT.resourceType}`.inlineParams()),
  ]);
}

/**
 * Projects real committed worker effects, separate from delivery outcomes and command ledgers.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createWorkerRunsTable({ tables }: AdmissionTableContext) {
  return pgTable(ADMISSION_WORKER_RUN_DATABASE.tableName, {
    runId: uuid("run_id").notNull(), tribeId: uuid("tribe_id").notNull(), operation: text("operation").$type<AdmissionMetricRunOperation>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(), finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(), processed: integer("processed").notNull(),
  }, (table): PgTableExtraConfigValue[] => [
    primaryKey({ name: ADMISSION_WORKER_RUN_DATABASE.primaryKey, columns: [table.runId, table.tribeId, table.operation] }),
    foreignKey({ name: ADMISSION_WORKER_RUN_DATABASE.tribeForeignKey, columns: [table.tribeId], foreignColumns: [tables().tribeNamespaces.tribeId] }),
    check(ADMISSION_WORKER_RUN_DATABASE.operationCheck, sql`${table.operation} in (${sql.join(Object.values(ADMISSION_METRIC_RUN_OPERATION).map((operation) => sql`${operation}`), sql`, `)})`.inlineParams()),
    check(ADMISSION_WORKER_RUN_DATABASE.processedCheck, sql`${table.processed}>0`),
    check(ADMISSION_WORKER_RUN_DATABASE.timeCheck, sql`${table.finishedAt}>=${table.startedAt}`),
    index(ADMISSION_WORKER_RUN_DATABASE.historyIndex).on(table.tribeId, table.finishedAt.desc()),
  ]);
}

/**
 * Projects the `academy_admission_notification_obligations` table.
 * @param context - Shared parents and sibling admission tables, read lazily.
 * @returns The table definition, before RLS is enabled.
 */
function createNotificationObligationsTable({ parents, tables }: AdmissionTableContext) {
  return pgTable("academy_admission_notification_obligations", {
    id: uuid("id").defaultRandom().primaryKey(), tribeId: uuid("tribe_id").notNull(), requestId: uuid("request_id").notNull(), applicantUserId: text("applicant_user_id").notNull(), eventType: text("event_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`), materializedAt: timestamp("materialized_at", { withTimezone: true }),
  }, (table): PgTableExtraConfigValue[] => [
    parentReference("admission_obligation_tribe_fkey",table.tribeId,parents.tribes.id), parentReference("admission_obligation_applicant_fkey",table.applicantUserId,parents.users.id),
    unique("admission_obligation_event_key").on(table.requestId,table.eventType), check("admission_obligation_event_check", sql`${table.eventType} in ('pending_created','approved','rejected','cancelled','expired','reminder')`),
    unique("admission_obligation_tenant_key").on(table.id,table.tribeId),
    index(ADMISSION_NOTIFICATION_SOURCE_POSITION_INDEX).on(table.tribeId,table.createdAt,table.id),
    foreignKey({ name: "admission_obligation_request_fkey", columns: [table.requestId,table.tribeId,table.applicantUserId], foreignColumns: [tables().requests.id,tables().requests.tribeId,tables().requests.userId] }).onDelete("cascade"),
  ]);
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
  const composed: { references?: AdmissionTableReferences } = {};
  const context: AdmissionTableContext = { parents, tables: () => readComposedReferences(composed.references) };
  const tribeNamespaces = createTribeNamespacesTable();
  const retiredBindings = createRetiredBindingsTable(context);
  const retiredOperations = createRetiredOperationsTable(context);
  const retiredAuditEvents = createRetiredAuditEventsTable(context);
  const policies = createPoliciesTable(context);
  const allowlistEntries = createAllowlistEntriesTable(context);
  const personalInvitations = createPersonalInvitationsTable(context);
  const challenges = createChallengesTable(context);
  const proofs = createProofsTable(context);
  const requests = createRequestsTable(context);
  const bindings = createBindingsTable(context);
  const decisions = createDecisionsTable(context);
  const operations = createOperationsTable(context);
  const imports = createImportsTable(context);
  const importRows = createImportRowsTable(context);
  const auditEvents = createAuditEventsTable(context);
  const workerRuns = createWorkerRunsTable(context);
  const notificationObligations = createNotificationObligationsTable(context);
  composed.references = { tribeNamespaces, retiredOperations, allowlistEntries, personalInvitations, challenges, proofs, requests, bindings, decisions, operations, imports };
  return {
    tribeNamespaces: tribeNamespaces.enableRLS(),
    retiredBindings: retiredBindings.enableRLS(), retiredOperations: retiredOperations.enableRLS(), retiredAuditEvents: retiredAuditEvents.enableRLS(),
    policies: policies.enableRLS(), allowlistEntries: allowlistEntries.enableRLS(), personalInvitations: personalInvitations.enableRLS(), challenges: challenges.enableRLS(),
    proofs: proofs.enableRLS(), requests: requests.enableRLS(), bindings: bindings.enableRLS(), decisions: decisions.enableRLS(), operations: operations.enableRLS(),
    imports: imports.enableRLS(), importRows: importRows.enableRLS(), auditEvents: auditEvents.enableRLS(), workerRuns: workerRuns.enableRLS(), notificationObligations: notificationObligations.enableRLS(),
  };
}
