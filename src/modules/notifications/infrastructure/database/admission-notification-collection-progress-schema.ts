/** Projects the bounded private checkpoint and its retries; versioned SQL owns their triggers, ACL and FORCE RLS. @module admission-notification-collection-progress-schema */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE, ADMISSION_NOTIFICATION_COLLECTION_RETRY_STORAGE } from "../../constants/admission-notification-collection-progress";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "../../constants/admission-notification-source-selection";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";

/** @param tribeId - Existing owning live-tribe column. @returns One per-tribe checkpoint without importing the shared composition root. */
export function createAdmissionNotificationCollectionProgressSchema(tribeId: AnyPgColumn) {
  return pgTable(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.table, {
    tribeId: uuid("tribe_id").primaryKey().references(() => tribeId, { onDelete: "cascade" }),
    version: integer("version").notNull().default(0),
    throughAt: timestamp("through_at", { withTimezone: true, mode: "string" }),
    afterCreatedAt: timestamp("after_created_at", { withTimezone: true, mode: "string" }),
    afterObligationId: uuid("after_obligation_id"), afterRecipientUserId: text("after_recipient_user_id"), afterAudience: text("after_audience"),
    lastOperationId: uuid("last_operation_id"), lastCompletedAt: timestamp("last_completed_at", { withTimezone: true, mode: "string" }),
    lastSweepCompletedAt: timestamp("last_sweep_completed_at", { withTimezone: true, mode: "string" }),
    lastPageThroughAt: timestamp("last_page_through_at", { withTimezone: true, mode: "string" }),
    lastCertifiedThroughAt: timestamp("last_certified_through_at", { withTimezone: true, mode: "string" }),
    sweepHadUnavailable: boolean("sweep_had_unavailable").notNull().default(true),
    pageHadUnavailable: boolean("page_had_unavailable").notNull().default(true),
    examined: integer("examined").notNull().default(0), collected: integer("collected").notNull().default(0), existing: integer("existing").notNull().default(0),
    suppressed: integer("suppressed").notNull().default(0), unavailable: integer("unavailable").notNull().default(0), bucketClosed: integer("bucket_closed").notNull().default(0),
    sweepComplete: boolean("sweep_complete").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
  }, (table) => ({
    versionCheck: check(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.versionCheck, sql`${table.version}>=0`),
    certificationCheck: check(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.certificationCheck, sql`(${table.lastPageThroughAt} is null or isfinite(${table.lastPageThroughAt}) and abs(extract(epoch from ${table.lastPageThroughAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER} and ${table.lastPageThroughAt}<=${table.lastCompletedAt}) and (${table.lastCertifiedThroughAt} is null or isfinite(${table.lastCertifiedThroughAt}) and abs(extract(epoch from ${table.lastCertifiedThroughAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER} and ${table.lastPageThroughAt} is not null and ${table.lastCertifiedThroughAt}<=${table.lastPageThroughAt})`),
    countsCheck: check(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.countsCheck, sql`${table.examined} between 0 and ${ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE} and ${table.collected}>=0 and ${table.existing}>=0 and ${table.suppressed}>=0 and ${table.unavailable}>=0 and ${table.bucketClosed}>=0 and ${table.examined}=${table.collected}+${table.existing}+${table.suppressed}+${table.unavailable}+${table.bucketClosed}`),
    receiptCheck: check(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.receiptCheck, sql`(${table.version}=0 and ${table.lastOperationId} is null and ${table.lastCompletedAt} is null and ${table.lastSweepCompletedAt} is null and ${table.examined}=0 and not ${table.sweepComplete}) or (${table.version}>0 and ${table.lastOperationId} is not null and ${table.lastCompletedAt} is not null and (${table.lastSweepCompletedAt} is null or ${table.lastSweepCompletedAt}<=${table.lastCompletedAt}) and (not ${table.sweepComplete} or ${table.lastSweepCompletedAt} is not null and ${table.lastSweepCompletedAt}=${table.lastCompletedAt}))`),
    cursorCheck: check(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.cursorCheck, sql`(${table.version}=0 and num_nonnulls(${table.throughAt},${table.afterCreatedAt},${table.afterObligationId},${table.afterRecipientUserId},${table.afterAudience})=0) or (${table.version}>0 and num_nonnulls(${table.afterCreatedAt},${table.afterObligationId},${table.afterRecipientUserId},${table.afterAudience}) in (0,4) and ${table.sweepComplete}=(${table.throughAt} is null) and (${table.throughAt} is null or ${table.afterCreatedAt} is null or ${table.afterCreatedAt}<=${table.throughAt}))`),
    audienceCheck: check(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.audienceCheck, sql`${table.afterAudience} is null or ${table.afterAudience} in (${ADMISSION_NOTIFICATION_AUDIENCE.applicant},${ADMISSION_NOTIFICATION_AUDIENCE.reviewer})`),
    clockCheck: check(ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE.clockCheck, sql`isfinite(${table.createdAt}) and abs(extract(epoch from ${table.createdAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER} and (${table.throughAt} is null or isfinite(${table.throughAt}) and abs(extract(epoch from ${table.throughAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER}) and (${table.afterCreatedAt} is null or isfinite(${table.afterCreatedAt}) and abs(extract(epoch from ${table.afterCreatedAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER}) and (${table.lastCompletedAt} is null or isfinite(${table.lastCompletedAt}) and abs(extract(epoch from ${table.lastCompletedAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER}) and (${table.lastSweepCompletedAt} is null or isfinite(${table.lastSweepCompletedAt}) and abs(extract(epoch from ${table.lastSweepCompletedAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER})`),
  })).enableRLS();
}

/**
 * @param tribeId - Existing owning live-tribe column. @param notificationId - Existing original notice column.
 * @returns Pending retries of unavailable sources; a retry disappears with its notice or tribe.
 */
export function createAdmissionNotificationCollectionRetrySchema(tribeId: AnyPgColumn, notificationId: AnyPgColumn) {
  return pgTable(ADMISSION_NOTIFICATION_COLLECTION_RETRY_STORAGE.table, {
    notificationId: uuid("notification_id").primaryKey().references(() => notificationId, { onDelete: "cascade" }),
    tribeId: uuid("tribe_id").notNull().references(() => tribeId, { onDelete: "cascade" }),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true, mode: "string" }).notNull(),
    retriedThroughAt: timestamp("retried_through_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
  }, (table) => ({
    positionIndex: index(ADMISSION_NOTIFICATION_COLLECTION_RETRY_STORAGE.positionIndex).on(table.tribeId, table.sourceCreatedAt, table.notificationId),
    clockCheck: check(ADMISSION_NOTIFICATION_COLLECTION_RETRY_STORAGE.clockCheck, sql`isfinite(${table.sourceCreatedAt}) and abs(extract(epoch from ${table.sourceCreatedAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER} and isfinite(${table.retriedThroughAt}) and abs(extract(epoch from ${table.retriedThroughAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER} and isfinite(${table.createdAt}) and abs(extract(epoch from ${table.createdAt})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER}`),
  })).enableRLS();
}
