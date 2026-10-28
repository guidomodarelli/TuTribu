/** Owns a safe projection of the provider's native cumulative statement diagnostics. */
import { z } from "zod";
import { ADMISSION_STATEMENT_OBJECTS, ADMISSION_STATEMENT_OPERATIONS, ADMISSION_STATEMENT_PROFILE, type AdmissionStatementOperation } from "./constants/admission-statement-profile";

/** Safe own diagnostic DTO; SQL text, literals and provider fields have no output slot. */
export type AdmissionStatementProfile = {
  source: string; scope: string; limit: number;
  statements: Array<{ position: number; operation: AdmissionStatementOperation; scalarProjection: boolean; mentionedObjects: string[]; calls: number; totalExecutionMs: number; meanExecutionMs: number; sharePercent: number }>;
};
const nonnegative = z.number().nonnegative();
const profileSchema: z.ZodType<AdmissionStatementProfile> = z.object({
  source: z.literal(ADMISSION_STATEMENT_PROFILE.source), scope: z.literal(ADMISSION_STATEMENT_PROFILE.scope), limit: z.literal(ADMISSION_STATEMENT_PROFILE.limit),
  statements: z.array(z.object({ position: z.int().positive(), operation: z.enum(ADMISSION_STATEMENT_OPERATIONS), scalarProjection: z.boolean(), mentionedObjects: z.array(z.enum(ADMISSION_STATEMENT_OBJECTS)), calls: z.int().positive(), totalExecutionMs: nonnegative, meanExecutionMs: nonnegative, sharePercent: nonnegative.max(100) }).strict()).max(ADMISSION_STATEMENT_PROFILE.limit),
}).strict();
/** Provider row consumed at the adapter boundary without validating its complete response. */
type NativeStatementRow = { query: string | null; total_exec_time: string; prop_exec_time: string; ncalls: string | number };

/** @param value - Provider interval in its documented hours/minutes/seconds representation. @returns Cumulative execution milliseconds, or NaN for a rejected own DTO. */
function executionMilliseconds(value: string): number {
  const matched = ADMISSION_STATEMENT_PROFILE.intervalPattern.exec(value);
  if (!matched) return Number.NaN;
  const hours = Number(matched[1] ?? 0) * ADMISSION_STATEMENT_PROFILE.hoursPerDay + Number(matched[2]);
  return ((hours * ADMISSION_STATEMENT_PROFILE.minutesPerHour + Number(matched[3])) * ADMISSION_STATEMENT_PROFILE.secondsPerMinute + Number(matched[4])) * ADMISSION_STATEMENT_PROFILE.millisecondsPerSecond;
}

/** @param query - Private provider SQL retained only during projection. @returns Closed, deduplicated object hints, with no arbitrary identifier or literal. */
function mentionedObjects(query: string): string[] {
  const candidates = new Set((query.match(ADMISSION_STATEMENT_PROFILE.identifierPattern) ?? []).map((word) => word.toLowerCase()));
  return ADMISSION_STATEMENT_OBJECTS.filter((name) => candidates.has(name)).sort();
}

/**
 * Projects only numerical counters and closed SQL-object hints from the official inspector.
 * @param input - Private upstream rows, never written to a report or thrown as an error cause.
 * @returns A validated own report; cumulative statistics include setup and warm-up explicitly.
 */
export function projectAdmissionStatementProfile(input: unknown): AdmissionStatementProfile {
  try {
    if (!Array.isArray(input)) throw new TypeError("Native inspector rows unavailable");
    const statements = (input as NativeStatementRow[]).map((row, index) => {
      const totalExecutionMs = executionMilliseconds(row.total_exec_time), calls = Number(row.ncalls);
      const query = row.query ?? "";
      const candidate = ADMISSION_STATEMENT_PROFILE.operationPattern.exec(query)?.[1].toLowerCase();
      const operation = ADMISSION_STATEMENT_OPERATIONS.find((known) => known === candidate) ?? ADMISSION_STATEMENT_PROFILE.unknownOperation;
      return { position: index + 1, operation, scalarProjection: ADMISSION_STATEMENT_PROFILE.scalarProjectionPattern.test(query), mentionedObjects: mentionedObjects(query), calls, totalExecutionMs, meanExecutionMs: totalExecutionMs / calls, sharePercent: ADMISSION_STATEMENT_PROFILE.percentagePattern.test(row.prop_exec_time) ? Number(row.prop_exec_time.slice(0, -1)) : Number.NaN };
    });
    return profileSchema.parse({ source: ADMISSION_STATEMENT_PROFILE.source, scope: ADMISSION_STATEMENT_PROFILE.scope, limit: ADMISSION_STATEMENT_PROFILE.limit, statements });
  } catch {
    // Upstream SQL can contain private literals. Deliberately expose only the owned failure code.
    throw new Error("AdmissionStatementProfile.project failed: invalid_metrics");
  }
}
