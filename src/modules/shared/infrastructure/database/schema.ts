import { sql } from "drizzle-orm";
import { createAdmissionSchema, type AdmissionMessagingSchemaReferences } from "@/src/modules/academy-admissions/infrastructure/database/admission-schema";
import { createMessagingSchema } from "@/src/modules/messaging/infrastructure/database/messaging-schema";
import {
  bigint,
  boolean,
  customType,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const UTC_NOW_SQL = sql`timezone('utc', now())`;
/** Maps the driver's binary value without schema-validating PostgreSQL rows. */
const binaryData = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
}, (table) => ({
  emailKey: uniqueIndex("user_email_key").on(table.email),
}));

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
}, (table) => ({
  tokenKey: uniqueIndex("session_token_key").on(table.token),
  userIdIndex: index("idx_session_user_id").on(table.userId),
  userScopeKey: uniqueIndex("session_user_scope_key").on(table.id, table.userId),
}));

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
}, (table) => ({
  userIdIndex: index("idx_account_user_id").on(table.userId),
  identityScopeKey: uniqueIndex("account_identity_scope_key").on(table.id, table.userId, table.providerId, table.accountId),
  subjectUserKey: uniqueIndex("account_subject_user_key").on(table.id, table.userId, table.accountId),
}));

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
}, (table) => ({
  identifierIndex: index("idx_verification_identifier").on(table.identifier),
}));

/** Private verified captures; no additional OAuth token or full provider profile is persisted. */
export const globalIdentityEvidence = pgTable("global_identity_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(), providerSubject: text("provider_subject").notNull(),
  normalizedEmail: text("normalized_email").notNull(), emailVerifiedClaim: boolean("email_verified_claim").notNull(), hostedDomain: text("hosted_domain"),
  classification: text("classification").notNull(), issuer: text("issuer").notNull(), audience: text("audience").notNull(),
  tokenIssuedAt: timestamp("token_issued_at", { withTimezone: true }).notNull(), tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(), version: integer("version").notNull().default(1),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }), invalidationReason: text("invalidation_reason"),
}, (table) => ({
  userForeignKey: foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "global_identity_user_fkey" }).onDelete("cascade"),
  accountScopeForeignKey: foreignKey({ columns: [table.accountId,table.userId,table.providerId,table.providerSubject], foreignColumns: [accounts.id,accounts.userId,accounts.providerId,accounts.accountId], name: "global_identity_account_scope_fkey" }).onDelete("cascade"),
  currentAccountKey: uniqueIndex("global_identity_current_account_key").on(table.accountId,table.providerId).where(sql`${table.invalidatedAt} is null`),
  historyIndex: index("global_identity_user_history_idx").on(table.userId,table.verifiedAt.desc()),
  userScopeKey: uniqueIndex("global_identity_evidence_user_key").on(table.id,table.userId),
  versionCheck: check("global_identity_version_check", sql`${table.version}>0`),
  providerCheck: check("global_identity_provider_check", sql`${table.providerId}='google'`),
  emailCheck: check("global_identity_email_check", sql`${table.normalizedEmail}<>'' and ${table.normalizedEmail}=lower(btrim(${table.normalizedEmail}))`),
  classificationCheck: check("global_identity_classification_check", sql`${table.classification} in ('gmail','workspace','insufficient')`),
  timeCheck: check("global_identity_time_check", sql`${table.tokenExpiresAt}>${table.tokenIssuedAt}`),
  authorityCheck: check("global_identity_authority_check", sql`${table.classification}='insufficient' or (${table.emailVerifiedClaim} and ((${table.classification}='gmail' and ${table.normalizedEmail} like '%@gmail.com') or (${table.classification}='workspace' and ${table.hostedDomain} is not null and btrim(${table.hostedDomain})<>'')))`),
  invalidationCheck: check("global_identity_invalidation_check", sql`(${table.invalidatedAt} is null)=(${table.invalidationReason} is null)`),
}));

/** One-use server authorization intent; only a nonce hash is stored. */
export const globalReauthenticationIntents = pgTable("global_reauthentication_intents", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(),
  originalSessionId: text("original_session_id").notNull(), accountId: text("account_id").notNull(), providerSubject: text("provider_subject").notNull(),
  tribeId: uuid("tribe_id").notNull(), operation: text("operation").notNull(), resourceId: text("resource_id").notNull(), returnPath: text("return_path").notNull(),
  nonceHash: binaryData("nonce_hash"), state: text("state").notNull().default("created"), version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true }),
}, (table) => ({
  userForeignKey: foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "reauthentication_user_fkey" }).onDelete("cascade"),
  tribeForeignKey: foreignKey({ columns: [table.tribeId], foreignColumns: [tribes.id], name: "reauthentication_tribe_fkey" }).onDelete("cascade"),
  sessionForeignKey: foreignKey({ columns: [table.originalSessionId,table.userId], foreignColumns: [sessions.id,sessions.userId], name: "reauthentication_original_session_fkey" }).onDelete("cascade"),
  accountForeignKey: foreignKey({ columns: [table.accountId,table.userId,table.providerSubject], foreignColumns: [accounts.id,accounts.userId,accounts.accountId], name: "reauthentication_account_fkey" }).onDelete("cascade"),
  scopeKey: unique("reauthentication_scope_key").on(table.id,table.userId,table.accountId,table.providerSubject,table.tribeId,table.operation,table.resourceId),
  expiryIndex: index("reauthentication_expiry_idx").on(table.expiresAt).where(sql`${table.state} in ('created','authorizing')`),
  versionCheck: check("reauthentication_version_check", sql`${table.version}>0`),
  operationCheck: check("reauthentication_operation_check", sql`${table.operation}<>''`),
  resourceCheck: check("reauthentication_resource_check", sql`${table.resourceId}<>''`),
  returnPathCheck: check("reauthentication_return_path_check", sql`${table.returnPath} like '/%' and ${table.returnPath} not like '//%' and position(chr(92) in ${table.returnPath})=0 and ${table.returnPath} !~ '[[:cntrl:]]'`),
  stateValuesCheck: check("reauthentication_state_values_check", sql`${table.state} in ('created','authorizing','consumed','expired')`),
  timeCheck: check("reauthentication_time_check", sql`${table.expiresAt}>${table.createdAt}`),
  nonceCheck: check("reauthentication_nonce_check", sql`${table.nonceHash} is null or octet_length(${table.nonceHash})=32`),
  stateCheck: check("reauthentication_state_check", sql`(${table.state}='created' and ${table.nonceHash} is null and ${table.consumedAt} is null) or (${table.state}='authorizing' and ${table.nonceHash} is not null and ${table.consumedAt} is null) or (${table.state}='consumed' and ${table.nonceHash} is not null and ${table.consumedAt} is not null) or (${table.state}='expired' and ${table.consumedAt} is null)`),
}));

