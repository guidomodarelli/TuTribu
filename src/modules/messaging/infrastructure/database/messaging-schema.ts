/** Projects versioned messaging SQL; migrations own deferred FKs, grants, FORCE RLS and triggers. */
import { sql } from "drizzle-orm";
import { CODE_REQUEST_EVENT } from "@/src/modules/messaging/constants/code-request-budget";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { boolean, check, customType, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn, PgTableExtraConfig } from "drizzle-orm/pg-core";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { MESSAGING_DEFAULT_CONNECTION_NAME } from "@/src/modules/messaging/constants/messaging-connection";

type MessagingSchemaParents = {
  tribes: { id: AnyPgColumn };
  user: { id: AnyPgColumn };
  contactVerificationChallenges: { id: AnyPgColumn; tribeId: AnyPgColumn; userId: AnyPgColumn };
};

/** Maps the binary driver value without validating backend rows. */
const binaryData = customType<{data:Uint8Array;driverData:Buffer}>({dataType:()=>"bytea",toDriver:(value)=>Buffer.from(value),fromDriver:(value)=>new Uint8Array(value)});

/**
 * Composes messaging-owned projections with explicit existing parents.
 * @param parents - Existing tenant/account/challenge tables, without reading data.
 * @returns Private table definitions; schema projection never grants resource authority.
 */
