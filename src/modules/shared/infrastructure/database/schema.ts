import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export const communityCreatorWhitelist = pgTable("community_creator_whitelist", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  emailKey: uniqueIndex("community_creator_whitelist_email_key").on(table.email),
}));

export const communities = pgTable("communities", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  visibility: text("visibility").notNull().default("private"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  slugKey: uniqueIndex("communities_slug_key").on(table.slug),
}));

export const communityMembers = pgTable("community_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  membershipKey: uniqueIndex("community_members_community_id_user_id_key").on(
    table.communityId,
    table.userId
  ),
}));