/** Operation-scoped signed recency; its window starts at authentication, not callback. */
export const recentAuthenticationEvidence = pgTable("recent_authentication_evidence", {
  id: uuid("id").defaultRandom().primaryKey(), intentId: uuid("intent_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(), providerSubject: text("provider_subject").notNull(), sessionId: text("session_id").notNull(),
  tribeId: uuid("tribe_id").notNull(), operation: text("operation").notNull(), resourceId: text("resource_id").notNull(),
  authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).notNull(), verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(), invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
}, (table) => ({
  userForeignKey: foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "recent_authentication_user_fkey" }).onDelete("cascade"),
  tribeForeignKey: foreignKey({ columns: [table.tribeId], foreignColumns: [tribes.id], name: "recent_authentication_tribe_fkey" }).onDelete("cascade"),
  intentKey: unique("recent_authentication_intent_key").on(table.intentId),
  intentForeignKey: foreignKey({ columns: [table.intentId,table.userId,table.accountId,table.providerSubject,table.tribeId,table.operation,table.resourceId], foreignColumns: [globalReauthenticationIntents.id,globalReauthenticationIntents.userId,globalReauthenticationIntents.accountId,globalReauthenticationIntents.providerSubject,globalReauthenticationIntents.tribeId,globalReauthenticationIntents.operation,globalReauthenticationIntents.resourceId], name: "recent_authentication_scope_fkey" }).onDelete("cascade"),
  sessionForeignKey: foreignKey({ columns: [table.sessionId,table.userId], foreignColumns: [sessions.id,sessions.userId], name: "recent_authentication_session_fkey" }).onDelete("cascade"),
  activeScopeIndex: index("recent_authentication_active_scope_idx").on(table.userId,table.sessionId,table.tribeId,table.operation,table.resourceId,table.validUntil).where(sql`${table.invalidatedAt} is null`),
  windowCheck: check("recent_authentication_window_check", sql`${table.authenticatedAt}<=${table.verifiedAt} and ${table.validUntil}>${table.authenticatedAt} and ${table.validUntil}<=${table.authenticatedAt}+interval '10 minutes'`),
}));

export const tribeCreatorWhitelist = pgTable("tribe_creator_whitelist", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  emailKey: uniqueIndex("tribe_creator_whitelist_email_key").on(table.email),
}));

export const tribes = pgTable("tribes", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  visibility: text("visibility").notNull().default("private"),
  freeJoinIsCurrent: boolean("free_join_is_current")
    .notNull()
    .default(true),
  openFreeJoinEnabled: boolean("open_free_join_enabled")
    .notNull()
    .default(false),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  slugKey: uniqueIndex("tribes_slug_key").on(table.slug),
}));

export const tribeMembers = pgTable("tribe_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull(),
  statusReason: text("status_reason").notNull().default("none"),
  joinedVia: text("joined_via").notNull().default("unknown"),
  joinedViaInvitationId: uuid("joined_via_invitation_id").references(
    () => tribeInvitations.id,
    { onDelete: "set null" }
  ),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  membershipKey: uniqueIndex("tribe_members_tribe_id_user_id_key").on(
    table.tribeId,
    table.userId
  ),
  joinedViaInvitationIndex: index("idx_tribe_members_joined_via_invitation").on(
    table.joinedViaInvitationId
  ),
}));

export const tribeInvitations = pgTable("tribe_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  tokenEncrypted: text("token_encrypted"),
  channel: text("channel"),
  campaignName: text("campaign_name"),
  referrerHandle: text("referrer_handle"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull(),
  subscriptionAssociationType: text("subscription_association_type")
    .notNull()
    .default("current"),
  subscriptionPriceId: uuid("subscription_price_id").references(
    () => tribeSubscriptionPrices.id
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  tokenHashKey: uniqueIndex("tribe_invitations_token_hash_key").on(table.tokenHash),
  admissionScopeKey: uniqueIndex("admission_legacy_invitation_scope_key").on(table.id,table.tribeId),
  tribeStatusIndex: index("idx_tribe_invitations_tribe_status").on(
    table.tribeId,
    table.status
  ),
  subscriptionPriceIndex: index("idx_tribe_invitations_subscription_price_id").on(
    table.subscriptionPriceId
  ),
  tribeChannelIndex: index("idx_tribe_invitations_tribe_channel").on(
    table.tribeId,
    table.channel
  ),
}));

export const tribeWelcomeSettings = pgTable("tribe_welcome_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  welcomeMessage: text("welcome_message")
    .notNull()
    .default(
      "Nos alegra que te sumes. Antes de activar tu acceso, leé los acuerdos y elegí cómo querés empezar."
    ),
  selectionModalTitle: text("selection_modal_title")
    .notNull()
    .default("Elegí cómo querés empezar"),
  selectionModalDescription: text("selection_modal_description")
    .notNull()
    .default(
      "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde."
    ),
  selectionModalBenefit: text("selection_modal_benefit"),
  linksHeading: text("links_heading").notNull().default("Recursos para empezar"),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeKey: uniqueIndex("tribe_welcome_settings_tribe_key").on(table.tribeId),
}));

export const tribeSupportSettings = pgTable("tribe_support_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  phoneNumber: text("phone_number").notNull(),
  message: text("message"),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeKey: uniqueIndex("tribe_support_settings_tribe_key").on(table.tribeId),
}));

export const tribeStorySettings = pgTable("tribe_story_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  websiteUrl: text("website_url"),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeKey: uniqueIndex("tribe_story_settings_tribe_key").on(table.tribeId),
}));

