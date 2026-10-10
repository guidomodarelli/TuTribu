/** @vitest-environment node */
/** Exercises notification-only same-tribe recovery decisions without exposing a deduplication bypass. @module notification-delivery-recovery-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateNotificationDeliveryRecovery, type NotificationDeliveryRecoveryFacts } from "@/src/modules/messaging/domain/policies/notification-delivery-recovery";

/** @returns Current ready native facts, independently scoped to a different connection of the same tribe. */
function prepareFacts(): NotificationDeliveryRecoveryFacts {
  const tribeId = randomUUID();
  return { original: { tribeId, connectionId: randomUUID(), environment: "synthetic", securityEpoch: "original-epoch", purpose: "admission_notification", state: "suppressed", deadlineAt: new Date("2026-10-11T12:00:00Z") }, originalAttempt: null, target: { tribeId, connectionId: randomUUID(), environment: "synthetic", securityEpoch: "original-epoch", selected: true, active: true, emailPrepared: true }, obligationCurrent: true, now: new Date("2026-10-10T12:00:00Z") };
}

describe("explicit notification recovery", () => {
  it("should allow a fresh explicit delivery for a current suppressed obligation without an external marker", () => {
    expect(evaluateNotificationDeliveryRecovery(prepareFacts())).toEqual({ allowed: true });
  });
  it("should allow a rejected original attempt without releasing or reusing its consumed reservation", () => {
    const facts = prepareFacts(); facts.original.state = "failed"; facts.originalAttempt = { state: "rejected" };
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: true });
  });
  it.each(["admission", "connection_diagnostic"] as const)("should never redirect %s to a different connection", (purpose) => {
    const facts = prepareFacts(); facts.original.purpose = purpose;
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_purpose_mismatch" });
  });
  it.each(["in_flight", "unknown", "accepted"] as const)("should block another POST for an original %s marker without OG-04", (state) => {
    const facts = prepareFacts(); facts.originalAttempt = { state };
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_original_dispatch_unresolved" });
  });
  it("should reject a delivered original obligation", () => {
    const facts = prepareFacts(); facts.original.state = "delivered";
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_already_delivered" });
  });
  it("should reject a foreign tribe or the same connection", () => {
    const facts = prepareFacts(); facts.target.tribeId = randomUUID();
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_tenant_mismatch" });
    facts.target.tribeId = facts.original.tribeId; facts.target.connectionId = facts.original.connectionId;
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_connection_unchanged" });
  });
  it("should reject stale external security scope even for a prepared replacement", () => {
    const facts = prepareFacts(); facts.target.securityEpoch = "new-epoch";
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_security_scope_changed" });
  });
  it.each(["selected", "active", "emailPrepared"] as const)("should reject a replacement without current %s", (property) => {
    const facts = prepareFacts(); facts.target[property] = false;
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_connection_not_ready" });
  });
  it("should reject an unavailable original obligation or an elapsed original deadline", () => {
    const facts = prepareFacts(); facts.obligationCurrent = false;
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_obligation_unavailable" });
    facts.obligationCurrent = true; facts.now = facts.original.deadlineAt;
    expect(evaluateNotificationDeliveryRecovery(facts)).toEqual({ allowed: false, reason: "notification_recovery_deadline_expired" });
  });
});
