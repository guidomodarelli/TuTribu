/** Supplies only synthetic own activity/aggregate DTOs for UI and boundary behavior tests. @module admission-activity-page-fixtures */
import { randomUUID } from "node:crypto";
import type { AdmissionActivityReadyPageState } from "@/src/modules/academy-admissions/application/results/admission-activity-page-state";

/** @returns Separate current policy, observed consumption and one historical owner fact, all in one synthetic tribe. */
export function createAdmissionActivityPageFixture(): AdmissionActivityReadyPageState {
  const tribeId = randomUUID(), viewerId = randomUUID(), instant = "2026-10-14T20:00:00.000Z";
  return {
    kind: "ready", slug: "synthetic-academy", tribeId, viewerId, renderedAt: instant, selection: { limit: 25 },
    currentUsage: { state: "configured", policy: { version: 6, allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 500, notificationDailyLimit: 1000 }, consumption: { verificationToday: 8, notificationToday: 3 } } },
    metrics: {
      tribeId, asOf: instant,
      requests: { pending: 3, approved: 2, rejected: 1, cancelled: 0, expired: 1, oldestPendingAgeMs: 10000 },
      reviews: { automatic: 1, manual: 2 }, verification: [{ channel: "email", issued: 2, verified: 1, invalidated: 0, expired: 0, failedAttempts: 1 }],
      deliveries: { queued: 2, accepted: 1, delivered: 1, failed: 0, unknown: 1, suppressed: 0, cancelled: 1, inFlightLeases: 1, oldestQueuedAgeMs: 5000 },
      attempts: { inFlight: 1, accepted: 1, delivered: 1, rejected: 0, unknown: 1 },
      usage: { policyVersion: 6, dayStartUtc: "2026-10-14T00:00:00.000Z", verificationToday: 8, notificationToday: 3 },
      errors: [{ code: "delivery_unknown", count: 1 }], lastSuccessfulRun: { operation: "messaging_dispatch", at: "2026-10-14T19:59:00.000Z" }, maintenance: null,
      durations: [{ phase: "dispatch", sampleCount: 2, p95Ms: 1000 }],
    },
    activity: { tribeId, items: [{ id: randomUUID(), actorUserId: viewerId, operationId: randomUUID(), tribeLifecycleOperationId: null, resourceType: "messaging_usage_policy", resourceId: tribeId, eventType: "update_messaging_usage", rule: "update_messaging_usage", cause: null, resourceVersion: 2, changes: { previousVersion: 1, allowedCountries: ["AR"], verificationDailyLimit: 50, notificationDailyLimit: 100 }, createdAt: "2026-10-13T12:00:00.000Z" }], nextCursor: null },
  };
}