export const tribeStoryMedia = pgTable("tribe_story_media", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  mediaType: text("media_type").notNull(),
  url: text("url"),
  videoProvider: text("video_provider"),
  externalVideoId: text("external_video_id"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeSortIndex: index("idx_tribe_story_media_tribe_sort").on(
    table.tribeId,
    table.sortOrder
  ),
}));

export const tribeImages = pgTable("tribe_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  cloudflareImageId: text("cloudflare_image_id").notNull(),
  deliveryUrl: text("delivery_url").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  cloudflareKey: uniqueIndex("tribe_images_cloudflare_key").on(
    table.cloudflareImageId
  ),
  tribeStatusIndex: index("idx_tribe_images_tribe_status").on(
    table.tribeId,
    table.status
  ),
}));

export const tribeWelcomeRules = pgTable("tribe_welcome_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeSortIndex: index("idx_tribe_welcome_rules_tribe_sort").on(
    table.tribeId,
    table.sortOrder
  ),
}));

export const tribeWelcomeLinks = pgTable("tribe_welcome_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  label: text("label").notNull(),
  badgeLabel: text("badge_label").notNull(),
  url: text("url"),
  phoneNumber: text("phone_number"),
  message: text("message"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeSortIndex: index("idx_tribe_welcome_links_tribe_sort").on(
    table.tribeId,
    table.sortOrder
  ),
}));

export const tribeWelcomeSelections = pgTable("tribe_welcome_selections", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  welcomeLinkId: uuid("welcome_link_id")
    .notNull()
    .references(() => tribeWelcomeLinks.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  selectedAt: timestamp("selected_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  linkUserIndex: index("idx_tribe_welcome_selections_link_user").on(
    table.welcomeLinkId,
    table.userId
  ),
  tribeUserIndex: index("idx_tribe_welcome_selections_tribe_user").on(
    table.tribeId,
    table.userId
  ),
  tribeLinkIndex: index("idx_tribe_welcome_selections_tribe_link").on(
    table.tribeId,
    table.welcomeLinkId
  ),
}));

export const tribeChannels = pgTable("tribe_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  emoji: text("emoji").notNull(),
  sortOrder: integer("sort_order").notNull(),
  accessScope: text("access_scope").notNull().default("tribemates"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeSlugKey: uniqueIndex("tribe_channels_tribe_id_slug_key").on(
    table.tribeId,
    table.slug
  ),
  tribeSortOrderIndex: index("idx_tribe_channels_sort_order").on(
    table.tribeId,
    table.sortOrder
  ),
}));

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => tribeChannels.id),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => ({
  tribeCreatedAtIndex: index("idx_messages_tribe_created_at").on(
    table.tribeId,
    table.createdAt
  ),
}));

export const messageImages = pgTable("message_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => messages.id, {
    onDelete: "set null",
  }),
  deletedMessageId: uuid("deleted_message_id"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cloudflareImageId: text("cloudflare_image_id").notNull(),
  deliveryUrl: text("delivery_url").notNull(),
  status: text("status").notNull().default("draft"),
  altText: text("alt_text").notNull().default(""),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  cloudflareImageKey: uniqueIndex("message_images_cloudflare_image_id_key").on(
    table.cloudflareImageId
  ),
  messageSortKey: uniqueIndex("message_images_message_sort_key").on(
    table.messageId,
    table.sortOrder
  ).where(sql`${table.status} = 'attached'`),
  messageStatusSortIndex: index("idx_message_images_message_status_sort").on(
    table.messageId,
    table.status,
    table.sortOrder
  ),
  tribeUploadedByStatusIndex: index(
    "idx_message_images_tribe_uploaded_by_status"
  ).on(table.tribeId, table.uploadedBy, table.status),
  pendingDeleteIndex: index("idx_message_images_pending_delete")
    .on(table.status, table.updatedAt)
    .where(sql`${table.status} = 'pending_delete'`),
  deletedMessageStatusIndex: index("idx_message_images_deleted_message_status")
    .on(table.deletedMessageId, table.status)
    .where(sql`${table.deletedMessageId} IS NOT NULL`),
}));

/**
 * Decoupled queue of Cloudflare image ids whose owning `message_images` row is
 * about to be removed by a tribe or user `ON DELETE CASCADE`. It carries no
 * foreign keys so it survives that cascade; a scheduled maintenance sweep reads
 * it and deletes each asset from Cloudflare. Triggers, the RLS lockdown, and the
 * sweep functions live in the SQL migration, which is the source of truth.
 */
export const pendingRemoteImageDeletions = pgTable(
  "pending_remote_image_deletions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cloudflareImageId: text("cloudflare_image_id").notNull(),
    origin: text("origin").notNull(),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true })
      .notNull()
      .default(UTC_NOW_SQL),
  },
  (table) => ({
    cloudflareImageKey: uniqueIndex(
      "pending_remote_image_deletions_image_key"
    ).on(table.cloudflareImageId),
    enqueuedAtIndex: index(
      "idx_pending_remote_image_deletions_enqueued_at"
    ).on(table.enqueuedAt),
  })
);

export const messageFiles = pgTable("message_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => messages.id, {
    onDelete: "set null",
  }),
  deletedMessageId: uuid("deleted_message_id"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  storageKeyKey: uniqueIndex("message_files_storage_key_key").on(
    table.storageKey
  ),
  messageSortKey: uniqueIndex("message_files_message_sort_key").on(
    table.messageId,
    table.sortOrder
  ).where(sql`${table.status} = 'attached'`),
  messageStatusSortIndex: index("idx_message_files_message_status_sort").on(
    table.messageId,
    table.status,
    table.sortOrder
  ),
  tribeUploadedByStatusIndex: index(
    "idx_message_files_tribe_uploaded_by_status"
  ).on(table.tribeId, table.uploadedBy, table.status),
  pendingDeleteIndex: index("idx_message_files_pending_delete")
    .on(table.status, table.updatedAt)
    .where(sql`${table.status} = 'pending_delete'`),
  deletedMessageStatusIndex: index("idx_message_files_deleted_message_status")
    .on(table.deletedMessageId, table.status)
    .where(sql`${table.deletedMessageId} IS NOT NULL`),
}));

