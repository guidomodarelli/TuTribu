/** @vitest-environment node */
/** Exercises native public messaging/creation contracts without provider or storage mocks. @module messaging-public-contracts-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMessagingRouteBoundary } from "@/src/modules/messaging/infrastructure/api/messaging-route-http";
import { createAdmissionRouteBoundary } from "@/src/modules/academy-admissions/infrastructure/api/admission-route-http";
import { messagingConnectionSchema, providerResourcePageSchema, verificationChallengeSchema, verificationResultSchema, messageDeliverySchema, messagingUsagePolicyStateSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { messagingConnectionCreateSchema, messagingConnectionValidateSchema, messagingDiagnosticVerifySchema } from "@/src/modules/messaging/infrastructure/api/messaging-request-schemas";
import { createPersonalInvitationCreationSchema, personalInvitationSchema, allowlistImportSchema, admissionPolicySchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";

/** Creates the actual response boundary for a synthetic private operation. */
function messagingBoundary(body?: unknown) {
  return createMessagingRouteBoundary({ request: new Request("https://tutribu.example.invalid/api/messaging", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), operation: "messaging-contract-test", diagnostics: () => undefined });
}
/** Creates the actual admission projection boundary. */
function admissionBoundary() {
  return createAdmissionRouteBoundary({ request: new Request("https://tutribu.example.invalid/api/admissions"), operation: "admission-contract-test", diagnostics: () => undefined });
}

