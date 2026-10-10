/** Exercises connection preparation, immutable versions and exact local diagnostic activation without a provider. @module messaging-connection-tests */
import { describe, expect, it } from "vitest";
import { createDefaultMessagingConnection, assessMessagingConnectionActivation, suspendMessagingConnection } from "@/src/modules/messaging/domain/entities/tenant-messaging-connection";
import { prepareMessagingConnectionVersion } from "@/src/modules/messaging/domain/entities/messaging-connection-version";
import type { MessagingConnectionVersion } from "@/src/modules/messaging/domain/entities/messaging-connection-version";
import type { ConnectionDiagnostic } from "@/src/modules/messaging/domain/entities/connection-diagnostic";

/** @returns Server-owned current candidate, prepared version and exact locally verified email diagnostic. */
function preparedConnection() {
  const now = new Date("2026-10-07T12:00:00.000Z");
  const connection = createDefaultMessagingConnection({ id: "candidate", tribeId: "tribe", providerId: "zavu", leaderUserId: "leader", environment: "production", securityEpoch: "epoch", createdAt: now });
  const version: MessagingConnectionVersion = { connectionId: connection.id, tribeId: connection.tribeId, version: 1, secretRef: "secret", environment: connection.environment, securityEpoch: connection.securityEpoch, configuration: { emailSenderId: "email-sender", smsSenderId: null, whatsappSenderId: null, whatsappTemplateId: null, whatsappTemplateLanguage: null }, credential: { status: "valid", validatedAt: now, isTestMode: false }, capabilities: [{ channel: "email", state: "prepared", senderId: "email-sender", templateId: null, templateLanguage: null }], retiredAt: null, createdAt: now };
  const diagnostic: ConnectionDiagnostic = { id: "diagnostic", tribeId: "tribe", connectionId: "candidate", connectionVersion: 1, leaderUserId: "leader", channel: "email", senderId: "email-sender", templateId: null, templateLanguage: null, outcome: "verified", validatedAt: now };
  const facts = { now, currentLeaderUserId: "leader", environment: "production", securityEpoch: "epoch", recoveryLocked: false, requiredChannels: ["email"] as const, usagePolicy: { tribeId: "tribe", version: 1, allowedCountries: [] as readonly string[], platformRestrictions: [] as readonly { country: string; channel: "sms" | "whatsapp"; allowed: boolean }[] }, diagnostics: [diagnostic], expectedVersion: 1 };
  return { connection, version, diagnostic, facts };
}