/**
 * Decoupled queue of R2 storage keys whose owning `message_files` or
 * `course_lesson_files` row is about to be removed by a tribe or user
 * `ON DELETE CASCADE`. It carries no foreign keys so it survives that cascade;
 * the scheduled maintenance sweep reads it and deletes each object from R2.
 * Triggers, the RLS lockdown, and the sweep functions live in the SQL
 * migration, which is the source of truth.
 */
export const pendingRemoteFileDeletions = pgTable(
  "pending_remote_file_deletions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storageKey: text("storage_key").notNull(),
    origin: text("origin").notNull(),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true })
      .notNull()
      .default(UTC_NOW_SQL),
  },
  (table) => ({
    storageKeyKey: uniqueIndex(
      "pending_remote_file_deletions_storage_key_key"
    ).on(table.storageKey),
    enqueuedAtIndex: index(
      "idx_pending_remote_file_deletions_enqueued_at"
    ).on(table.enqueuedAt),
  })
);

export const messageVideos = pgTable("message_videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  externalVideoProvider: text("external_video_provider").notNull(),
  externalVideoId: text("external_video_id").notNull(),
  sortOrder: integer("sort_order").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  thumbnailResolvedAt: timestamp("thumbnail_resolved_at", {
    withTimezone: true,
  }),
  thumbnailAttempts: integer("thumbnail_attempts").notNull().default(0),
  thumbnailLastAttemptAt: timestamp("thumbnail_last_attempt_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  messageSortKey: uniqueIndex("message_videos_message_sort_key").on(
    table.messageId,
    table.sortOrder
  ),
  messageSortIndex: index("idx_message_videos_message_sort").on(
    table.messageId,
    table.sortOrder
  ),
}));

export const messageReplies = pgTable("message_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  messageCreatedAtIndex: index("idx_message_replies_message_created_at").on(
    table.messageId,
    table.createdAt
  ),
}));

export const messageReactions = pgTable("message_reactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  messageTypeIndex: index("idx_message_reactions_message_type").on(table.messageId, table.type),
  reactionKey: uniqueIndex("message_reactions_message_id_user_id_key").on(
    table.messageId,
    table.userId
  ),
}));

export const messagePins = pgTable("message_pins", {
  messageId: uuid("message_id")
    .primaryKey()
    .references(() => messages.id, { onDelete: "cascade" }),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  pinnedBy: text("pinned_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull(),
}, (table) => ({
  tribePinnedAtIndex: index("idx_message_pins_tribe_pinned_at").on(
    table.tribeId,
    table.pinnedAt
  ),
}));

export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  accessRequirement: text("access_requirement").notNull().default("membership"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  courseTribeKey: uniqueIndex("courses_id_tribe_id_key").on(
    table.id,
    table.tribeId
  ),
  tribeSortIndex: index("idx_courses_tribe_sort").on(
    table.tribeId,
    table.sortOrder
  ),
}));

export const courseModules = pgTable("course_modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull(),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull(),
  unlockAfterDays: integer("unlock_after_days"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  moduleTribeKey: uniqueIndex("course_modules_id_tribe_id_key").on(
    table.id,
    table.tribeId
  ),
  tribeSortIndex: index("idx_course_modules_tribe_sort").on(
    table.tribeId,
    table.sortOrder
  ),
  courseTribeForeignKey: foreignKey({
    columns: [table.courseId, table.tribeId],
    foreignColumns: [courses.id, courses.tribeId],
    name: "course_modules_course_tribe_fkey",
  }).onDelete("cascade"),
  courseSortIndex: index("idx_course_modules_course_sort").on(
    table.courseId,
    table.sortOrder
  ),
}));

export const courseLessons = pgTable("course_lessons", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseModuleId: uuid("course_module_id").notNull(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  videoProvider: text("video_provider").notNull(),
  externalVideoId: text("external_video_id").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Occurrence whose recording originated the lesson ("Convertir en
  // lección"). A value pair, not a FK to events: courses stay independent of
  // the events schema. CHECK in 20260927123000_add_course_lesson_event_source.sql.
  sourceEventId: uuid("source_event_id"),
  sourceOccurrenceStartsAt: timestamp("source_occurrence_starts_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  eventSourceIndex: index("idx_course_lessons_event_source")
    .on(table.sourceEventId, table.sourceOccurrenceStartsAt)
    .where(sql`source_event_id IS NOT NULL`),
  moduleTribeForeignKey: foreignKey({
    columns: [table.courseModuleId, table.tribeId],
    foreignColumns: [courseModules.id, courseModules.tribeId],
    name: "course_lessons_module_tribe_fkey",
  }).onDelete("cascade"),
  moduleSortIndex: index("idx_course_lessons_module_sort").on(
    table.courseModuleId,
    table.sortOrder
  ),
  tribeIndex: index("idx_course_lessons_tribe").on(table.tribeId),
}));

export const courseLessonFiles = pgTable("course_lesson_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, {
    onDelete: "set null",
  }),
  deletedLessonId: uuid("deleted_lesson_id"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  storageKeyKey: uniqueIndex("course_lesson_files_storage_key_key").on(
    table.storageKey
  ),
  lessonSortKey: uniqueIndex("course_lesson_files_lesson_sort_key").on(
    table.lessonId,
    table.sortOrder
  ).where(sql`${table.status} = 'attached'`),
  lessonStatusSortIndex: index("idx_course_lesson_files_lesson_status_sort").on(
    table.lessonId,
    table.status,
    table.sortOrder
  ),
  tribeUploadedByStatusIndex: index(
    "idx_course_lesson_files_tribe_uploaded_by_status"
  ).on(table.tribeId, table.uploadedBy, table.status),
  pendingDeleteIndex: index("idx_course_lesson_files_pending_delete")
    .on(table.status, table.updatedAt)
    .where(sql`${table.status} = 'pending_delete'`),
  deletedLessonStatusIndex: index(
    "idx_course_lesson_files_deleted_lesson_status"
  )
    .on(table.deletedLessonId, table.status)
    .where(sql`${table.deletedLessonId} IS NOT NULL`),
}));

