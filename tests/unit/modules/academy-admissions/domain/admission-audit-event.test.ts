/** Exercises owned audit snapshots without copying command payloads or metric labels. @module admission-audit-event-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionPolicyAuditEvent, createAdmissionProofAuditEvent, createAdmissionMessagingSelectionAuditEvent, createAdmissionRecoveryPolicyAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-audit-event";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";

describe("owned admission audit events", () => {
  it("should record the actual recovery closure without inventing a human, ledger or changed verification rules", () => {
    const tribeId = randomUUID(), createdAt = new Date(), previousPolicy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), isOpen: true, requiresAdditionalVerification: true };
    const policy = { ...previousPolicy, isOpen: false, version: previousPolicy.version + 1 };
    const event = createAdmissionRecoveryPolicyAuditEvent({ tribeId, previousPolicy, policy, createdAt });
    expect(event).toMatchObject({ actorUserId: null, operationId: null, resourceType: "admission_policy", eventType: "pause_admission_policy", rule: "security_context_changed", cause: "security_context_changed", resourceVersion: policy.version, metadata: { previousVersion: previousPolicy.version, fromPolicy: { isOpen: true, requiresAdditionalVerification: true }, toPolicy: { isOpen: false, requiresAdditionalVerification: true } } });
    previousPolicy.isOpen = false; policy.requiresAdditionalVerification = false;
    expect(event.metadata.fromPolicy.isOpen).toBe(true);
    expect(event.metadata.toPolicy.requiresAdditionalVerification).toBe(true);
    expect(event.createdAt).not.toBe(createdAt);
  });
  it("should snapshot effective policy reference lineage and its owner clock without copying private configuration", () => {
    // Arrange: only locked reference facts belong to this existing policy event.
    const input={tribeId:randomUUID(),actorUserId:randomUUID(),operationId:randomUUID(),resourceVersion:8,previousVersion:7,previousConnectionId:randomUUID(),previousConnectionVersion:1,connectionId:randomUUID(),connectionVersion:2,verificationEpoch:5,createdAt:new Date("2026-10-13T13:00:00Z"),credential:"synthetic-private-payload",normalizedContact:"hidden@example.test",policyFlags:{isOpen:false}};
    // Act: the closed variant selects its own metadata and captures the clock.
    const event=createAdmissionMessagingSelectionAuditEvent(input);
    input.createdAt.setUTCDate(14);
    // Assert: identities, lineage and semantic cause stay private and exact.
    expect(event).toEqual({tribeId:input.tribeId,actorUserId:input.actorUserId,operationId:input.operationId,resourceType:"admission_policy",resourceId:input.tribeId,eventType:"messaging_selection_replaced",rule:"messaging_connection_replaced",cause:"messaging_connection_replaced",resourceVersion:8,metadata:{previousVersion:7,previousConnectionId:input.previousConnectionId,previousConnectionVersion:1,connectionId:input.connectionId,connectionVersion:2,verificationEpoch:5},createdAt:new Date("2026-10-13T13:00:00Z")});
    expect(event).not.toHaveProperty("credential");expect(event).not.toHaveProperty("normalizedContact");expect(event.metadata).not.toHaveProperty("policyFlags");
  });
  it("should retain actor, original operation and effective policy version without copying private command fields", () => {
    // Arrange: only owner-derived identity and the applied change belong to audit.
    const command = {
      tribeId: randomUUID(), actorUserId: randomUUID(), resourceId: randomUUID(),
      operationId: randomUUID(), operation: "update_admission_policy" as const,
      resourceVersion: 4, rule: null, createdAt: new Date("2026-10-13T13:00:00Z"),
      apiKey: "synthetic-private-marker", contact: "hidden@example.test", labels: { account: "private" },
    };
    const policy = { ...createDefaultAdmissionPolicy({ id: command.resourceId, tribeId: command.tribeId }), version: 4, isOpen: true };
    // Act: the domain creates its own fixed event rather than spreading a command.
    const event = createAdmissionPolicyAuditEvent({ ...command, previousPolicy: { ...policy, version: 3, isOpen: false }, policy });
    // Assert: private identity is explicit and stays separate from aggregate labels.
    expect(event).toMatchObject({ tribeId: command.tribeId, actorUserId: command.actorUserId, resourceType: "admission_policy", resourceId: command.resourceId, operationId: command.operationId, eventType: "update_admission_policy", rule: null, cause: null, resourceVersion: 4, metadata: { previousVersion: 3, fromPolicy: { isOpen: false }, toPolicy: { isOpen: true } }, createdAt: command.createdAt });
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
    const policy = { ...createDefaultAdmissionPolicy({ id: input.resourceId, tribeId: input.tribeId }), version: 5 };
    expect(createAdmissionPolicyAuditEvent({ ...input, previousPolicy: { ...policy, version: 4, isOpen: true }, policy })).toMatchObject({ eventType: "pause_admission_policy", rule: input.rule, metadata: { previousVersion: 4, fromPolicy: { isOpen: true }, toPolicy: { isOpen: false } } });
  });

  it("should preserve the original event timestamp when its caller later changes its mutable clock", () => {
    const createdAt = new Date("2026-10-13T13:00:00Z");
    const event = createAdmissionProofAuditEvent({ tribeId: randomUUID(), actorUserId: randomUUID(), requestId: randomUUID(), operationId: randomUUID(), proofId: randomUUID(), previousRequestVersion: 1, createdAt });
    createdAt.setUTCDate(14);
    expect(event.createdAt.toISOString()).toBe("2026-10-13T13:00:00.000Z");
  });

  it("should select complete immutable policy transitions without treating initialization absence as an unknown previous configuration", () => {
    const tribeId = randomUUID(), policy = { ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), activatedAt: new Date("2026-10-14T22:00:00Z"), apiKey: "synthetic-policy-secret", contact: "hidden@example.test" };
    const scope = { tribeId, actorUserId: randomUUID(), operationId: randomUUID(), operation: "activate_admission_policy" as const, resourceId: tribeId, resourceVersion: 1, rule: null, createdAt: new Date("2026-10-14T22:00:00Z"), previousPolicy: null, policy };
    const event = createAdmissionPolicyAuditEvent(scope);
    expect(event.metadata).toEqual({ previousVersion: null, fromPolicy: null, toPolicy: { mode: "manual_review", contactType: "email", isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null, verificationEpoch: 1, activatedAt: "2026-10-14T22:00:00.000Z" } });
    policy.activatedAt.setUTCDate(15); policy.isOpen = true;
    expect(event.metadata).toMatchObject({ fromPolicy: null, toPolicy: { isOpen: false, activatedAt: "2026-10-14T22:00:00.000Z" } });
    expect(JSON.stringify(event)).not.toContain(policy.apiKey); expect(JSON.stringify(event)).not.toContain(policy.contact);
  });
});
