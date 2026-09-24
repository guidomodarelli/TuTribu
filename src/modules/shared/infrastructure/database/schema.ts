import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
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
