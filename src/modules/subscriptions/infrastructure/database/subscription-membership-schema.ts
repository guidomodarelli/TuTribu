/** Projects private single-use payment provenance; versioned SQL owns its guards and deferred consumption. @module subscription-membership-schema */
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid, type AnyPgColumn, type PgTableExtraConfig } from "drizzle-orm/pg-core";

/** Parent columns are supplied by the shared schema composition after both vertical owners are initialized. */
type SubscriptionMembershipSchemaParents = {
  tribes: { id: AnyPgColumn }; users: { id: AnyPgColumn }; members: { id: AnyPgColumn; tribeId: AnyPgColumn; userId: AnyPgColumn };
  subscriptions: { id: AnyPgColumn; tribeId: AnyPgColumn; userId: AnyPgColumn };
};

/**
 * Builds payment-effect metadata without reading resources or invoking provider code.
 * @param parents - Exact tribe, account, instance and subscription columns, resolved by composition.
 * @returns Private table projection matching the versioned source/consumption guards.
 */
export function createSubscriptionMembershipEffectsSchema(parents: SubscriptionMembershipSchemaParents) {
  return pgTable("subscription_membership_effects", {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id"), tribeId: uuid("tribe_id").notNull(), userId: text("user_id").notNull(), memberId: uuid("member_id"),
    providerSubscriptionRef: text("provider_subscription_ref").notNull(), sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    targetStatus: text("target_status").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    appliedAt: timestamp("applied_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), revocationReason: text("revocation_reason"),
  }, (table): PgTableExtraConfig => ({
    tribeForeignKey: foreignKey({ name: "subscription_membership_effects_tribe_id_fkey", columns: [table.tribeId], foreignColumns: [parents.tribes.id] }).onDelete("cascade"),
    userForeignKey: foreignKey({ name: "subscription_membership_effects_user_id_fkey", columns: [table.userId], foreignColumns: [parents.users.id] }).onDelete("cascade"),
    subscriptionForeignKey: foreignKey({ name: "subscription_membership_effects_subscription_id_fkey", columns: [table.subscriptionId], foreignColumns: [parents.subscriptions.id] }).onDelete("set null"),
    memberForeignKey: foreignKey({ name: "subscription_membership_effects_member_id_fkey", columns: [table.memberId], foreignColumns: [parents.members.id] }).onDelete("set null"),
    eventKey: unique("subscription_membership_event_key").on(table.subscriptionId, table.memberId, table.sourceUpdatedAt),
    scopeKey: unique("subscription_membership_effect_scope_key").on(table.id, table.tribeId, table.userId, table.memberId),
    subscriptionScopeForeignKey: foreignKey({ name: "subscription_membership_subscription_scope_fkey", columns: [table.subscriptionId, table.tribeId, table.userId], foreignColumns: [parents.subscriptions.id, parents.subscriptions.tribeId, parents.subscriptions.userId] }),
    memberScopeForeignKey: foreignKey({ name: "subscription_membership_member_scope_fkey", columns: [table.memberId, table.tribeId, table.userId], foreignColumns: [parents.members.id, parents.members.tribeId, parents.members.userId] }),
    targetCheck: check("subscription_membership_target_check", sql`${table.targetStatus} in ('active','muted')`),
    revocationCheck: check("subscription_membership_revocation_check", sql`(${table.revokedAt} is null)=(${table.revocationReason} is null)`),
    timeCheck: check("subscription_membership_time_check", sql`(${table.appliedAt} is null or ${table.appliedAt}>=${table.createdAt}) and (${table.revokedAt} is null or (${table.appliedAt} is not null and ${table.revokedAt}>=${table.appliedAt}))`),
    activeIndex: index("subscription_membership_effect_active_idx").on(table.tribeId, table.userId).where(sql`${table.appliedAt} is not null and ${table.revokedAt} is null`),
  })).enableRLS();
}