export const courseLessonCompletions = pgTable("course_lesson_completions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => courseLessons.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  lessonUserKey: uniqueIndex("course_lesson_completions_lesson_user_key").on(
    table.lessonId,
    table.userId
  ),
  tribeUserIndex: index("idx_course_lesson_completions_tribe_user").on(
    table.tribeId,
    table.userId
  ),
}));

export const courseLastViewedLessons = pgTable("course_last_viewed_lessons", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => courseLessons.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  courseUserKey: uniqueIndex("course_last_viewed_lessons_course_user_key").on(
    table.courseId,
    table.userId
  ),
  tribeUserIndex: index("idx_course_last_viewed_lessons_tribe_user").on(
    table.tribeId,
    table.userId
  ),
}));

export const courseLessonComments = pgTable("course_lesson_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => courseLessons.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  lessonCreatedAtIndex: index("idx_course_lesson_comments_lesson_created_at").on(
    table.lessonId,
    table.createdAt
  ),
}));

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description"),
  meetingUrl: text("meeting_url"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  recurrenceFrequency: text("recurrence_frequency").notNull().default("none"),
  recurrenceUntil: timestamp("recurrence_until", { withTimezone: true }),
  // Seats per occurrence; NULL = unlimited. CHECK (capacity > 0) lives in
  // 20260923120000_add_tribe_event_capacity_waitlist.sql.
  capacity: integer("capacity"),
  // live | workshop | qa | in_person | social. CHECK in
  // 20260924120000_add_tribe_event_type.sql.
  eventType: text("event_type").notNull().default("live"),
  // iCalendar SEQUENCE of the series. Owned by the BEFORE INSERT OR UPDATE
  // trigger of 20260925121000_add_tribe_event_calendar_sequence.sql: +1 on
  // every UPDATE, app-supplied values are ignored.
  calendarSequence: integer("calendar_sequence").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  tribeStartsAtIndex: index("idx_events_tribe_starts_at").on(
    table.tribeId,
    table.startsAt
  ),
  idTribeKey: uniqueIndex("events_id_tribe_id_key").on(table.id, table.tribeId),
}));

export const eventAttendances = pgTable("event_attendances", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  occurrenceStartsAt: timestamp("occurrence_starts_at", {
    withTimezone: true,
  }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // going | maybe | not_going | waitlisted. Written only through the
  // respond_to_tribe_event_occurrence SECURITY DEFINER function.
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  // When the current status was chosen; FIFO order of the waitlist.
  respondedAt: timestamp("responded_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  // Audit/display mark set when a waitlisted answer was promoted to going.
  // Not a sweep cursor: consumers must hook into the promotion transaction.
  promotedAt: timestamp("promoted_at", { withTimezone: true }),
}, (table) => ({
  eventOccurrenceUserKey: uniqueIndex(
    "event_attendances_event_occurrence_user_key"
  ).on(table.eventId, table.occurrenceStartsAt, table.userId),
  eventOccurrenceIndex: index("idx_event_attendances_event_occurrence").on(
    table.eventId,
    table.occurrenceStartsAt
  ),
  tribeOccurrenceIndex: index("idx_event_attendances_tribe_occurrence").on(
    table.tribeId,
    table.occurrenceStartsAt
  ),
  tribeUserOccurrenceIndex: index("idx_event_attendances_tribe_user_occurrence").on(
    table.tribeId,
    table.userId,
    table.occurrenceStartsAt
  ),
  waitlistQueueIndex: index("idx_event_attendances_waitlist_queue")
    .on(table.eventId, table.occurrenceStartsAt, table.respondedAt, table.id)
    .where(sql`status = 'waitlisted'`),
  goingPreviewIndex: index("idx_event_attendances_going_preview")
    .on(table.eventId, table.occurrenceStartsAt, table.respondedAt, table.id)
    .where(sql`status = 'going'`),
  promotedAtIndex: index("idx_event_attendances_promoted_at")
    .on(table.promotedAt)
    .where(sql`promoted_at IS NOT NULL`),
}));

// Cancelled or moved date of a series, keyed by the slot the recurrence rule
// generates (original_starts_at). CHECKs, the composite FK to events, and RLS
// live in 20260924121000_create_event_occurrence_exceptions.sql.
export const eventOccurrenceExceptions = pgTable("event_occurrence_exceptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  originalStartsAt: timestamp("original_starts_at", { withTimezone: true }).notNull(),
  // cancelled | moved
  kind: text("kind").notNull(),
  newStartsAt: timestamp("new_starts_at", { withTimezone: true }),
  newEndsAt: timestamp("new_ends_at", { withTimezone: true }),
  reason: text("reason"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  eventOccurrenceKey: uniqueIndex("event_occurrence_exceptions_event_occurrence_key").on(
    table.eventId,
    table.originalStartsAt
  ),
  eventTribeForeignKey: foreignKey({
    columns: [table.eventId, table.tribeId],
    foreignColumns: [events.id, events.tribeId],
    name: "event_occurrence_exceptions_event_tribe_fkey",
  }).onDelete("cascade"),
  tribeOriginalIndex: index("idx_event_occurrence_exceptions_tribe_original").on(
    table.tribeId,
    table.originalStartsAt
  ),
  tribeNewStartIndex: index("idx_event_occurrence_exceptions_tribe_new_start")
    .on(table.tribeId, table.newStartsAt)
    .where(sql`kind = 'moved'`),
  updatedAtIndex: index("idx_event_occurrence_exceptions_updated_at").on(table.updatedAt),
}));

// Meeting proposed by a member; approving it creates the event (event_id).
// CHECKs and RLS live in 20260924122000_create_event_proposals.sql.
export const eventProposals = pgTable("event_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  proposedBy: text("proposed_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  eventType: text("event_type").notNull().default("live"),
  // pending | approved | rejected | withdrawn
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  eventIdKey: uniqueIndex("event_proposals_event_id_key")
    .on(table.eventId)
    .where(sql`event_id IS NOT NULL`),
  tribeStatusCreatedIndex: index("idx_event_proposals_tribe_status_created").on(
    table.tribeId,
    table.status,
    table.createdAt
  ),
  tribeAuthorCreatedIndex: index("idx_event_proposals_tribe_author_created").on(
    table.tribeId,
    table.proposedBy,
    table.createdAt
  ),
  reviewedAtIndex: index("idx_event_proposals_reviewed_at")
    .on(table.reviewedAt)
    .where(sql`reviewed_at IS NOT NULL`),
}));