describe("messaging public contracts", () => {
  it("should preserve only generic connection metadata without private provider/key/context fields", async () => {
    const connection = { id: randomUUID(), providerId: "zavu", version: 1, state: "draft", maskedCredential: "••••••••", credentialState: "not_validated", environment: "synthetic-local", capabilities: [{ channel: "email", state: "unprepared", checkedAt: null, testedAt: null, sdkPayload: { private: true } }], requirements: ["connection_incomplete"], validatedAt: null, consumption: { verificationToday: 0, notificationToday: 0 } };
    const result = await messagingBoundary().success(messagingConnectionSchema, { ...connection, apiKey: "synthetic-private", secretRef: randomUUID(), teamId: randomUUID(), projectId: randomUUID(), leaseToken: randomUUID() }).json();
    expect(result).toMatchObject({ id: connection.id, maskedCredential: "••••••••", credentialState: "not_validated" });
    for (const privateField of ["apiKey", "secretRef", "teamId", "projectId", "leaseToken"]) expect(result).not.toHaveProperty(privateField);
    expect(result.capabilities[0]).not.toHaveProperty("sdkPayload");
    expect(messagingBoundary().success(messagingConnectionSchema, { ...connection, maskedCredential: "key-last-four" }).status).toBe(500);
  });

  it("should expose mapped resource references without forwarding provider records or administration ids", async () => {
    const resource = { id: randomUUID(), label: "Remitente de prueba", channels: ["email"], readiness: "ready", projectId: randomUUID(), apiKey: "synthetic-private" };
    const result = await messagingBoundary().success(providerResourcePageSchema, { items: [resource], nextCursor: "synthetic-cursor", rawSdkPage: { private: true } }).json();
    expect(result).toEqual({ items: [{ id: resource.id, label: resource.label, channels: ["email"], readiness: "ready" }], nextCursor: "synthetic-cursor" });
  });

  it("should keep delivered transport separate from possession and reject proofs in a diagnostic result", async () => {
    const challenge = { challengeId: randomUUID(), purpose: "admission", channel: "email", maskedDestination: "a•••@example.invalid", expiresAt: "2026-10-06T12:10:00.000Z", resendAllowedAt: "2026-10-06T12:01:00.000Z", deliveryState: "delivered" };
    const published = await messagingBoundary().success(verificationChallengeSchema, { ...challenge, verificationCode: "123456", codeMac: "synthetic-private", envelope: {} }).json();
    expect(published).toEqual(challenge);
    const diagnostic = { purpose: "connection_diagnostic", result: "verified", diagnosticId: randomUUID(), connectionVersion: 1, channel: "email" };
    expect(await messagingBoundary().success(verificationResultSchema, diagnostic).json()).toEqual(diagnostic);
    expect(messagingBoundary().success(verificationResultSchema, { ...diagnostic, proofId: randomUUID() }).status).toBe(500);
    expect(messagingBoundary().success(verificationResultSchema, { purpose: "admission", result: "delivered", proofId: randomUUID(), applyBefore: "2026-10-06T12:25:00.000Z" }).status).toBe(500);
  });

  it("should keep delivery reads minimal and strip plaintext and authorization", async () => {
    const delivery = { id: randomUUID(), state: "unknown", purpose: "admission", channel: "email", createdAt: "2026-10-06T12:00:00.000Z" };
    expect(await messagingBoundary().success(messageDeliverySchema, { ...delivery, body: "synthetic-message", code: "123456", apiKey: "synthetic-private", context: { leaseToken: randomUUID() } }).json()).toEqual(delivery);
  });

  it("should reject fabricated missing-policy versions and preserve a separate not-configured result", async () => {
    expect(await messagingBoundary().success(messagingUsagePolicyStateSchema, { state: "not_configured", policy: null, version: 0 }).json()).toEqual({ state: "not_configured", policy: null });
    expect(messagingBoundary().success(messagingUsagePolicyStateSchema, { state: "configured", policy: null }).status).toBe(500);
  });

  it("should accept ephemeral key input only on explicit creation and reject hosts, authority or a browser version", async () => {
    const creation = { operationId: randomUUID(), confirmed: true, providerId: "zavu", apiKey: "synthetic-key-input", name: "Conexión de prueba" };
    expect(await messagingBoundary(creation).readBody(messagingConnectionCreateSchema)).toMatchObject({ usable: true, value: creation });
    expect((await messagingBoundary({ ...creation, apiHost: "https://example.invalid", version: 1 }).readBody(messagingConnectionCreateSchema)).usable).toBe(false);
    expect((await messagingBoundary({ operationId: randomUUID(), confirmed: true, expectedVersion: 0, verified: true }).readBody(messagingConnectionValidateSchema)).usable).toBe(false);
    expect((await messagingBoundary({ operationId: randomUUID(), confirmed: true, verificationCode: "123456", purpose: "admission" }).readBody(messagingDiagnosticVerifySchema)).usable).toBe(false);
  });

  it("should allow the initial invitation URL only for its trusted origin and never in metadata replay", async () => {
    const invitation = { id: randomUUID(), version: 1, internalName: "Invitación de prueba", recipient: { type: "email", value: "synthetic@example.invalid" }, requiresAllowlist: true, expiresAt: null, status: "active" };
    const schema = createPersonalInvitationCreationSchema("https://tutribu.example.invalid");
    const creation = { invitation, invitationUrl: "https://tutribu.example.invalid/admissions/invitations/synthetic-token" };
    expect(await admissionBoundary().success(schema, creation).json()).toEqual(creation);
    expect(await admissionBoundary().success(personalInvitationSchema, { ...invitation, invitationUrl: creation.invitationUrl, token: "synthetic-token" }).json()).toEqual(invitation);
    for (const url of ["https://other.example.invalid/admissions/invitations/synthetic-token", "javascript:alert(1)", "https://username:password@tutribu.example.invalid/admissions/invitations/synthetic-token", "https://tutribu.example.invalid/admin", "https://tutribu.example.invalid/admissions/invitations/", "https://tutribu.example.invalid/admissions/invitations/synthetic-token?redirect=https://other.example.invalid"]) expect(admissionBoundary().success(schema, { ...creation, invitationUrl: url }).status).toBe(500);
    expect(admissionBoundary().success(schema, { ...creation, invitation: { ...invitation, version: 2 } }).status).toBe(500);
  });

  it("should preserve scoped import progress and reject invented counts or duplicated source rows", async () => {
    const preview = { importId: randomUUID(), state: "processing", expiresAt: "2026-10-07T12:00:00.000Z", sourceVersion: 1, rows: [{ rowNumber: 1, identity: "synthetic@example.invalid", selected: true, errors: [], outcome: "added", version: 1 }], counts: { selected: 1, added: 1, unchanged: 0, skipped: 0, conflict: 0 } };
    expect(await admissionBoundary().success(allowlistImportSchema, { ...preview, rawFile: "synthetic-private", contactFingerprint: "synthetic-private" }).json()).toEqual(preview);
    expect(admissionBoundary().success(allowlistImportSchema, { ...preview, counts: { ...preview.counts, added: 2 } }).status).toBe(500);
    expect(admissionBoundary().success(allowlistImportSchema, { ...preview, state: "preview" }).status).toBe(500);
    expect(admissionBoundary().success(allowlistImportSchema, { ...preview, rows: [preview.rows[0], preview.rows[0]], counts: { ...preview.counts, selected: 2, added: 2 } }).status).toBe(500);
  });

  it("should keep policy and usage versions separate and reject an incomplete connection reference", async () => {
    const policy = { id: randomUUID(), version: 1, verificationEpoch: 1, mode: "manual_review", contactType: "email", isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false, activatedAt: null, messagingConnectionId: null, messagingConnectionVersion: null, usage: { version: 3, allowedCountries: ["AR"] }, requirements: [] };
    expect(await admissionBoundary().success(admissionPolicySchema, { ...policy, rawCapabilities: { private: true }, apiKey: "synthetic-private" }).json()).toEqual(policy);
    expect(admissionBoundary().success(admissionPolicySchema, { ...policy, messagingConnectionVersion: 1 }).status).toBe(500);
    expect(admissionBoundary().success(admissionPolicySchema, { ...policy, version: 0 }).status).toBe(500);
  });
});
