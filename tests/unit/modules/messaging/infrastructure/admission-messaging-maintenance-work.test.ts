/** @vitest-environment node */
/** Exercises phase evidence at the own owner ports, including mixed and uncertain results. @module admission-messaging-maintenance-work-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OriginalAdmissionMessagingMaintenanceWork, type AdmissionMessagingMaintenanceOwners } from "@/src/modules/messaging/infrastructure/composition/admission-messaging-maintenance-work";
import { createMessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS } from "@/src/modules/messaging/constants/admission-messaging-maintenance";
import { createAdmissionMaintenanceResultFixture } from "@/tests/support/admission-messaging-maintenance-fixture";
import type { AdmissionMessagingMaintenancePhase } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";
import type { AdmissionNotificationProducerResult } from "@/src/modules/notifications/domain/repositories/admission-notification-producer";
import type { MessageDispatchObservedRunResult } from "@/src/modules/messaging/application/results/message-dispatch-observation-result";

/** @returns Empty confirmed producer evidence; the reminder is an independent owner. */
function notificationResult(): AdmissionNotificationProducerResult { return { reminders: { status: "not_run", count: 0, code: null }, selection: { status: "completed", count: 0, code: null }, tribes: [], stoppedAtDeadline: false, limitReached: false }; }
/** @returns Explicit zero counters, independently classified observer and worker outcomes. */
function dispatchResult(): MessageDispatchObservedRunResult { return { claimed: 0, authorized: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false, elapsedMs: 0, workerOutcome: "completed", observationOutcome: "recorded" }; }
/** @returns Real imported synthetic keys, own operation fakes and the production result mapper. */
async function fixture() {
  const keyring = () => ({ activeKeyId: randomUUID(), keys: [] as { id: string; material: Uint8Array }[] });
  const ring = () => { const value = keyring(); value.keys.push({ id: value.activeKeyId, material: crypto.getRandomValues(new Uint8Array(MESSAGING_CRYPTO.keyBytes)) }); return value; };
  const security = await createMessagingSecurityConfig({ environment: randomUUID(), securityEpoch: randomUUID(), recoveryLocked: false, keyrings: { credential: ring(), otp_envelope: ring(), verification_mac: ring(), invitation_token: ring(), contact_fingerprint: ring(), operation_payload: ring() } });
  const owners = { expireRequests: vi.fn(async () => ({ expired: 1 })), purgeAdmission: vi.fn(async () => ({ importMaterial: { purgedRows: 2, completedImports: 1 }, privateData: { requestsMinimized: 3, auditEventsPurged: 4, archivedAuditEventsPurged: 5, remainingRequests: false, remainingAuditEvents: true } })), purgeMessaging: vi.fn(async () => ({ candidates: { expired: 6, purgedImmediately: 2 }, retiredSecretsPurged: 7, verificationMaterialPurged: 8 })), materializeReminders: vi.fn(async () => ({ created: 9 })), prepareNotifications: vi.fn(async () => notificationResult()), dispatchOutbox: vi.fn(async () => dispatchResult()), reconcileLeases: vi.fn(async () => 10) } satisfies AdmissionMessagingMaintenanceOwners;
  const createOwners = vi.fn(() => owners), assertRunnable = vi.fn(async () => undefined), readSecurityConfig = vi.fn(async () => security), report = vi.fn();
  const work = new OriginalAdmissionMessagingMaintenanceWork(createOwners, assertRunnable, readSecurityConfig, { now: Date.now, createId: randomUUID, defer: () => undefined, report });
  const result = createAdmissionMaintenanceResultFixture(), run = { runId: result.runId!, startedAtMilliseconds: Date.now(), firstPhaseIndex: 0, externalScope: null, health: result.health };
  const execute = (phase: AdmissionMessagingMaintenancePhase, signal = new AbortController().signal) => work.runPhase(phase, Date.now() + ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS, signal, run);
  return { owners, createOwners, assertRunnable, readSecurityConfig, report, execute };
}