// Personal calendar feed token (only the SHA-256 hex digest is stored). CHECKs,
// RLS, and the SECURITY DEFINER resolver live in
// 20260925120000_create_event_calendar_feed_tokens.sql.
export const eventCalendarFeedTokens = pgTable("event_calendar_feed_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  tokenHashKey: uniqueIndex("event_calendar_feed_tokens_token_hash_key").on(table.tokenHash),
  activeMemberKey: uniqueIndex("event_calendar_feed_tokens_active_member_key")
    .on(table.userId, table.tribeId)
    .where(sql`revoked_at IS NULL`),
  tribeIdIndex: index("idx_event_calendar_feed_tokens_tribe_id").on(table.tribeId),
}));

// Recording of one event occurrence (at most one per slot). Its INSERT
// enqueues "event_recording_available"; CHECKs, RLS, and the trigger live in
// 20260927120000_create_event_occurrence_recordings.sql.
export const eventOccurrenceRecordings = pgTable("event_occurrence_recordings", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  originalStartsAt: timestamp("original_starts_at", { withTimezone: true }).notNull(),
  // loom | vimeo | wistia | youtube
  videoProvider: text("video_provider").notNull(),
  externalVideoId: text("external_video_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  eventOccurrenceKey: uniqueIndex("event_occurrence_recordings_event_occurrence_key").on(
    table.eventId,
    table.originalStartsAt
  ),
  eventTribeForeignKey: foreignKey({
    columns: [table.eventId, table.tribeId],
    foreignColumns: [events.id, events.tribeId],
    name: "event_occurrence_recordings_event_tribe_fkey",
  }).onDelete("cascade"),
  tribeOriginalIndex: index("idx_event_occurrence_recordings_tribe_original").on(
    table.tribeId,
    table.originalStartsAt
  ),
}));

// Ordered material links of one event occurrence (same migration).
export const eventOccurrenceMaterials = pgTable("event_occurrence_materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  originalStartsAt: timestamp("original_starts_at", { withTimezone: true }).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  occurrenceSortKey: uniqueIndex("event_occurrence_materials_occurrence_sort_key").on(
    table.eventId,
    table.originalStartsAt,
    table.sortOrder
  ),
  eventTribeForeignKey: foreignKey({
    columns: [table.eventId, table.tribeId],
    foreignColumns: [events.id, events.tribeId],
    name: "event_occurrence_materials_event_tribe_fkey",
  }).onDelete("cascade"),
}));

// "¿Cómo estuvo?" reaction of a member to a finished occurrence. CHECK and
// RLS in 20260927121000_create_event_occurrence_reactions.sql.
export const eventOccurrenceReactions = pgTable("event_occurrence_reactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  originalStartsAt: timestamp("original_starts_at", { withTimezone: true }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // fire | thumbs_up | neutral
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  memberKey: uniqueIndex("event_occurrence_reactions_member_key").on(
    table.eventId,
    table.originalStartsAt,
    table.userId
  ),
  eventTribeForeignKey: foreignKey({
    columns: [table.eventId, table.tribeId],
    foreignColumns: [events.id, events.tribeId],
    name: "event_occurrence_reactions_event_tribe_fkey",
  }).onDelete("cascade"),
}));

// Conversation thread of one occurrence. CHECK and RLS in
// 20260927122000_create_event_occurrence_comments.sql.
export const eventOccurrenceComments = pgTable("event_occurrence_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  originalStartsAt: timestamp("original_starts_at", { withTimezone: true }).notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  clientRequestId: uuid("client_request_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  clientRequestKey: uniqueIndex("event_occurrence_comments_client_request_key")
    .on(table.eventId, table.originalStartsAt, table.authorId, table.clientRequestId)
    .where(sql`${table.clientRequestId} IS NOT NULL`),
  eventTribeForeignKey: foreignKey({
    columns: [table.eventId, table.tribeId],
    foreignColumns: [events.id, events.tribeId],
    name: "event_occurrence_comments_event_tribe_fkey",
  }).onDelete("cascade"),
  threadIndex: index("idx_event_occurrence_comments_thread").on(
    table.eventId,
    table.originalStartsAt,
    table.createdAt,
    table.id
  ),
}));

// In-app notification inbox. CHECKs, RLS, the recipient update guard, and the
// SECURITY DEFINER producer triggers live in
// 20260926120000_create_notifications.sql.
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipientUserId: text("recipient_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  dedupeKey: text("dedupe_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  recipientDedupeKey: uniqueIndex("notifications_recipient_dedupe_key").on(
    table.recipientUserId,
    table.dedupeKey
  ),
  recipientCreatedIndex: index("idx_notifications_recipient_created").on(
    table.recipientUserId,
    table.createdAt.desc(),
    table.id.desc()
  ),
  recipientUnreadIndex: index("idx_notifications_recipient_unread")
    .on(table.recipientUserId)
    .where(sql`read_at IS NULL`),
  readAtIndex: index("idx_notifications_read_at")
    .on(table.readAt)
    .where(sql`read_at IS NOT NULL`),
}));

export const tribePaymentIntegrations = pgTable("tribe_payment_integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id"),
  providerAccountEmail: text("provider_account_email"),
  accountLabel: text("account_label").notNull(),
  status: text("status").notNull().default("connected"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  connectedBy: text("connected_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  providerAccountKey: uniqueIndex("tribe_payment_integrations_provider_account_key").on(
    table.tribeId,
    table.provider,
    sql`COALESCE(${table.providerAccountId}, ${table.id}::text)`
  ),
  providerAccountIdKey: uniqueIndex("tribe_payment_integrations_provider_account_id_key").on(
    table.tribeId,
    table.provider,
    table.providerAccountId
  ).where(sql`${table.providerAccountId} IS NOT NULL`),
  integrationTribeKey: uniqueIndex("tribe_payment_integrations_id_tribe_key").on(
    table.id,
    table.tribeId
  ),
}));