describe("messaging connection lifecycle", () => {
  it("should start only a candidate draft and keep credentials and channels unproven", () => {
    const fixture = preparedConnection();
    expect(fixture.connection).toMatchObject({ state: "draft", version: 1, selectedVersion: null, candidateVersion: 1, isSelected: false, isCandidate: true, stateReason: null });
    const unvalidated = { ...fixture.version, credential: { status: "not_validated" as const, validatedAt: null, isTestMode: null } };
    expect(assessMessagingConnectionActivation(fixture.connection, unvalidated, fixture.facts)).toEqual({ allowed: false, reason: "credential_not_validated" });
  });

  it("should allow email activation with empty phone countries only after exact recent local verification", () => {
    const fixture = preparedConnection();
    expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, fixture.facts)).toEqual({ allowed: true });
    expect(fixture.connection.isSelected).toBe(false);
    expect(fixture.version.credential.isTestMode).toBe(false);
  });

  it.each(["pending", "failed", "expired", "invalidated"] as const)("should not treat a %s diagnostic or an accepted transport as code verification", (outcome) => {
    const fixture = preparedConnection();
    expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, { ...fixture.facts, diagnostics: [{ ...fixture.diagnostic, outcome }] })).toEqual({ allowed: false, reason: "diagnostic_required" });
  });

  it.each(["connectionId", "tribeId", "leaderUserId", "senderId"] as const)("should reject a diagnostic with a different %s", (field) => {
    const fixture = preparedConnection();
    expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, { ...fixture.facts, diagnostics: [{ ...fixture.diagnostic, [field]: "another" }] })).toEqual({ allowed: false, reason: "diagnostic_required" });
  });

  it("should enforce the inclusive 24-hour diagnostic bound and reject future or older confirmation", () => {
    const fixture = preparedConnection();
    for (const [validatedAt, allowed] of [[new Date("2026-10-06T12:00:00.000Z"), true], [new Date("2026-10-06T11:59:59.999Z"), false], [new Date("2026-10-07T12:00:00.001Z"), false]] as const) {
      expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, { ...fixture.facts, diagnostics: [{ ...fixture.diagnostic, validatedAt }] }).allowed).toBe(allowed);
    }
  });

  it("should reject sandbox, changed leadership, stale confirmation, retirement and external recovery state", () => {
    const fixture = preparedConnection();
    expect(assessMessagingConnectionActivation(fixture.connection, { ...fixture.version, credential: { ...fixture.version.credential, isTestMode: true } }, fixture.facts)).toEqual({ allowed: false, reason: "test_mode" });
    expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, { ...fixture.facts, currentLeaderUserId: "next-leader" })).toEqual({ allowed: false, reason: "owner_changed" });
    expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, { ...fixture.facts, expectedVersion: 2 })).toEqual({ allowed: false, reason: "version_conflict" });
    expect(assessMessagingConnectionActivation(fixture.connection, { ...fixture.version, retiredAt: fixture.facts.now }, fixture.facts)).toEqual({ allowed: false, reason: "resource_unavailable" });
    expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, { ...fixture.facts, recoveryLocked: true })).toEqual({ allowed: false, reason: "resource_unavailable" });
    expect(assessMessagingConnectionActivation(fixture.connection, fixture.version, { ...fixture.facts, securityEpoch: "restored" })).toEqual({ allowed: false, reason: "resource_unavailable" });
  });

  it("should reject a credential validation with an unusable date rather than activate the candidate", () => {
    const fixture = preparedConnection();
    const version = { ...fixture.version, credential: { ...fixture.version.credential, validatedAt: new Date(Number.NaN) } };
    expect(assessMessagingConnectionActivation(fixture.connection, version, fixture.facts)).toEqual({ allowed: false, reason: "credential_not_validated" });
  });

  it("should require a saved country for phone and the exact WhatsApp sender/template/language diagnostic", () => {
    const fixture = preparedConnection();
    const version: MessagingConnectionVersion = { ...fixture.version, configuration: { ...fixture.version.configuration, whatsappSenderId: "wa-sender", whatsappTemplateId: "otp", whatsappTemplateLanguage: "es" }, capabilities: [{ channel: "whatsapp", state: "prepared", senderId: "wa-sender", templateId: "otp", templateLanguage: "es" }] };
    const diagnostic: ConnectionDiagnostic = { ...fixture.diagnostic, channel: "whatsapp", senderId: "wa-sender", templateId: "otp", templateLanguage: "es" };
    const facts = { ...fixture.facts, requiredChannels: ["whatsapp"] as const, diagnostics: [diagnostic] };
    expect(assessMessagingConnectionActivation(fixture.connection, version, facts)).toEqual({ allowed: false, reason: "countries_required" });
    const usagePolicy = { ...facts.usagePolicy, version: 2, allowedCountries: ["AR"] };
    expect(assessMessagingConnectionActivation(fixture.connection, version, { ...facts, usagePolicy })).toEqual({ allowed: true });
    expect(assessMessagingConnectionActivation(fixture.connection, version, { ...facts, usagePolicy, diagnostics: [{ ...diagnostic, templateLanguage: "en" }] })).toEqual({ allowed: false, reason: "diagnostic_required" });
    expect(assessMessagingConnectionActivation(fixture.connection, version, { ...facts, usagePolicy, diagnostics: [{ ...diagnostic, connectionVersion: 2 }] })).toEqual({ allowed: false, reason: "diagnostic_required" });
    expect(assessMessagingConnectionActivation(fixture.connection, version, { ...facts, usagePolicy: { ...usagePolicy, platformRestrictions: [{ country: "AR", channel: "whatsapp", allowed: false }] } })).toEqual({ allowed: false, reason: "countries_required" });
    expect(assessMessagingConnectionActivation(fixture.connection, version, { ...facts, usagePolicy: { ...usagePolicy, tribeId: "foreign" } })).toEqual({ allowed: false, reason: "resource_unavailable" });
  });

  it("should keep a no-op version and create an unproven immutable new version for an effective edit", () => {
    const fixture = preparedConnection();
    expect(prepareMessagingConnectionVersion(fixture.version, fixture.version.configuration, fixture.version.secretRef, fixture.facts.now)).toEqual({ changed: false, version: fixture.version });
    const edited = prepareMessagingConnectionVersion(fixture.version, { ...fixture.version.configuration, emailSenderId: "another" }, "new-version-secret", fixture.facts.now);
    expect(edited).toMatchObject({ changed: true, version: { version: 2, configuration: { emailSenderId: "another" }, credential: { status: "not_validated", validatedAt: null, isTestMode: null }, capabilities: [] } });
    expect(fixture.version.configuration.emailSenderId).toBe("email-sender");
    expect(fixture.version.version).toBe(1);
    expect(() => prepareMessagingConnectionVersion(fixture.version, { ...fixture.version.configuration, emailSenderId: "another" }, fixture.version.secretRef, fixture.facts.now)).toThrowError(expect.objectContaining({ code: "secret_version_required" }));
  });

  it("should preserve occupied selection and version while suspending immediately for a new leader", () => {
    const fixture = preparedConnection();
    const selected = { ...fixture.connection, state: "active" as const, isSelected: true, isCandidate: false, selectedVersion: 1, candidateVersion: null };
    const suspended = suspendMessagingConnection(selected, "leadership_changed", fixture.facts.now);
    expect(suspended).toMatchObject({ state: "suspended", stateReason: "leadership_changed", isSelected: true, selectedVersion: 1, version: 2 });
    expect(selected.state).toBe("active");
  });
});
