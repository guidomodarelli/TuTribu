/** Defines static schemas for the application's own aggregate DTO, never for PostgreSQL/provider responses. @module admission-metrics-schemas */
import { z } from "zod";
import { ADMISSION_METRIC_PHASE, ADMISSION_METRIC_RUN_OPERATION, ADMISSION_METRIC_CHANNELS } from "./admission-metrics";
import { ADMISSION_ERROR_CODE } from "./admission-errors";

/** Counts/ages are finite safe numbers suitable for aggregation and public serialization. */
const metricCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** A missing age is explicit; it is never fabricated from an absent history. */
const metricAgeSchema = metricCountSchema.nullable();
/** Matches the millisecond precision produced by the application's own Date serializer. */
const metricTimestampSchema = z.iso.datetime({ precision: 3 });
/** Restricts the current budget period to its actual midnight UTC boundary. */
const dayStartUtcSchema = metricTimestampSchema.refine((value) => {
  const date = new Date(value);
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
});

/** Contains only closed per-tribe dimensions, current UTC usage and actually observed histories. */
export const admissionMetricsResultSchema = z.strictObject({
  tribeId: z.uuid(), asOf: metricTimestampSchema,
  requests: z.strictObject({ pending: metricCountSchema, approved: metricCountSchema, rejected: metricCountSchema, cancelled: metricCountSchema, expired: metricCountSchema, oldestPendingAgeMs: metricAgeSchema }).refine((value) => value.pending === 0 ? value.oldestPendingAgeMs === null : value.oldestPendingAgeMs !== null),
  reviews: z.strictObject({ automatic: metricCountSchema, manual: metricCountSchema }),
  verification: z.array(z.strictObject({ channel: z.enum(ADMISSION_METRIC_CHANNELS), issued: metricCountSchema, verified: metricCountSchema, invalidated: metricCountSchema, expired: metricCountSchema, failedAttempts: metricCountSchema })).max(ADMISSION_METRIC_CHANNELS.length).refine((values) => new Set(values.map((value) => value.channel)).size === values.length),
  deliveries: z.strictObject({ queued: metricCountSchema, accepted: metricCountSchema, delivered: metricCountSchema, failed: metricCountSchema, unknown: metricCountSchema, suppressed: metricCountSchema, cancelled: metricCountSchema, inFlightLeases: metricCountSchema, oldestQueuedAgeMs: metricAgeSchema }).refine((value) => value.queued === 0 ? value.oldestQueuedAgeMs === null : value.oldestQueuedAgeMs !== null),
  usage: z.strictObject({ policyVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(), dayStartUtc: dayStartUtcSchema, verificationToday: metricCountSchema, notificationToday: metricCountSchema }),
  errors: z.array(z.strictObject({ code: z.enum(ADMISSION_ERROR_CODE), count: metricCountSchema })).refine((values) => new Set(values.map((value) => value.code)).size === values.length),
  lastSuccessfulRun: z.strictObject({ operation: z.enum(ADMISSION_METRIC_RUN_OPERATION), at: metricTimestampSchema }).nullable(),
  durations: z.array(z.strictObject({ phase: z.enum(ADMISSION_METRIC_PHASE), sampleCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), p95Ms: metricCountSchema })).refine((values) => new Set(values.map((value) => value.phase)).size === values.length),
}).refine((value) => {
  const asOf = new Date(value.asOf), midnight = new Date(value.asOf);
  midnight.setUTCHours(0, 0, 0, 0);
  return new Date(value.usage.dayStartUtc).getTime() === midnight.getTime()
    && (!value.lastSuccessfulRun || new Date(value.lastSuccessfulRun.at).getTime() <= asOf.getTime());
});
