/** Models SQL-owned private group storage; versioned migrations retain trigger, ACL and FORCE RLS authority. @module admission-notification-group-schema */
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE } from "../../constants/admission-notification-preference";
import { ADMISSION_NOTIFICATION_GROUP_REASON } from "../../constants/admission-notification-groups";
import { ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE, ADMISSION_NOTIFICATION_GROUP_STATE } from "../../constants/admission-notification-group-storage";
import type { AdmissionNotificationGroupManifest } from "../../domain/entities/admission-notification";

/** Receives existing owning columns without importing the shared composition root back into this module. */
type GroupSchemaParents = { users: { id: AnyPgColumn }; tribes: { id: AnyPgColumn }; obligations: { id: AnyPgColumn; tribeId: AnyPgColumn } };

/** @param parents - Existing account, tribe and original obligation tables. @returns The same private table instances composed by the shared schema. */
export function createAdmissionNotificationGroupSchema(parents: GroupSchemaParents) {
  const groups = pgTable("admission_notification_groups", {
    id: uuid("id").defaultRandom().primaryKey(),
    tribeId: uuid("tribe_id").notNull().references(() => parents.tribes.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id").notNull().references(() => parents.users.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(), mode: text("mode").notNull(),
    preferenceVersion: integer("preference_version").notNull(), emailSettingsVersion: integer("email_settings_version").notNull(),
    timeZone: text("time_zone").notNull(),
    windowStartsAt: timestamp("window_starts_at", { withTimezone: true, mode: "string" }).notNull(),
    windowClosesAt: timestamp("window_closes_at", { withTimezone: true, mode: "string" }).notNull(),
    individualObligationId: uuid("individual_obligation_id"),
    state: text("state").notNull().default(ADMISSION_NOTIFICATION_GROUP_STATE.open), version: integer("version").notNull().default(1),
    frozenManifest: jsonb("frozen_manifest").$type<AdmissionNotificationGroupManifest>(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "string" }), suppressionReason: text("suppression_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
  }, (table) => [
    unique("admission_notification_group_scope_key").on(table.id, table.tribeId, table.recipientUserId, table.audience),
    unique("admission_notification_group_bucket_key").on(table.tribeId, table.recipientUserId, table.audience, table.mode, table.preferenceVersion, table.emailSettingsVersion, table.timeZone, table.windowStartsAt, table.windowClosesAt, table.individualObligationId).nullsNotDistinct(),
    foreignKey({ name: "admission_notification_group_individual_fkey", columns: [table.individualObligationId, table.tribeId], foreignColumns: [parents.obligations.id, parents.obligations.tribeId] }).onDelete("cascade"),
    check("admission_notification_groups_audience_check", sql`${table.audience} in (${ADMISSION_NOTIFICATION_AUDIENCE.applicant},${ADMISSION_NOTIFICATION_AUDIENCE.reviewer})`),
    check("admission_notification_groups_mode_check", sql`${table.mode} in (${ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual},${ADMISSION_NOTIFICATION_PREFERENCE_MODE.grouped},${ADMISSION_NOTIFICATION_PREFERENCE_MODE.daily})`),
    check("admission_notification_groups_preference_version_check", sql`${table.preferenceVersion}>=0`),
    check("admission_notification_groups_email_settings_version_check", sql`${table.emailSettingsVersion}>0`),
    check("admission_notification_groups_state_check", sql`${table.state} in (${ADMISSION_NOTIFICATION_GROUP_STATE.open},${ADMISSION_NOTIFICATION_GROUP_STATE.frozen},${ADMISSION_NOTIFICATION_GROUP_STATE.suppressed},${ADMISSION_NOTIFICATION_GROUP_STATE.expired})`),
    check("admission_notification_groups_version_check", sql`${table.version}>0`),
    check("admission_notification_group_individual_check", sql`(${table.mode}=${ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual})=(${table.individualObligationId} is not null)`),
    check("admission_notification_group_applicant_check", sql`${table.audience}<>${ADMISSION_NOTIFICATION_AUDIENCE.applicant} or (${table.mode}=${ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual} and ${table.preferenceVersion}=0)`),
    check("admission_notification_group_window_check", sql`${table.windowClosesAt}>=${table.windowStartsAt}`),
    check("admission_notification_group_clock_check", sql`isfinite(${table.windowStartsAt}) and isfinite(${table.windowClosesAt}) and abs(extract(epoch from ${table.windowStartsAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER} and abs(extract(epoch from ${table.windowClosesAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER}`),
    check("admission_notification_group_manifest_check", sql`(${table.state}=${ADMISSION_NOTIFICATION_GROUP_STATE.frozen})=(${table.frozenManifest} is not null and ${table.deadlineAt} is not null)`),
    check("admission_notification_group_closed_check", sql`(${table.state}=${ADMISSION_NOTIFICATION_GROUP_STATE.open})=(${table.closedAt} is null)`),
    check("admission_notification_group_reason_check", sql`(${table.state} in (${ADMISSION_NOTIFICATION_GROUP_STATE.suppressed},${ADMISSION_NOTIFICATION_GROUP_STATE.expired}))=(${table.suppressionReason} is not null) and (${table.suppressionReason} is null or ${table.suppressionReason} in (${sql.join(Object.values(ADMISSION_NOTIFICATION_GROUP_REASON).map((reason) => sql`${reason}`), sql`, `)}))`),
    index("admission_notification_group_due_idx").on(table.windowClosesAt, table.id).where(sql`${table.state}=${ADMISSION_NOTIFICATION_GROUP_STATE.open}`),
  ]);
  const members = pgTable("admission_notification_group_members", {
    groupId: uuid("group_id").notNull(), tribeId: uuid("tribe_id").notNull(), recipientUserId: text("recipient_user_id").notNull(), audience: text("audience").notNull(), obligationId: uuid("obligation_id").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "string" }).notNull(),
    state: text("state").notNull().default(ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.pending), suppressionReason: text("suppression_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
  }, (table) => [
    primaryKey({ name: "admission_notification_group_member_key", columns: [table.obligationId, table.recipientUserId, table.audience] }),
    foreignKey({ name: "admission_notification_group_member_group_fkey", columns: [table.groupId, table.tribeId, table.recipientUserId, table.audience], foreignColumns: [groups.id, groups.tribeId, groups.recipientUserId, groups.audience] }).onDelete("cascade"),
    foreignKey({ name: "admission_notification_group_member_obligation_fkey", columns: [table.obligationId, table.tribeId], foreignColumns: [parents.obligations.id, parents.obligations.tribeId] }).onDelete("cascade"),
    check("admission_notification_group_members_state_check", sql`${table.state} in (${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.pending},${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.included},${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.suppressed},${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.expired})`),
    check("admission_notification_group_member_clock_check", sql`isfinite(${table.deadlineAt}) and abs(extract(epoch from ${table.deadlineAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER}`),
    check("admission_notification_group_member_resolved_check", sql`(${table.state}=${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.pending})=(${table.resolvedAt} is null)`),
    check("admission_notification_group_member_reason_check", sql`(${table.state} in (${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.suppressed},${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.expired}))=(${table.suppressionReason} is not null) and (${table.suppressionReason} is null or ${table.suppressionReason} in (${sql.join(Object.values(ADMISSION_NOTIFICATION_GROUP_REASON).map((reason) => sql`${reason}`), sql`, `)}))`),
    index("admission_notification_group_member_group_idx").on(table.groupId, table.obligationId),
  ]);
  return { groups: groups.enableRLS(), members: members.enableRLS() };
}
