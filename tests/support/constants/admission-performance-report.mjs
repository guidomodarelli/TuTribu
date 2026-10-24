/** Defines the safe public CI artifact after private native reports have been projected. @module admission-performance-report-schema */
import { z } from "zod";

const measurementNumber = z.number().finite().nonnegative().nullable();
const count = z.number().int().nonnegative().nullable();
/** Rejects unusable own output without validating the upstream Vitest report as input. */
export const admissionPerformanceReportSchema = z.object({
  head: z.string().regex(/^[a-f0-9]{40}$/u),
  exitCode: z.number().int().nullable(),
  outputTruncated: z.boolean(),
  cases: z.array(z.object({ kind: z.enum(["load", "abandonment"]), status: z.enum(["passed", "failed", "unverified"]), durationMs: measurementNumber })),
  load: z.object({
    participants: count, admitted: count, pending: count, failures: count, poolCheckoutTimeouts: count,
    p95Ms: measurementNumber, targetMs: measurementNumber, networkQueryP95Ms: measurementNumber, networkSamples: count,
    setupDurationMs: measurementNumber, warmupDurationMs: measurementNumber, eventLoopP95Ms: measurementNumber,
    pool: z.object({ maximum: count, acquisitions: count, releases: count, peakWaitingCount: count, waitingAfter: count, checkedOutAfter: count }),
    facts: z.object({ entries: count, requests: count, basicMembers: count, deliveries: count }),
  }).nullable(),
  abandonment: z.object({ observedIdleTimeoutMs: measurementNumber, observationDurationMs: measurementNumber, healthy: count, idleGuardConfirmed: z.boolean(), acquisitions: count, releases: count, waitingAfter: count, checkedOutAfter: count }).nullable(),
});
