/** Projects private dispatch SQL; versioned migrations own authorization and retention constraints. @module messaging-dispatch-observation-schema */
import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { MessageDispatchCounters, MessageDispatchPhase } from "../../domain/repositories/message-dispatch-observation";
import { MESSAGE_DISPATCH_OBSERVATION_DATABASE, MESSAGE_DISPATCH_OBSERVATION_PHASE, MESSAGE_DISPATCH_RUN_OUTCOME } from "../../constants/message-dispatch-observation";

/** @returns Own private tables without duplicating transient business rows or granting runtime access. */
export function createMessagingDispatchObservationSchema() {
  const runs = pgTable(MESSAGE_DISPATCH_OBSERVATION_DATABASE.runs, {
    runId: uuid("run_id").notNull(), tribeId: uuid("tribe_id").notNull(), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    outcome: text("outcome").$type<"completed" | "incomplete">().notNull(), counters: jsonb("counters").$type<MessageDispatchCounters>().notNull(),
  }, (table) => ({
    primaryKey: primaryKey({ columns: [table.runId, table.tribeId] }), history: index(MESSAGE_DISPATCH_OBSERVATION_DATABASE.historyIndex).on(table.tribeId, table.finishedAt.desc()),
    outcome: check(MESSAGE_DISPATCH_OBSERVATION_DATABASE.outcomeCheck, sql`${table.outcome} in (${sql.join(Object.values(MESSAGE_DISPATCH_RUN_OUTCOME).map((outcome) => sql`${outcome}`), sql`, `)})`.inlineParams()),
    counters: check(MESSAGE_DISPATCH_OBSERVATION_DATABASE.countersCheck, sql`jsonb_typeof(${table.counters})='object'`), time: check(MESSAGE_DISPATCH_OBSERVATION_DATABASE.timeCheck, sql`${table.finishedAt}>=${table.startedAt}`),
  }));
  const phases = pgTable(MESSAGE_DISPATCH_OBSERVATION_DATABASE.phases, {
    sampleId: uuid("sample_id").notNull(), runId: uuid("run_id").notNull(), tribeId: uuid("tribe_id").notNull(), phase: text("phase").$type<MessageDispatchPhase>().notNull(), durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
  }, (table) => ({
    primaryKey: primaryKey({ columns: [table.sampleId, table.tribeId] }), scopeIndex: index(MESSAGE_DISPATCH_OBSERVATION_DATABASE.phaseIndex).on(table.tribeId, table.phase),
    run: foreignKey({ columns: [table.runId, table.tribeId], foreignColumns: [runs.runId, runs.tribeId] }).onDelete("cascade"),
    phase: check(MESSAGE_DISPATCH_OBSERVATION_DATABASE.phaseCheck, sql`${table.phase} in (${sql.join(Object.values(MESSAGE_DISPATCH_OBSERVATION_PHASE).map((phase) => sql`${phase}`), sql`, `)})`.inlineParams()),
    duration: check(MESSAGE_DISPATCH_OBSERVATION_DATABASE.durationCheck, sql`${table.durationMs}>=0 and ${table.durationMs}<=${Number.MAX_SAFE_INTEGER}`.inlineParams()),
  }));
  return { runs: runs.enableRLS(), phases: phases.enableRLS() };
}
