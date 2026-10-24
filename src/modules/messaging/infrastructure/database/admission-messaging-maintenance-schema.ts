/** Models the private singleton workflow; versioned SQL owns its native clocks, guard and FORCE RLS. @module admission-messaging-maintenance-schema */
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS, ADMISSION_MESSAGING_MAINTENANCE_LEASE_SECONDS, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_STORAGE, ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE } from "../../constants/admission-messaging-maintenance";
import type { AdmissionMessagingMaintenancePhaseSnapshot } from "../../domain/repositories/admission-messaging-maintenance";

/** @returns One metadata-only current workflow, without keys, contacts, provider payloads or a growing job registry. */
export function createAdmissionMessagingMaintenanceProgressSchema() {
  return pgTable(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.table, {
    scope: text("scope").primaryKey(), version: integer("version").notNull().default(1), runId: uuid("run_id").notNull(),
    state: text("state").notNull().default(ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running),
    externalEnvironment: text("external_environment"), externalSecurityEpoch: text("external_security_epoch"),
    firstPhase: integer("first_phase").notNull().default(0), nextPhase: integer("next_phase").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()+${ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS}*interval '1 millisecond'`),
    leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()+${ADMISSION_MESSAGING_MAINTENANCE_LEASE_SECONDS}*interval '1 second'`),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }), lastSuccessfulAt: timestamp("last_successful_at", { withTimezone: true, mode: "string" }),
    deadlineReached: boolean("deadline_reached").notNull().default(false), phases: jsonb("phases").$type<readonly AdmissionMessagingMaintenancePhaseSnapshot[]>().notNull(),
  }, (table) => ({
    scopeCheck: check(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scopeCheck, sql`${table.scope}=${ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scope}`),
    versionCheck: check(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.versionCheck, sql`${table.version}>0`),
    stateCheck: check(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.stateCheck, sql`${table.state} in (${ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running},${ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.completed},${ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.incomplete})`),
    externalScopeCheck: check(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.externalScopeCheck, sql`num_nonnulls(${table.externalEnvironment},${table.externalSecurityEpoch})=0 or num_nonnulls(${table.externalEnvironment},${table.externalSecurityEpoch})=2 and length(btrim(${table.externalEnvironment}))>0 and length(btrim(${table.externalSecurityEpoch}))>0`),
    phaseCheck: check(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.phaseCheck, sql`${table.firstPhase}>=0 and ${table.firstPhase}<${ADMISSION_MESSAGING_MAINTENANCE_PHASES.length} and ${table.nextPhase}>=0 and ${table.nextPhase}<${ADMISSION_MESSAGING_MAINTENANCE_PHASES.length} and jsonb_typeof(${table.phases})='array' and jsonb_array_length(${table.phases})=${ADMISSION_MESSAGING_MAINTENANCE_PHASES.length} and ${table.phases} @> ${JSON.stringify(ADMISSION_MESSAGING_MAINTENANCE_PHASES.map((phase) => ({ phase })))}::jsonb`),
    receiptCheck: check(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.receiptCheck, sql`(${table.state}=${ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running})=(${table.finishedAt} is null) and ${table.deadlineAt}>=${table.startedAt} and ${table.deadlineAt}<=${table.startedAt}+${ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS}*interval '1 millisecond' and ${table.leaseUntil}=${table.startedAt}+${ADMISSION_MESSAGING_MAINTENANCE_LEASE_SECONDS}*interval '1 second' and (${table.finishedAt} is null or ${table.finishedAt}>=${table.startedAt}) and (${table.lastSuccessfulAt} is null or ${table.lastSuccessfulAt}<=coalesce(${table.finishedAt},${table.startedAt}))`),
    clockCheck: check(ADMISSION_MESSAGING_MAINTENANCE_STORAGE.clockCheck, sql.join([table.startedAt, table.deadlineAt, table.leaseUntil, table.finishedAt, table.lastSuccessfulAt].map((column) => sql`(${column} is null or isfinite(${column}) and abs(extract(epoch from ${column})*${MICROSECONDS_PER_SECOND})<=${Number.MAX_SAFE_INTEGER})`), sql` and `)),
  })).enableRLS();
}
