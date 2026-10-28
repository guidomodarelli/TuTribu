/** Selects numeric transaction diagnostics only on an explicitly prepared native test host. */
import { z } from "zod";

export const ADMISSION_DATABASE_OBSERVATION = {
  environmentVariable: "ADMISSION_NODE_OBSERVE_DATABASE",
  enabledValue: "1",
} as const;

/** Summarizes completed transactions without adding unrelated percentile observations. */
export type AdmissionDatabaseObservationSummary = {
  transactions: number;
  statementCount: number;
  pendingStatements: number;
  elapsedP95Ms: number | null;
  observedAwaitP95Ms: number | null;
  unobservedP95Ms: number | null;
  statementsPerTransactionP95: number | null;
};

const count = z.number().int().nonnegative();
const duration = z.number().nonnegative().nullable();
export const admissionDatabaseObservationSummarySchema = z.object({
  transactions: count, statementCount: count, pendingStatements: count,
  elapsedP95Ms: duration, observedAwaitP95Ms: duration, unobservedP95Ms: duration,
  statementsPerTransactionP95: count.nullable(),
}).strict() satisfies z.ZodType<AdmissionDatabaseObservationSummary>;

export const admissionDatabaseObservationsSchema = z.object({
  account: admissionDatabaseObservationSummarySchema,
  command: admissionDatabaseObservationSummarySchema,
}).strict();