export const tribeSubscriptionPrices = pgTable("tribe_subscription_prices", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  frequency: text("frequency").notNull(),
  status: text("status").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  mercadoPagoPreapprovalPlanId: text("mercado_pago_preapproval_plan_id"),
  paymentIntegrationId: uuid("payment_integration_id"),
  trialFrequency: integer("trial_frequency"),
  trialFrequencyType: text("trial_frequency_type"),
  productKey: text("product_key").notNull().default("membership"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  tribeCreatedAtIndex: index("idx_tribe_subscription_prices_tribe_created_at").on(
    table.tribeId,
    table.createdAt
  ),
  paymentIntegrationIndex: index("idx_tribe_subscription_prices_payment_integration").on(
    table.paymentIntegrationId
  ),
  priceTribeKey: uniqueIndex("tribe_subscription_prices_id_tribe_key").on(
    table.id,
    table.tribeId
  ),
  paymentIntegrationTribeForeignKey: foreignKey({
    columns: [table.paymentIntegrationId, table.tribeId],
    foreignColumns: [tribePaymentIntegrations.id, tribePaymentIntegrations.tribeId],
    name: "tribe_subscription_prices_payment_integration_tribe_fkey",
  }),
}));

export const tribeMemberSubscriptions = pgTable("tribe_member_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  priceId: uuid("price_id").references(() => tribeSubscriptionPrices.id),
  paymentIntegrationId: uuid("payment_integration_id"),
  mercadoPagoPreapprovalId: text("mercado_pago_preapproval_id"),
  priceSnapshotName: text("price_snapshot_name"),
  priceSnapshotAmountCents: integer("price_snapshot_amount_cents"),
  priceSnapshotCurrency: text("price_snapshot_currency"),
  priceSnapshotFrequency: text("price_snapshot_frequency"),
  priceSnapshotProviderPlanId: text("price_snapshot_provider_plan_id"),
  status: text("status").notNull(),
  statusReason: text("status_reason").notNull().default("none"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  productKey: text("product_key").notNull().default("membership"),
  offerVersionSnapshot: integer("offer_version_snapshot"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  billingAnchorAt: timestamp("billing_anchor_at", { withTimezone: true }),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  coverageReconciledAt: timestamp("coverage_reconciled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  priceIndex: index("idx_tribe_member_subscriptions_price").on(table.priceId),
  paymentIntegrationIndex: index("idx_tribe_member_subscriptions_payment_integration").on(
    table.paymentIntegrationId
  ),
  paymentIntegrationTribeForeignKey: foreignKey({
    columns: [table.paymentIntegrationId, table.tribeId],
    foreignColumns: [tribePaymentIntegrations.id, tribePaymentIntegrations.tribeId],
    name: "tribe_member_subscriptions_payment_integration_tribe_fkey",
  }),
}));

export const subscriptionIdempotencyOperations = pgTable("subscription_idempotency_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationKey: text("operation_key").notNull(),
  operationType: text("operation_type").notNull(),
  tribeId: uuid("tribe_id").references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  payloadHash: text("payload_hash").notNull(),
  responseBody: jsonb("response_body").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  operationKey: uniqueIndex("subscription_idempotency_operations_key").on(
    table.operationKey
  ),
}));

export const sitepingFeedbacks = pgTable("siteping_feedbacks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectName: text("project_name").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  url: text("url").notNull(),
  urlPattern: text("url_pattern"),
  screenshotUrl: text("screenshot_url"),
  diagnostics: jsonb("diagnostics"),
  viewport: text("viewport").notNull(),
  userAgent: text("user_agent").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  clientId: text("client_id").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  githubIssueStatus: text("github_issue_status").notNull().default("pending"),
  githubIssueNumber: integer("github_issue_number"),
  githubIssueUrl: text("github_issue_url"),
  githubIssueError: text("github_issue_error"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  projectCreatedByClientIdKey: uniqueIndex(
    "siteping_feedbacks_project_created_by_client_id_key"
  ).on(table.projectName, table.createdBy, table.clientId),
  projectCreatedAtIndex: index("idx_siteping_feedbacks_project_created_at").on(
    table.projectName,
    table.createdAt
  ),
  projectStatusCreatedAtIndex: index("idx_siteping_feedbacks_project_status_created_at").on(
    table.projectName,
    table.status,
    table.createdAt
  ),
  projectUrlIndex: index("idx_siteping_feedbacks_project_url").on(
    table.projectName,
    table.url
  ),
}));

export const sitepingAnnotations = pgTable("siteping_annotations", {
  id: uuid("id").defaultRandom().primaryKey(),
  feedbackId: uuid("feedback_id")
    .notNull()
    .references(() => sitepingFeedbacks.id, { onDelete: "cascade" }),
  cssSelector: text("css_selector").notNull(),
  xpath: text("xpath").notNull(),
  textSnippet: text("text_snippet").notNull(),
  elementTag: text("element_tag").notNull(),
  elementId: text("element_id"),
  textPrefix: text("text_prefix").notNull(),
  textSuffix: text("text_suffix").notNull(),
  fingerprint: text("fingerprint").notNull(),
  neighborText: text("neighbor_text").notNull(),
  anchorKey: text("anchor_key"),
  xPct: doublePrecision("x_pct").notNull(),
  yPct: doublePrecision("y_pct").notNull(),
  wPct: doublePrecision("w_pct").notNull(),
  hPct: doublePrecision("h_pct").notNull(),
  scrollX: doublePrecision("scroll_x").notNull(),
  scrollY: doublePrecision("scroll_y").notNull(),
  viewportW: integer("viewport_w").notNull(),
  viewportH: integer("viewport_h").notNull(),
  devicePixelRatio: doublePrecision("device_pixel_ratio").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  feedbackIndex: index("idx_siteping_annotations_feedback").on(table.feedbackId),
}));

