/** Projects private opaque group provenance without depending on live groups or framework composition. @module notification-group-origin-schema */
import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, primaryKey, text, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "@/src/modules/notifications/constants/admission-notifications";
import { NOTIFICATION_GROUP_ORIGIN_STORAGE } from "../../constants/notification-group-origin";

/** @param tribeId - Existing retained tenant namespace column, never a live-tribe foreign key. @returns The private origin projection; SQL migrations retain registration, immutable identity, RLS and lifecycle authority. */
export function createNotificationGroupOriginSchema(tribeId: AnyPgColumn) {
  return pgTable(NOTIFICATION_GROUP_ORIGIN_STORAGE.table, {
    groupId: uuid("group_id").notNull(), tribeId: uuid("tribe_id").notNull(),
    recipientRef: text("recipient_ref").notNull(), audience: text("audience").notNull(),
  }, (table) => ({
    primaryKey: primaryKey({ name: NOTIFICATION_GROUP_ORIGIN_STORAGE.primaryKey, columns: [table.groupId] }),
    scopeKey: unique(NOTIFICATION_GROUP_ORIGIN_STORAGE.scopeKey).on(table.groupId, table.tribeId, table.recipientRef, table.audience),
    namespaceForeignKey: foreignKey({ name: NOTIFICATION_GROUP_ORIGIN_STORAGE.namespaceForeignKey, columns: [table.tribeId], foreignColumns: [tribeId] }),
    audienceCheck: check(NOTIFICATION_GROUP_ORIGIN_STORAGE.audienceCheck, sql`${table.audience} in (${ADMISSION_NOTIFICATION_AUDIENCE.applicant},${ADMISSION_NOTIFICATION_AUDIENCE.reviewer})`),
  })).enableRLS();
}
