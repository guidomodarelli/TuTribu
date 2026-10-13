/** Exercises owned audit snapshots without copying command payloads or metric labels. @module admission-audit-event-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionPolicyAuditEvent, createAdmissionProofAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-audit-event";

describe("owned admission audit events", () => {
  it("should retain actor, original operation and effective policy version without copying private command fields", () => {
    // Arrange: only owner-derived identity and the applied change belong to audit.
    const command = {
      tribeId: randomUUID(), actorUserId: randomUUID(), resourceId: randomUUID(),
      operationId: randomUUID(), operation: "update_admission_policy" as const,
      resourceVersion: 4, rule: null, createdAt: new Date("2026-10-13T13:00:00Z"),
      apiKey: "synthetic-private-marker", contact: "hidden@example.test", labels: { account: "private" },
    };
    // Act: the domain creates its own fixed event rather than spreading a command.
    const event = createAdmissionPolicyAuditEvent(command);
    // Assert: private identity is explicit and stays separate from aggregate labels.
    expect(event).toEqual({ tribeId: command.tribeId, actorUserId: command.actorUserId, resourceType: "admission_policy", resourceId: command.resourceId, operationId: command.operationId, eventType: "update_admission_policy", rule: null, cause: null, resourceVersion: 4, metadata: {}, createdAt: command.createdAt });
    expect(JSON.stringify(event)).not.toContain("synthetic-private-marker");
    expect(event).not.toHaveProperty("labels");
  });

  it("should snapshot proof provenance and previous request version without persisting the contact or code", () => {
    // Arrange: these references identify the actual applied proof and request.
    const input = { tribeId: randomUUID(), actorUserId: randomUUID(), requestId: randomUUID(), operationId: randomUUID(), proofId: randomUUID(), previousRequestVersion: 2, createdAt: new Date("2026-10-13T13:00:00Z"), verificationCode: "synthetic-secret-code", normalizedContact: "hidden@example.test", ciphertext: "private-envelope" };
    // Act.
    const event = createAdmissionProofAuditEvent(input);
    // Assert.
    expect(event).toEqual({ tribeId: input.tribeId, actorUserId: input.actorUserId, resourceType: "admission_request", resourceId: input.requestId, operationId: input.operationId, eventType: "proof_attached", rule: "local_verification", cause: null, resourceVersion: 3, metadata: { proofId: input.proofId, previousRequestVersion: 2 }, createdAt: input.createdAt });
    for (const secret of [input.verificationCode, input.normalizedContact, input.ciphertext]) expect(JSON.stringify(event)).not.toContain(secret);
  });

  it("should preserve an owner-provided policy reason without promoting it into aggregate dimensions", () => {
    const input = { tribeId: randomUUID(), actorUserId: randomUUID(), resourceId: randomUUID(), operationId: randomUUID(), operation: "pause_admission_policy" as const, resourceVersion: 5, rule: "Pausa temporal por capacidad", createdAt: new Date("2026-10-13T13:00:00Z") };
    expect(createAdmissionPolicyAuditEvent(input)).toMatchObject({ eventType: "pause_admission_policy", rule: input.rule, metadata: {} });
  });

  it("should preserve the original event timestamp when its caller later changes its mutable clock", () => {
    const createdAt = new Date("2026-10-13T13:00:00Z");
    const event = createAdmissionProofAuditEvent({ tribeId: randomUUID(), actorUserId: randomUUID(), requestId: randomUUID(), operationId: randomUUID(), proofId: randomUUID(), previousRequestVersion: 1, createdAt });
    createdAt.setUTCDate(14);
    expect(event.createdAt.toISOString()).toBe("2026-10-13T13:00:00.000Z");
  });
});