// Academy access (database/migrations/20260928120000..125000). Policies,
// CHECK constraints and owner-only functions live in the SQL migrations.
export const tribeAcademySettings = pgTable("tribe_academy_settings", {
  tribeId: uuid("tribe_id")
    .primaryKey()
    .references(() => tribes.id, { onDelete: "cascade" }),
  accessModel: text("access_model").notNull().default("legacy"),
  admissionEnabled: boolean("admission_enabled").notNull().default(false),
  salesEnabled: boolean("sales_enabled").notNull().default(false),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  benefits: jsonb("benefits").notNull().default(sql`'[]'::jsonb`),
  offerVersion: integer("offer_version").notNull().default(1),
  configVersion: integer("config_version").notNull().default(1),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  activationManifestId: text("activation_manifest_id"),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
});

export const memberAccessGrants = pgTable("member_access_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productKey: text("product_key").notNull(),
  sourceType: text("source_type").notNull(),
  sourceKey: text("source_key").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => users.id, { onDelete: "set null" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
}, (table) => ({
  sourceKey: uniqueIndex("member_access_grants_source_key").on(
    table.tribeId,
    table.productKey,
    table.sourceType,
    table.sourceKey
  ),
  memberProductIndex: index("idx_member_access_grants_member_product").on(
    table.tribeId,
    table.userId,
    table.productKey
  ),
}));

export const memberProductEnrollments = pgTable("member_product_enrollments", {
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productKey: text("product_key").notNull(),
  firstActivatedAt: timestamp("first_activated_at", { withTimezone: true }).notNull(),
  activationOrigin: text("activation_origin").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
}, (table) => ({
  memberProductKey: uniqueIndex("member_product_enrollments_pkey").on(
    table.tribeId,
    table.userId,
    table.productKey
  ),
}));

export const academyAuditEvents = pgTable("academy_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  subjectUserId: text("subject_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  fromState: text("from_state"),
  toState: text("to_state"),
  reason: text("reason"),
  correlationId: text("correlation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
}, (table) => ({
  tribeCreatedIndex: index("idx_academy_audit_events_tribe_created").on(
    table.tribeId,
    table.createdAt
  ),
  entityIndex: index("idx_academy_audit_events_entity").on(table.entityType, table.entityId),
}));

export const verificationProviders = pgTable("verification_providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  displayName: text("display_name").notNull(),
  instructions: text("instructions").notNull().default(""),
  linkUrl: text("link_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
}, (table) => ({
  tribeKey: uniqueIndex("verification_providers_tribe_key").on(table.tribeId, table.key),
  idTribeKey: uniqueIndex("verification_providers_id_tribe_key").on(table.id, table.tribeId),
}));

export const memberVerifications = pgTable("member_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").notNull(),
  status: text("status").notNull().default("pending"),
  declaredEmail: text("declared_email"),
  decisionReason: text("decision_reason"),
  version: integer("version").notNull().default(1),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
}, (table) => ({
  memberProviderKey: uniqueIndex("member_verifications_member_provider_key").on(
    table.tribeId,
    table.userId,
    table.providerId
  ),
  queueIndex: index("idx_member_verifications_queue").on(
    table.tribeId,
    table.status,
    table.createdAt
  ),
  providerTribeForeignKey: foreignKey({
    columns: [table.providerId, table.tribeId],
    foreignColumns: [verificationProviders.id, verificationProviders.tribeId],
    name: "member_verifications_provider_tribe_fkey",
  }),
}));

export const subscriptionPaymentPeriods = pgTable("subscription_payment_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => tribeMemberSubscriptions.id, { onDelete: "cascade" }),
  paymentIntegrationId: uuid("payment_integration_id").notNull(),
  productKey: text("product_key").notNull(),
  providerSubscriptionId: text("provider_subscription_id").notNull(),
  providerInvoiceId: text("provider_invoice_id").notNull(),
  providerPaymentId: text("provider_payment_id"),
  paymentStatus: text("payment_status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  debitAt: timestamp("debit_at", { withTimezone: true }),
  serviceStartsAt: timestamp("service_starts_at", { withTimezone: true }),
  serviceEndsAt: timestamp("service_ends_at", { withTimezone: true }),
  providerLastModifiedAt: timestamp("provider_last_modified_at", { withTimezone: true }),
  grantId: uuid("grant_id").references(() => memberAccessGrants.id, { onDelete: "set null" }),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(UTC_NOW_SQL),
}, (table) => ({
  invoiceKey: uniqueIndex("subscription_payment_periods_invoice_key").on(
    table.paymentIntegrationId,
    table.providerInvoiceId
  ),
  subscriptionIndex: index("idx_subscription_payment_periods_subscription").on(
    table.subscriptionId,
    table.serviceStartsAt
  ),
  integrationTribeForeignKey: foreignKey({
    columns: [table.paymentIntegrationId, table.tribeId],
    foreignColumns: [tribePaymentIntegrations.id, tribePaymentIntegrations.tribeId],
    name: "subscription_payment_periods_integration_tribe_fkey",
  }),
}));

/** Composes admission-owned projections after all existing parent tables exist. */
export const {
  policies: academyAdmissionPolicies,
  allowlistEntries: academyAllowlistEntries,
  personalInvitations: academyPersonalInvitations,
  challenges: contactVerificationChallenges,
  proofs: academyAdmissionVerificationProofs,
  requests: academyAdmissionRequests,
  bindings: academyAdmissionContactBindings,
  decisions: academyAdmissionDecisions,
  operations: academyAdmissionOperations,
  imports: academyAllowlistImports,
  importRows: academyAllowlistImportRows,
  auditEvents: academyAdmissionAuditEvents,
  notificationObligations: academyAdmissionNotificationObligations,
} = createAdmissionSchema({ users, tribes, globalIdentityEvidence, tribeInvitations,
  messaging: (): AdmissionMessagingSchemaReferences => ({versions:messagingConnectionVersions,deliveries:messageDeliveries,codeEnvelopes:verificationCodeEnvelopes}),
});

/** Composes private messaging models after the admission challenge parent exists. */
export const {
  messagingUsagePolicies, tenantMessagingConnections, messagingConnectionVersions,
  messagingSecretEnvelopes, messagingConnectionCapabilities, messagingConnectionDiagnostics,
  messagingContactBudgetSubjects, messagingContactFingerprintAliases, messageDeliveries,
  verificationCodeEnvelopes, messageDeliveryAttempts, messagingUsageReservations, messagingUsageEvents,
} = createMessagingSchema({ tribes, user: users, contactVerificationChallenges });
