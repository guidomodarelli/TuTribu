/** Exercises the application's own public aggregate contract without validating provider or PostgreSQL rows. @module admission-audit-and-metrics-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admissionMetricsResultSchema, parseAdmissionMetricsResult } from "@/src/modules/academy-admissions/application/results/admission-metrics-result";

/** @returns A scoped aggregate with only closed dimensions and UTC boundaries; no account/contact labels. */
function metricsFixture(tribeId = randomUUID()) {
  return { tribeId, asOf: "2026-10-12T20:00:00.000Z", requests: { pending: 3, approved: 2, rejected: 1, cancelled: 0, expired: 1, oldestPendingAgeMs: 10_000 }, reviews: { automatic: 1, manual: 2 }, verification: [{ channel: "email", issued: 2, verified: 1, invalidated: 0, expired: 0, failedAttempts: 1 }], deliveries: { queued: 2, accepted: 1, delivered: 1, failed: 0, unknown: 1, suppressed: 0, cancelled: 1, inFlightLeases: 1, oldestQueuedAgeMs: 5_000 }, attempts: { inFlight: 1, accepted: 1, delivered: 1, rejected: 0, unknown: 1 }, usage: { policyVersion: 4, dayStartUtc: "2026-10-12T00:00:00.000Z", verificationToday: 3, notificationToday: 2 }, errors: [{ code: "delivery_unknown", count: 1 }], lastSuccessfulRun: { operation: "messaging_dispatch", at: "2026-10-12T19:59:00.000Z" }, maintenance: { lastCompletedAt: "2026-10-12T19:58:00.000Z" }, durations: [{ phase: "dispatch", sampleCount: 2, p95Ms: 1_000 }] };
}

describe("safe admission aggregate contract", () => {
  it("should consume only the own scoped aggregate with UTC consumption and current configuration version", () => {
    const value = metricsFixture();
    expect(parseAdmissionMetricsResult(value, value.tribeId)).toEqual(value);
    expect(admissionMetricsResultSchema.safeParse(value).success).toBe(true);
  });
  it.each(["userId", "contact", "apiKey", "ciphertext", "requestId", "traceId", "stack"])("should reject a personal or private dimension %s instead of publishing it as an aggregate label", (field) => {
    const value = metricsFixture(), privateMarker = randomUUID();
    expect(admissionMetricsResultSchema.safeParse({ ...value, [field]: privateMarker }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, errors: [{ code: "delivery_unknown", count: 1, [field]: privateMarker }] }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, verification: [{ ...value.verification[0], labels: { [field]: privateMarker } }] }).success).toBe(false);
  });
  it("should reject another tribe's otherwise usable public result before exposing its aggregate", () => {
    const value = metricsFixture();
    expect(() => parseAdmissionMetricsResult(value, randomUUID())).toThrow(expect.objectContaining({ code: "public_contract_unusable" }));
  });
  it("should reject arbitrary exception labels, unsupported phases and duplicate channel series", () => {
    const value = metricsFixture();
    expect(admissionMetricsResultSchema.safeParse({ ...value, errors: [{ code: "Raw provider exception", count: 1 }] }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, durations: [{ phase: randomUUID(), sampleCount: 1, p95Ms: 1 }] }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, verification: [value.verification[0], value.verification[0]] }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, errors: [value.errors[0], value.errors[0]] }).success).toBe(false);
  });
  it("should reject negative, fractional or nonfinite counters and a consumption boundary outside midnight UTC", () => {
    const value = metricsFixture();
    for (const pending of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(admissionMetricsResultSchema.safeParse({ ...value, requests: { ...value.requests, pending } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, usage: { ...value.usage, dayStartUtc: "2026-10-12T01:00:00.000Z" } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, usage: { ...value.usage, dayStartUtc: "2026-10-12T00:00:00-03:00" } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, usage: { ...value.usage, policyVersion: 0 } }).success).toBe(false);
  });
  it("should keep empty histories explicit without inventing a successful worker run or age measurement", () => {
    const value = metricsFixture();
    const empty = { ...value, verification: [], errors: [], durations: [], lastSuccessfulRun: null, requests: { ...value.requests, pending: 0, oldestPendingAgeMs: null }, deliveries: { ...value.deliveries, queued: 0, oldestQueuedAgeMs: null } };
    expect(parseAdmissionMetricsResult(empty, value.tribeId)).toEqual(empty);
    expect(admissionMetricsResultSchema.safeParse({ ...empty, requests: { ...empty.requests, oldestPendingAgeMs: 1 } }).success).toBe(false);
  });
  it("should reject future success or budget periods and duration measurements without real samples", () => {
    const value = metricsFixture();
    expect(admissionMetricsResultSchema.safeParse({ ...value, lastSuccessfulRun: { ...value.lastSuccessfulRun, at: "2026-10-13T00:00:00.000Z" } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, maintenance: { lastCompletedAt: "2026-10-13T00:00:00.000Z" } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, maintenance: { lastCompletedAt: null } }).success).toBe(true);
    expect(admissionMetricsResultSchema.safeParse({ ...value, usage: { ...value.usage, dayStartUtc: "2026-10-13T00:00:00.000Z" } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, durations: [{ phase: "dispatch", sampleCount: 0, p95Ms: 1_000 }] }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, durations: [value.durations[0], value.durations[0]] }).success).toBe(false);
  });
  it("should preserve absent usage configuration without manufacturing a policy version or resetting observed consumption", () => {
    const value = metricsFixture(), unconfigured = { ...value, usage: { ...value.usage, policyVersion: null } };
    expect(parseAdmissionMetricsResult(unconfigured, value.tribeId)).toEqual(unconfigured);
    expect(admissionMetricsResultSchema.safeParse({ ...unconfigured, usage: { ...unconfigured.usage, policyVersion: 0 } }).success).toBe(false);
  });
  it("should reject fractional timestamps whose unsupported precision would hide a nonmidnight budget or future success", () => {
    const value = metricsFixture();
    expect(admissionMetricsResultSchema.safeParse({ ...value, usage: { ...value.usage, dayStartUtc: "2026-10-12T00:00:00.000001Z" } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, lastSuccessfulRun: { ...value.lastSuccessfulRun, at: "2026-10-12T20:00:00.000999Z" } }).success).toBe(false);
    expect(admissionMetricsResultSchema.safeParse({ ...value, asOf: "2026-10-12T20:00:00.000001Z" }).success).toBe(false);
  });
});