describe("actual admission maintenance phase evidence", () => {
  it("should keep independent retention units and reminder counts without importing external security configuration", async () => {
    const test = await fixture();
    test.readSecurityConfig.mockRejectedValue(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration));
    expect(await test.execute("expire_requests")).toMatchObject({ status: "completed", metrics: [{ key: "expired_requests", value: 1 }] });
    expect(await test.execute("purge_admission")).toMatchObject({ status: "completed", metrics: [{ key: "purged_import_rows", value: 2 }, { key: "completed_imports", value: 1 }, { key: "minimized_requests", value: 3 }, { key: "purged_audit_events", value: 4 }, { key: "purged_archived_audit_events", value: 5 }], hasRemainingWork: true });
    expect(await test.execute("purge_messaging")).toMatchObject({ status: "completed", metrics: [{ key: "expired_candidates", value: 6 }, { key: "purged_candidate_secrets", value: 2 }, { key: "purged_retired_secrets", value: 7 }, { key: "purged_verification_material", value: 8 }] });
    expect(await test.execute("materialize_reminders")).toMatchObject({ status: "completed", metrics: [{ key: "created_reminders", value: 9 }] });
    expect(test.readSecurityConfig).not.toHaveBeenCalled();
  });

  it("should retain confirmed group counts while classifying missing messaging configuration explicitly", async () => {
    const test = await fixture();
    test.owners.prepareNotifications.mockResolvedValueOnce({ ...notificationResult(), selection: { status: "completed", count: 2, code: null }, tribes: [{ tribeId: randomUUID(), operationId: randomUUID(), collection: { status: "completed", count: 3, code: null }, preparation: { status: "completed", count: 2, code: null }, hasContinuation: false, groupsExamined: 2 }, { tribeId: randomUUID(), operationId: randomUUID(), collection: { status: "failed", count: 0, code: "connection_incomplete" }, preparation: { status: "not_run", count: 0, code: null }, hasContinuation: null, groupsExamined: 0 }] });
    expect(await test.execute("prepare_notifications")).toEqual({ status: "not_configured", reason: "configuration_unavailable", metrics: [{ key: "selected_notification_tribes", value: 2 }, { key: "collected_notification_sources", value: 3 }, { key: "prepared_notification_groups", value: 2 }], hasRemainingWork: true });
    expect(test.owners.materializeReminders).not.toHaveBeenCalled();
  });

  it("should keep an uncertain page explicit while retaining earlier committed selection counts", async () => {
    const test = await fixture();
    test.owners.prepareNotifications.mockResolvedValueOnce({ ...notificationResult(), selection: { status: "unresolved", count: 1, code: "operation_unresolved" } });
    expect(await test.execute("prepare_notifications")).toMatchObject({ status: "unresolved", reason: "operation_unresolved", metrics: [{ key: "selected_notification_tribes", value: 1 }, { key: "collected_notification_sources", value: 0 }, { key: "prepared_notification_groups", value: 0 }], hasRemainingWork: true });
  });

  it("should report unknown transport independently of operational completion and delivered receipts", async () => {
    const test = await fixture();
    test.owners.dispatchOutbox.mockResolvedValueOnce({ ...dispatchResult(), claimed: 2, authorized: 2, unknown: 2 });
    const result = await test.execute("dispatch_outbox");
    expect(result).toMatchObject({ status: "completed", reason: null, hasRemainingWork: true });
    expect(result.metrics).toEqual(expect.arrayContaining([{ key: "unknown_deliveries", value: 2 }, { key: "delivered_deliveries", value: 0 }]));
  });

  it("should preserve accepted counts when its independent dispatcher observation is unavailable", async () => {
    const test = await fixture();
    test.owners.dispatchOutbox.mockResolvedValueOnce({ ...dispatchResult(), claimed: 1, authorized: 1, accepted: 1, observationOutcome: "unavailable" });
    const result = await test.execute("dispatch_outbox");
    expect(result).toMatchObject({ status: "unresolved", reason: "observation_unavailable", hasRemainingWork: true });
    expect(result.metrics).toContainEqual({ key: "accepted_deliveries", value: 1 });
  });

  it("should omit the external owner before composition when its actual security import is unavailable", async () => {
    const test = await fixture();
    test.readSecurityConfig.mockRejectedValueOnce(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration));
    expect(await test.execute("dispatch_outbox")).toEqual({ status: "not_configured", reason: "configuration_unavailable", metrics: [], hasRemainingWork: true });
    expect(test.createOwners).not.toHaveBeenCalled();
    expect(test.owners.dispatchOutbox).not.toHaveBeenCalled();
  });

  it("should avoid starting another phase after original cancellation", async () => {
    const test = await fixture(), controller = new AbortController();
    controller.abort();
    expect(await test.execute("expire_requests", controller.signal)).toMatchObject({ status: "not_run", reason: "deadline_reached", hasRemainingWork: true });
    expect(test.assertRunnable).not.toHaveBeenCalled();
    expect(test.createOwners).not.toHaveBeenCalled();
  });

  it("should reconcile native metadata without loading keys or constructing an external sender", async () => {
    const test = await fixture();
    test.readSecurityConfig.mockRejectedValue(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration));
    expect(await test.execute("reconcile_leases")).toMatchObject({ status: "completed", reason: null, metrics: [{ key: "reconciled_leases", value: 10 }] });
    expect(test.readSecurityConfig).not.toHaveBeenCalled();
    expect(test.owners.dispatchOutbox).not.toHaveBeenCalled();
  });
});