export function createMessagingSchema(parents: MessagingSchemaParents) {
  const messagingUsagePolicies = pgTable("messaging_usage_policies", {
    tribeId: uuid("tribe_id").primaryKey(),
    verificationDailyLimit: integer("verification_daily_limit").notNull().default(MESSAGING_USAGE_LIMIT.verificationDailyDefault),
    notificationDailyLimit: integer("notification_daily_limit").notNull().default(MESSAGING_USAGE_LIMIT.notificationDailyDefault),
    allowedCountries: text("allowed_countries").array().notNull().default(sql.raw("'{}'")),
    platformVerificationDailyMaximum: integer("platform_verification_daily_maximum").notNull().default(MESSAGING_USAGE_LIMIT.verificationDailyMaximum),
    platformNotificationDailyMaximum: integer("platform_notification_daily_maximum").notNull().default(MESSAGING_USAGE_LIMIT.notificationDailyMaximum),
    version: integer("version").notNull().default(1),
    changedByUserId: text("changed_by_user_id"),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
  }, (table): PgTableExtraConfig => ({
    messagingUsageTribeFkey: foreignKey({name:"messaging_usage_tribe_fkey",columns:[table.tribeId],foreignColumns:[parents.tribes.id]}).onDelete("cascade"),
    messagingUsageVerificationLimitCheck: check("messaging_usage_verification_limit_check",sql.raw("verification_daily_limit BETWEEN 0 AND 1000")),
    messagingUsageNotificationLimitCheck: check("messaging_usage_notification_limit_check",sql.raw("notification_daily_limit BETWEEN 0 AND 5000")),
    messagingUsagePlatformVerificationCheck: check("messaging_usage_platform_verification_check",sql.raw("platform_verification_daily_maximum BETWEEN 0 AND 1000")),
    messagingUsagePlatformNotificationCheck: check("messaging_usage_platform_notification_check",sql.raw("platform_notification_daily_maximum BETWEEN 0 AND 5000")),
    messagingUsageVersionCheck: check("messaging_usage_version_check",sql.raw("version>0")),
    messagingUsageChangerFkey: foreignKey({name:"messaging_usage_changer_fkey",columns:[table.changedByUserId],foreignColumns:[parents.user.id]}).onDelete("set null"),
    messagingUsageCountriesCheck: check("messaging_usage_countries_check",sql.raw("public.messaging_country_set_is_normalized(allowed_countries)")),
    messagingUsagePlatformCeilingCheck: check("messaging_usage_platform_ceiling_check",sql.raw("verification_daily_limit<=platform_verification_daily_maximum AND notification_daily_limit<=platform_notification_daily_maximum")),
  }));
  const tenantMessagingConnections = pgTable("tenant_messaging_connections", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().default(MESSAGING_DEFAULT_CONNECTION_NAME),
    tribeId: uuid("tribe_id").notNull(),
    provider: text("provider").notNull().default("zavu"),
    contributedByUserId: text("contributed_by_user_id"),
    state: text("state").notNull().default("draft"),
    stateReason: text("state_reason"),
    environment: text("environment").notNull(),
    securityEpoch: text("security_epoch").notNull(),
    isSelected: boolean("is_selected").notNull().default(false),
    isCandidate: boolean("is_candidate").notNull().default(true),
    selectedVersion: integer("selected_version"),
    candidateVersion: integer("candidate_version"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    retiredAt: timestamp("retired_at",{withTimezone:true}),
  }, (table): PgTableExtraConfig => ({
    messagingConnectionTribeFkey: foreignKey({name:"messaging_connection_tribe_fkey",columns:[table.tribeId],foreignColumns:[parents.tribes.id]}).onDelete("cascade"),
    messagingConnectionProviderCheck: check("messaging_connection_provider_check",sql.raw("provider='zavu'")),
    messagingConnectionContributorFkey: foreignKey({name:"messaging_connection_contributor_fkey",columns:[table.contributedByUserId],foreignColumns:[parents.user.id]}).onDelete("set null"),
    messagingConnectionStateCheck: check("messaging_connection_state_check",sql.raw("state IN ('draft','ready','active','degraded','suspended','disconnected')")),
    messagingConnectionVersionCheck: check("messaging_connection_version_check",sql.raw("version>0")),
    messagingConnectionScopeKey: unique("messaging_connection_scope_key").on(table.id,table.tribeId),
    messagingConnectionEnvironmentScopeKey: unique("messaging_connection_environment_scope_key").on(table.id,table.tribeId,table.environment,table.securityEpoch),
    messagingConnectionSelectedVersionCheck: check("messaging_connection_selected_version_check",sql.raw("selected_version IS NULL OR selected_version>0")),
    messagingConnectionCandidateVersionCheck: check("messaging_connection_candidate_version_check",sql.raw("candidate_version IS NULL OR candidate_version>0")),
    messagingSelectedVersionFkey: foreignKey({name:"messaging_selected_version_fkey",columns:[table.id,table.tribeId,table.selectedVersion],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version]}),
    messagingCandidateVersionFkey: foreignKey({name:"messaging_candidate_version_fkey",columns:[table.id,table.tribeId,table.candidateVersion],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version]}),
    messagingConnectionSelectedKey: uniqueIndex("messaging_connection_selected_key").on(table.tribeId).where(sql.raw("is_selected")),
    messagingConnectionNameCheck: check("messaging_connection_name_check",sql.raw("char_length(btrim(name)) BETWEEN 1 AND 100")),
    messagingConnectionCandidateKey: uniqueIndex("messaging_connection_candidate_key").on(table.tribeId).where(sql.raw("is_candidate")),
  }));
  const messagingConnectionVersions = pgTable("messaging_connection_versions", {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull(),
    tribeId: uuid("tribe_id").notNull(),
    version: integer("version").notNull(),
    environment: text("environment").notNull(),
    securityEpoch: text("security_epoch").notNull(),
    secretRef: uuid("secret_ref"),
    emailSenderId: text("email_sender_id"),
    smsSenderId: text("sms_sender_id"),
    whatsappSenderId: text("whatsapp_sender_id"),
    whatsappTemplateId: text("whatsapp_template_id"),
    whatsappTemplateLanguage: text("whatsapp_template_language"),
    credentialValidationStatus: text("credential_validation_status").notNull().default("not_validated"),
    credentialValidatedAt: timestamp("credential_validated_at",{withTimezone:true}),
    isTestMode: boolean("is_test_mode"),
    providerProjectRef: text("provider_project_ref"),
    providerTeamRef: text("provider_team_ref"),
    providerKeyRef: text("provider_key_ref"),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    lastActivityAt: timestamp("last_activity_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    retiredAt: timestamp("retired_at",{withTimezone:true}),
    purgeAfter: timestamp("purge_after",{withTimezone:true}),
  }, (table): PgTableExtraConfig => ({
    messagingResourceVersionCheck: check("messaging_resource_version_check",sql.raw("version>0")),
    messagingCredentialValidationCheck: check("messaging_credential_validation_check",sql.raw("credential_validation_status IN ('not_validated','valid','invalid','unavailable')")),
    messagingVersionScopeKey: unique("messaging_version_scope_key").on(table.connectionId,table.tribeId,table.version),
    messagingVersionEnvironmentScopeKey: unique("messaging_version_environment_scope_key").on(table.connectionId,table.tribeId,table.version,table.environment,table.securityEpoch),
    messagingVersionConnectionFkey: foreignKey({name:"messaging_version_connection_fkey",columns:[table.connectionId,table.tribeId,table.environment,table.securityEpoch],foreignColumns:[tenantMessagingConnections.id,tenantMessagingConnections.tribeId,tenantMessagingConnections.environment,tenantMessagingConnections.securityEpoch]}).onDelete("cascade"),
    messagingVersionSecretFkey: foreignKey({name:"messaging_version_secret_fkey",columns:[table.secretRef,table.tribeId,table.connectionId,table.version,table.environment,table.securityEpoch],foreignColumns:[messagingSecretEnvelopes.secretRef,messagingSecretEnvelopes.tribeId,messagingSecretEnvelopes.connectionId,messagingSecretEnvelopes.connectionVersion,messagingSecretEnvelopes.environment,messagingSecretEnvelopes.securityEpoch]}),
  }));
  const messagingSecretEnvelopes = pgTable("messaging_secret_envelopes", {
    secretRef: uuid("secret_ref").primaryKey().defaultRandom(),
    tribeId: uuid("tribe_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    environment: text("environment").notNull(),
    securityEpoch: text("security_epoch").notNull(),
    purpose: text("purpose").notNull().default("credential"),
    format: integer("format").notNull().default(1),
    keyId: text("key_id").notNull(),
    iv: binaryData("iv"),
    ciphertext: binaryData("ciphertext"),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    retiredAt: timestamp("retired_at",{withTimezone:true}),
    purgeAfter: timestamp("purge_after",{withTimezone:true}),
    purgedAt: timestamp("purged_at",{withTimezone:true}),
  }, (table): PgTableExtraConfig => ({
    messagingSecretPurposeCheck: check("messaging_secret_purpose_check",sql.raw("purpose='credential'")),
    messagingSecretFormatCheck: check("messaging_secret_format_check",sql.raw("format=1")),
    messagingSecretIvCheck: check("messaging_secret_iv_check",sql.raw("octet_length(iv)=12")),
    messagingSecretCiphertextCheck: check("messaging_secret_ciphertext_check",sql.raw("octet_length(ciphertext)>=16")),
    messagingSecretRetirementPurgeCheck: check("messaging_secret_retirement_purge_check",sql.raw("retired_at IS NULL OR (purge_after IS NOT NULL AND purge_after<=retired_at+interval '24 hours')")),
    messagingSecretMaterialLifecycleCheck: check("messaging_secret_material_lifecycle_check",sql.raw("(purged_at IS NULL AND iv IS NOT NULL AND ciphertext IS NOT NULL) OR (purged_at IS NOT NULL AND retired_at IS NOT NULL AND purged_at>=retired_at AND iv IS NULL AND ciphertext IS NULL)")),
    messagingSecretScopeKey: unique("messaging_secret_scope_key").on(table.secretRef,table.tribeId,table.connectionId,table.connectionVersion,table.environment,table.securityEpoch),
    messagingSecretVersionFkey: foreignKey({name:"messaging_secret_version_fkey",columns:[table.connectionId,table.tribeId,table.connectionVersion,table.environment,table.securityEpoch],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version,messagingConnectionVersions.environment,messagingConnectionVersions.securityEpoch]}).onDelete("cascade"),
  }));
  const messagingConnectionCapabilities = pgTable("messaging_connection_capabilities", {
    id: uuid("id").primaryKey().defaultRandom(),
    tribeId: uuid("tribe_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    channel: text("channel").notNull(),
    senderId: text("sender_id").notNull(),
    templateId: text("template_id"),
    templateLanguage: text("template_language"),
    state: text("state").notNull().default("unprepared"),
    checkedAt: timestamp("checked_at",{withTimezone:true}),
    testedAt: timestamp("tested_at",{withTimezone:true}),
    platformRestrictions: jsonb("platform_restrictions").notNull().default(sql.raw("'[]'")),
  }, (table): PgTableExtraConfig => ({
    messagingCapabilityChannelCheck: check("messaging_capability_channel_check",sql.raw("channel IN ('email','sms','whatsapp')")),
    messagingCapabilityStateCheck: check("messaging_capability_state_check",sql.raw("state IN ('unprepared','prepared','unavailable')")),
    messagingCapabilityScopeKey: unique("messaging_capability_scope_key").on(table.id,table.tribeId,table.connectionId,table.connectionVersion),
    messagingCapabilityChannelKey: unique("messaging_capability_channel_key").on(table.connectionId,table.connectionVersion,table.channel),
    messagingCapabilityVersionFkey: foreignKey({name:"messaging_capability_version_fkey",columns:[table.connectionId,table.tribeId,table.connectionVersion],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version]}).onDelete("cascade"),
    messagingCapabilityWhatsappCheck: check("messaging_capability_whatsapp_check",sql.raw("channel<>'whatsapp' OR (template_id IS NOT NULL AND template_language IS NOT NULL)")),
    messagingCapabilityPreparedCheck: check("messaging_capability_prepared_check",sql.raw("state<>'prepared' OR (checked_at IS NOT NULL AND tested_at IS NOT NULL)")),
  }));
  const messagingConnectionDiagnostics = pgTable("messaging_connection_diagnostics", {
    id: uuid("id").primaryKey().defaultRandom(),
    tribeId: uuid("tribe_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    leaderUserId: text("leader_user_id"),
    challengeId: uuid("challenge_id").notNull(),
    channel: text("channel").notNull(),
    senderId: text("sender_id").notNull(),
    templateId: text("template_id"),
    templateLanguage: text("template_language"),
    outcome: text("outcome").notNull().default("pending"),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    validatedAt: timestamp("validated_at",{withTimezone:true}),
  }, (table): PgTableExtraConfig => ({
    messagingDiagnosticLeaderFkey: foreignKey({name:"messaging_diagnostic_leader_fkey",columns:[table.leaderUserId],foreignColumns:[parents.user.id]}).onDelete("set null"),
    messagingConnectionDiagnosticsChallengeIdKey: unique("messaging_connection_diagnostics_challenge_id_key").on(table.challengeId),
    messagingDiagnosticChannelCheck: check("messaging_diagnostic_channel_check",sql.raw("channel IN ('email','sms','whatsapp')")),
    messagingDiagnosticOutcomeCheck: check("messaging_diagnostic_outcome_check",sql.raw("outcome IN ('pending','verified','failed','expired','invalidated')")),
    messagingDiagnosticVersionFkey: foreignKey({name:"messaging_diagnostic_version_fkey",columns:[table.connectionId,table.tribeId,table.connectionVersion],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version]}),
    messagingDiagnosticChallengeFkey: foreignKey({name:"messaging_diagnostic_challenge_fkey",columns:[table.challengeId,table.tribeId,table.leaderUserId],foreignColumns:[parents.contactVerificationChallenges.id,parents.contactVerificationChallenges.tribeId,parents.contactVerificationChallenges.userId]}),
  }));
  const messagingContactBudgetSubjects = pgTable("messaging_contact_budget_subjects", {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
  }, (): PgTableExtraConfig => ({

  }));
  const messagingContactFingerprintAliases = pgTable("messaging_contact_fingerprint_aliases", {
    subjectId: uuid("subject_id").notNull(),
    fingerprintKeyId: text("fingerprint_key_id").notNull(),
    contactFingerprint: binaryData("contact_fingerprint").notNull(),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
  }, (table): PgTableExtraConfig => ({
    messagingContactAliasSubjectFkey: foreignKey({name:"messaging_contact_alias_subject_fkey",columns:[table.subjectId],foreignColumns:[messagingContactBudgetSubjects.id]}).onDelete("restrict"),
    messagingContactFingerprintAliasesPkey: primaryKey({name:"messaging_contact_fingerprint_aliases_pkey",columns:[table.fingerprintKeyId,table.contactFingerprint]}),
    messagingContactAliasSubjectKeyIdx: index("messaging_contact_alias_subject_key_idx").on(table.subjectId,table.fingerprintKeyId),
  }));
  const messageDeliveries = pgTable("message_deliveries", {
    id: uuid("id").primaryKey().defaultRandom(),
    tribeId: uuid("tribe_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    environment: text("environment").notNull(),
    securityEpoch: text("security_epoch").notNull(),
    purpose: text("purpose").notNull(),
    sourceResourceId: uuid("source_resource_id").notNull(),
    actorUserId: text("actor_user_id"),
    contactSubjectId: uuid("contact_subject_id"),
    recipientRef: text("recipient_ref").notNull(),
    recipientCountry: text("recipient_country"),
    channel: text("channel").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    payloadFingerprint: binaryData("payload_fingerprint").notNull(),
    payloadMacKeyId: text("payload_mac_key_id").notNull(),
    frozenIntent: jsonb("frozen_intent").notNull(),
    state: text("state").notNull().default("queued"),
    queuedUsagePolicyVersion: integer("queued_usage_policy_version").notNull(),
    dueAt: timestamp("due_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    deadlineAt: timestamp("deadline_at",{withTimezone:true}).notNull(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until",{withTimezone:true}),
    version: integer("version").notNull().default(1),
    lastOutcome: text("last_outcome"),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
  }, (table): PgTableExtraConfig => ({
    messagingDeliveryPurposeCheck: check("messaging_delivery_purpose_check",sql.raw("purpose IN ('admission','connection_diagnostic','admission_notification')")),
    messagingDeliveryActorFkey: foreignKey({name:"messaging_delivery_actor_fkey",columns:[table.actorUserId],foreignColumns:[parents.user.id]}).onDelete("set null"),
    messagingDeliverySubjectFkey: foreignKey({name:"messaging_delivery_subject_fkey",columns:[table.contactSubjectId],foreignColumns:[messagingContactBudgetSubjects.id]}),
    messagingDeliveryChannelCheck: check("messaging_delivery_channel_check",sql.raw("channel IN ('email','sms','whatsapp')")),
    messagingDeliveryStateCheck: check("messaging_delivery_state_check",sql.raw("state IN ('queued','accepted','delivered','failed','unknown','suppressed','cancelled')")),
    messagingDeliveryUsageVersionCheck: check("messaging_delivery_usage_version_check",sql.raw("queued_usage_policy_version>0")),
    messagingDeliveryVersionCheck: check("messaging_delivery_version_check",sql.raw("version>0")),
    messagingDeliveryScopeKey: unique("messaging_delivery_scope_key").on(table.id,table.tribeId,table.connectionId,table.connectionVersion),
    messagingDeliveryLogicalKey: unique("messaging_delivery_logical_key").on(table.tribeId,table.purpose,table.sourceResourceId,table.recipientRef),
    messagingDeliveryIdempotencyKey: unique("messaging_delivery_idempotency_key").on(table.connectionId,table.idempotencyKey),
    messagingDeliveryVersionFkey: foreignKey({name:"messaging_delivery_version_fkey",columns:[table.connectionId,table.tribeId,table.connectionVersion,table.environment,table.securityEpoch],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version,messagingConnectionVersions.environment,messagingConnectionVersions.securityEpoch]}),
    messagingDeliveryLeaseCheck: check("messaging_delivery_lease_check",sql.raw("(lease_token IS NULL)=(lease_until IS NULL)")),
    messagingDeliveryPhoneCountryCheck: check("messaging_delivery_phone_country_check",sql.raw("channel='email' OR (recipient_country IS NOT NULL AND recipient_country ~ '^[A-Z]{2}$')")),
    messagingDeliveryDeadlineCheck: check("messaging_delivery_deadline_check",sql.raw("deadline_at>created_at AND deadline_at<=created_at+interval '24 hours'")),
    messagingDeliveryDueIdx: index("messaging_delivery_due_idx").on(table.dueAt,table.id).where(sql.raw("state='queued'")),
    messagingDeliveryTenantDueIdx: index("messaging_delivery_tenant_due_idx").on(table.tribeId,table.dueAt,table.id).where(sql.raw("state='queued'")),
  }));
  const verificationCodeEnvelopes = pgTable("verification_code_envelopes", {
    id: uuid("id").primaryKey().defaultRandom(),
    tribeId: uuid("tribe_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    challengeId: uuid("challenge_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    environment: text("environment").notNull(),
    securityEpoch: text("security_epoch").notNull(),
    purpose: text("purpose").notNull().default("otp_envelope"),
    format: integer("format").notNull().default(1),
    keyId: text("key_id").notNull(),
    iv: binaryData("iv").notNull(),
    ciphertext: binaryData("ciphertext").notNull(),
    createdAt: timestamp("created_at",{withTimezone:true}).notNull(),
    expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(),
  }, (table): PgTableExtraConfig => ({
    verificationCodeEnvelopesChallengeIdKey: unique("verification_code_envelopes_challenge_id_key").on(table.challengeId),
    verificationCodeEnvelopesDeliveryIdKey: unique("verification_code_envelopes_delivery_id_key").on(table.deliveryId),
    messagingOtpPurposeCheck: check("messaging_otp_purpose_check",sql.raw("purpose='otp_envelope'")),
    messagingOtpFormatCheck: check("messaging_otp_format_check",sql.raw("format=1")),
    messagingOtpIvCheck: check("messaging_otp_iv_check",sql.raw("octet_length(iv)=12")),
    messagingOtpCiphertextCheck: check("messaging_otp_ciphertext_check",sql.raw("octet_length(ciphertext)>=16")),
    messagingOtpScopeKey: unique("messaging_otp_scope_key").on(table.id,table.tribeId,table.connectionId,table.connectionVersion),
    messagingOtpExactSourceKey: unique("messaging_otp_exact_source_key").on(table.id,table.challengeId,table.deliveryId,table.tribeId,table.connectionId,table.connectionVersion),
    messagingOtpChallengeFkey: foreignKey({name:"messaging_otp_challenge_fkey",columns:[table.challengeId,table.tribeId],foreignColumns:[parents.contactVerificationChallenges.id,parents.contactVerificationChallenges.tribeId]}),
    messagingOtpDeliveryFkey: foreignKey({name:"messaging_otp_delivery_fkey",columns:[table.deliveryId,table.tribeId,table.connectionId,table.connectionVersion],foreignColumns:[messageDeliveries.id,messageDeliveries.tribeId,messageDeliveries.connectionId,messageDeliveries.connectionVersion]}).onDelete("cascade"),
    messagingOtpVersionFkey: foreignKey({name:"messaging_otp_version_fkey",columns:[table.connectionId,table.tribeId,table.connectionVersion,table.environment,table.securityEpoch],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version,messagingConnectionVersions.environment,messagingConnectionVersions.securityEpoch]}),
    messagingOtpExpiryCheck: check("messaging_otp_expiry_check",sql.raw("expires_at>created_at AND expires_at<=created_at+interval '10 minutes'")),
  }));
  const messageDeliveryAttempts = pgTable("message_delivery_attempts", {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id").notNull(),
    tribeId: uuid("tribe_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    sequence: integer("sequence").notNull(),
    reservationId: uuid("reservation_id").notNull(),
    leaseToken: uuid("lease_token").notNull(),
    sendAuthorizedAt: timestamp("send_authorized_at",{withTimezone:true}).notNull(),
    authorizedUsagePolicyVersion: integer("authorized_usage_policy_version").notNull(),
    recipientCountry: text("recipient_country"),
    state: text("state").notNull().default("in_flight"),
    completedAt: timestamp("completed_at",{withTimezone:true}),
    correlationId: text("correlation_id"),
    providerMessageId: text("provider_message_id"),
    safeReason: text("safe_reason"),
    version: integer("version").notNull().default(1),
  }, (table): PgTableExtraConfig => ({
    messagingAttemptSequenceCheck: check("messaging_attempt_sequence_check",sql.raw("sequence>0")),
    messageDeliveryAttemptsReservationIdKey: unique("message_delivery_attempts_reservation_id_key").on(table.reservationId),
    messagingAttemptUsageVersionCheck: check("messaging_attempt_usage_version_check",sql.raw("authorized_usage_policy_version>0")),
    messagingAttemptStateCheck: check("messaging_attempt_state_check",sql.raw("state IN ('in_flight','accepted','delivered','rejected','unknown')")),
    messagingAttemptVersionCheck: check("messaging_attempt_version_check",sql.raw("version>0")),
    messagingAttemptScopeKey: unique("messaging_attempt_scope_key").on(table.id,table.tribeId,table.deliveryId),
    messagingAttemptSequenceKey: unique("messaging_attempt_sequence_key").on(table.deliveryId,table.sequence),
    messagingAttemptDeliveryFkey: foreignKey({name:"messaging_attempt_delivery_fkey",columns:[table.deliveryId,table.tribeId,table.connectionId,table.connectionVersion],foreignColumns:[messageDeliveries.id,messageDeliveries.tribeId,messageDeliveries.connectionId,messageDeliveries.connectionVersion]}),
    messagingAttemptReservationFkey: foreignKey({name:"messaging_attempt_reservation_fkey",columns:[table.reservationId,table.tribeId,table.id],foreignColumns:[messagingUsageReservations.id,messagingUsageReservations.tribeId,messagingUsageReservations.attemptId]}),
    messagingAttemptUnresolvedKey: uniqueIndex("messaging_attempt_unresolved_key").on(table.deliveryId).where(sql.raw("state IN ('in_flight','unknown','accepted','delivered')")),
    messagingAttemptProviderMessageKey: uniqueIndex("messaging_attempt_provider_message_key").on(table.connectionId,table.providerMessageId).where(sql.raw("provider_message_id IS NOT NULL")),
  }));
  const messagingUsageReservations = pgTable("messaging_usage_reservations", {
    id: uuid("id").primaryKey().defaultRandom(),
    tribeId: uuid("tribe_id").notNull(),
    attemptId: uuid("attempt_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    category: text("category").notNull(),
    state: text("state").notNull().default("consumed"),
    reservedAt: timestamp("reserved_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
    releasedAt: timestamp("released_at",{withTimezone:true}),
    absenceEvidence: text("absence_evidence"),
  }, (table): PgTableExtraConfig => ({
    messagingUsageReservationsAttemptIdKey: unique("messaging_usage_reservations_attempt_id_key").on(table.attemptId),
    messagingReservationCategoryCheck: check("messaging_reservation_category_check",sql.raw("category IN ('verification','notification')")),
    messagingReservationStateCheck: check("messaging_reservation_state_check",sql.raw("state IN ('consumed','released')")),
    messagingReservationScopeKey: unique("messaging_reservation_scope_key").on(table.id,table.tribeId,table.attemptId),
    messagingReservationAttemptFkey: foreignKey({name:"messaging_reservation_attempt_fkey",columns:[table.attemptId,table.tribeId,table.deliveryId],foreignColumns:[messageDeliveryAttempts.id,messageDeliveryAttempts.tribeId,messageDeliveryAttempts.deliveryId]}),
    messagingReservationPolicyFkey: foreignKey({name:"messaging_reservation_policy_fkey",columns:[table.tribeId],foreignColumns:[messagingUsagePolicies.tribeId]}),
    messagingReservationReleaseCheck: check("messaging_reservation_release_check",sql.raw("(state='consumed' AND released_at IS NULL AND absence_evidence IS NULL) OR (state='released' AND released_at IS NOT NULL AND absence_evidence IS NOT NULL AND btrim(absence_evidence)<>'')")),
    messagingReservationConsumptionIdx: index("messaging_reservation_consumption_idx").on(table.tribeId,table.category,table.reservedAt).where(sql.raw("state='consumed'")),
  }));
  const messagingUsageEvents = pgTable("messaging_usage_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    tribeId: uuid("tribe_id").notNull(),
    actorUserId: text("actor_user_id"),
    contactSubjectId: uuid("contact_subject_id"),
    challengeId: uuid("challenge_id"),
    purpose: text("purpose").notNull(),
    channel: text("channel"),
    eventType: text("event_type").notNull(),
    operationId: uuid("operation_id").notNull(),
    credentialConnectionId: uuid("credential_connection_id"),
    credentialConnectionVersion: integer("credential_connection_version"),
    occurredAt: timestamp("occurred_at",{withTimezone:true}).notNull().default(sql.raw("clock_timestamp()")),
  }, (table): PgTableExtraConfig => ({
    messagingUsageEventTribeFkey: foreignKey({name:"messaging_usage_event_tribe_fkey",columns:[table.tribeId],foreignColumns:[parents.tribes.id]}).onDelete("cascade"),
    messagingUsageEventActorFkey: foreignKey({name:"messaging_usage_event_actor_fkey",columns:[table.actorUserId],foreignColumns:[parents.user.id]}).onDelete("set null"),
    messagingUsageEventSubjectFkey: foreignKey({name:"messaging_usage_event_subject_fkey",columns:[table.contactSubjectId],foreignColumns:[messagingContactBudgetSubjects.id]}),
    messagingUsageEventTypeCheck: check("messaging_usage_event_type_check",sql.raw("event_type IN ('code_request','code_failure','diagnostic_request','credential_validation')")),
    messagingUsageEventOperationKey: unique("messaging_usage_event_operation_key").on(table.eventType,table.operationId),
    messagingUsageCredentialVersionFkey: foreignKey({ name:"messaging_usage_credential_version_fkey",columns:[table.credentialConnectionId,table.tribeId,table.credentialConnectionVersion],foreignColumns:[messagingConnectionVersions.connectionId,messagingConnectionVersions.tribeId,messagingConnectionVersions.version] }).onDelete("restrict"),
    messagingUsageCredentialScopeCheck: check("messaging_usage_credential_scope_check",sql`
      (${table.eventType}=${CODE_REQUEST_EVENT.credential} and (
        (${table.credentialConnectionId} is null and ${table.credentialConnectionVersion} is null)
        or (${table.credentialConnectionId} is not null and ${table.credentialConnectionVersion} is not null
          and ${table.credentialConnectionVersion}>0
          and ${table.purpose}=${REAUTHENTICATION_OPERATION.validateMessagingConnection} and ${table.channel} is null
          and ${table.challengeId} is null and ${table.contactSubjectId} is null)
      ))
      or (${table.eventType}<>${CODE_REQUEST_EVENT.credential} and ${table.credentialConnectionId} is null and ${table.credentialConnectionVersion} is null)
    `.inlineParams()),
    messagingUsageCredentialWindowIdx: index("messaging_usage_credential_window_idx").on(table.tribeId,table.occurredAt).where(sql`${table.eventType}=${CODE_REQUEST_EVENT.credential}`.inlineParams()),
    messagingUsageAccountWindowIdx: index("messaging_usage_account_window_idx").on(table.actorUserId,table.eventType,table.occurredAt),
    messagingUsageContactWindowIdx: index("messaging_usage_contact_window_idx").on(table.contactSubjectId,table.eventType,table.occurredAt),
    messagingUsageActiveContactIdx: index("messaging_usage_active_contact_idx").on(table.eventType,table.occurredAt,table.contactSubjectId).where(sql`${table.contactSubjectId} is not null`),
    messagingUsageTribeWindowIdx: index("messaging_usage_tribe_window_idx").on(table.tribeId,table.eventType,table.channel,table.occurredAt),
  }));
  return {
    messagingUsagePolicies: messagingUsagePolicies.enableRLS(),
    tenantMessagingConnections: tenantMessagingConnections.enableRLS(),
    messagingConnectionVersions: messagingConnectionVersions.enableRLS(),
    messagingSecretEnvelopes: messagingSecretEnvelopes.enableRLS(),
    messagingConnectionCapabilities: messagingConnectionCapabilities.enableRLS(),
    messagingConnectionDiagnostics: messagingConnectionDiagnostics.enableRLS(),
    messagingContactBudgetSubjects: messagingContactBudgetSubjects.enableRLS(),
    messagingContactFingerprintAliases: messagingContactFingerprintAliases.enableRLS(),
    messageDeliveries: messageDeliveries.enableRLS(),
    verificationCodeEnvelopes: verificationCodeEnvelopes.enableRLS(),
    messageDeliveryAttempts: messageDeliveryAttempts.enableRLS(),
    messagingUsageReservations: messagingUsageReservations.enableRLS(),
    messagingUsageEvents: messagingUsageEvents.enableRLS(),
  };
}
