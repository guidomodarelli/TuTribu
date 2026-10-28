/** Projects private fair turns; SQL owns current timestamps, ACL, guards and forced RLS. @module admission-notification-producer-progress-schema */
import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_NOTIFICATION_PRODUCER_PROGRESS_STORAGE } from "../../constants/admission-notification-producer";

/** @param tribeId - Existing live tenant identity. @returns Independent bounded fairness metadata without importing the shared composition root. */
export function createAdmissionNotificationProducerProgressSchema(tribeId: AnyPgColumn) {
  return pgTable(ADMISSION_NOTIFICATION_PRODUCER_PROGRESS_STORAGE.table, {
    tribeId: uuid("tribe_id").primaryKey().references(() => tribeId, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    lastSelectedAt: timestamp("last_selected_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
  }, (table) => [
    check(ADMISSION_NOTIFICATION_PRODUCER_PROGRESS_STORAGE.versionCheck, sql`${table.version}>0`),
    check(ADMISSION_NOTIFICATION_PRODUCER_PROGRESS_STORAGE.clockCheck, sql`isfinite(${table.lastSelectedAt}) and abs(extract(epoch from ${table.lastSelectedAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER}`),
  ]).enableRLS();
}
