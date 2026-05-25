import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const UTC_NOW_SQL = sql`timezone('utc', now())`;

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  membershipKey: uniqueIndex("tribe_members_tribe_id_user_id_key").on(
    table.tribeId,
    table.userId
  ),
}));

export const tribeInvitations = pgTable("tribe_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  tokenEncrypted: text("token_encrypted"),
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
  tribeStatusIndex: index("idx_tribe_invitations_tribe_status").on(
    table.tribeId,
    table.status
  ),
  subscriptionPriceIndex: index("idx_tribe_invitations_subscription_price_id").on(
    table.subscriptionPriceId
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
  externalVideoProvider: text("external_video_provider"),
  externalVideoId: text("external_video_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => ({
  tribeCreatedAtIndex: index("idx_messages_tribe_created_at").on(
    table.tribeId,
    table.createdAt
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

export const courseModules = pgTable("course_modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
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

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  meetingUrl: text("meeting_url"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
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
}));

export const tribePaymentIntegrations = pgTable("tribe_payment_integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id"),
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
  tribeProviderKey: uniqueIndex("tribe_payment_integrations_tribe_provider_key").on(
    table.tribeId,
    table.provider
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
  trialFrequency: integer("trial_frequency"),
  trialFrequencyType: text("trial_frequency_type"),
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
}));

export const tribeMemberSubscriptions = pgTable("tribe_member_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tribeId: uuid("tribe_id")
    .notNull()
    .references(() => tribes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  priceId: uuid("price_id")
    .notNull()
    .references(() => tribeSubscriptionPrices.id),
  mercadoPagoPreapprovalId: text("mercado_pago_preapproval_id"),
  status: text("status").notNull(),
  statusReason: text("status_reason").notNull().default("none"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(UTC_NOW_SQL),
}, (table) => ({
  priceIndex: index("idx_tribe_member_subscriptions_price").on(table.priceId),
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
