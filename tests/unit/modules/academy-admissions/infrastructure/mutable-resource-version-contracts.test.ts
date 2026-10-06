/** @vitest-environment node */

/** Exercises own input/DTO contracts with real Zod, without schema-validating storage or providers. */
import { describe, expect, it } from "vitest";
import { allowlistEntryCreateSchema, allowlistEntryUpdateSchema, personalInvitationCreateSchema, personalInvitationRenameSchema, personalInvitationRevokeSchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";
import { messagingUsagePolicyUpdateSchema, messagingUsagePolicyCreateSchema } from "@/src/modules/messaging/infrastructure/api/messaging-request-schemas";
import { allowlistEntrySchema, personalInvitationSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { messagingUsagePolicyStateSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";

describe("mutable admission resource versions", () => {
  const operationId = "5eb57487-2c1a-4e30-b542-dc113d496992";
  const entry = { id: "a990347a-3c2f-4149-b097-dc2f7e858253", version: 1, contactType: "email", identity: "synthetic@example.test", status: "enabled", source: "manual", createdAt: "2026-10-05T12:00:00Z", updatedAt: "2026-10-05T12:00:00Z" };
  const invitation = { id: entry.id, version: 1, internalName: "Synthetic invitation", recipient: { type: "email", value: "synthetic@example.test" }, requiresAllowlist: true, expiresAt: null, status: "active" };
  const usage = { version: 1, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 0, notificationToday: 0 } };

  it("should expose positive server versions while stripping private metadata from authorized DTOs", () => {
    expect(allowlistEntrySchema.parse({ ...entry, contactFingerprint: "private-fingerprint", macKeyId: "private-key" })).toEqual(entry);
    expect(personalInvitationSchema.parse({ ...invitation, token: "private-token", tokenHash: "private-hash", invitationUrl: "https://example.test/private-token" })).toEqual(invitation);
    expect(messagingUsagePolicyStateSchema.parse({ state: "configured", policy: { ...usage, globalAccountConsumption: 999 } })).toEqual({ state: "configured", policy: usage });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined])("should reject a missing or unusable read version %s", (version) => {
    expect(allowlistEntrySchema.safeParse({ ...entry, version }).success).toBe(false);
    expect(personalInvitationSchema.safeParse({ ...invitation, version }).success).toBe(false);
    expect(messagingUsagePolicyStateSchema.safeParse({ state: "configured", policy: { ...usage, version } }).success).toBe(false);
  });

  it("should preserve absence without inventing a persisted policy version", () => {
    expect(messagingUsagePolicyStateSchema.parse({ state: "not_configured", policy: null })).toEqual({ state: "not_configured", policy: null });
    expect(messagingUsagePolicyStateSchema.safeParse({ state: "not_configured", policy: usage }).success).toBe(false);
    expect(messagingUsagePolicyStateSchema.safeParse({ state: "configured", policy: null }).success).toBe(false);
  });

  it.each([0, -1, 1.5, "1", null, undefined])("should require expectedVersion on each existing-resource mutation instead of accepting %s", (expectedVersion) => {
    expect(allowlistEntryUpdateSchema.safeParse({ operationId, expectedVersion, displayName: "Name", confirmed: true }).success).toBe(false);
    expect(personalInvitationRenameSchema.safeParse({ operationId, expectedVersion, internalName: "Name", confirmed: true }).success).toBe(false);
    expect(personalInvitationRevokeSchema.safeParse({ operationId, expectedVersion, reason: "Synthetic reason", confirmed: true }).success).toBe(false);
    expect(messagingUsagePolicyUpdateSchema.safeParse({ operationId, expectedVersion, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200, confirmed: true }).success).toBe(false);
  });

  it("should accept country configuration before any connection exists while rejecting a second policy or browser authority", () => {
    const body = { operationId, expectedVersion: 1, allowedCountries: ["AR", "US"], verificationDailyLimit: 0, notificationDailyLimit: 200, confirmed: true };
    expect(messagingUsagePolicyUpdateSchema.parse(body)).toEqual(body);
    expect(messagingUsagePolicyUpdateSchema.safeParse({ ...body, connectionVersion: 3 }).success).toBe(false);
    expect(messagingUsagePolicyUpdateSchema.safeParse({ ...body, verified: true }).success).toBe(false);
  });

  it("should create a configuration without expectedVersion zero or a browser-selected read version", () => {
    const body = { operationId, confirmed: true };
    expect(messagingUsagePolicyCreateSchema.parse(body)).toEqual(body);
    expect(messagingUsagePolicyCreateSchema.safeParse({ ...body, expectedVersion: 0 }).success).toBe(false);
    expect(messagingUsagePolicyCreateSchema.safeParse({ ...body, version: 9 }).success).toBe(false);
    expect(messagingUsagePolicyCreateSchema.safeParse({ ...body, allowedCountries: ["AR"], verificationDailyLimit: 500, notificationDailyLimit: 400 }).success).toBe(false);
  });

  it.each([{ allowedCountries: ["ZZ"] }, { allowedCountries: ["AR", "AR"] }, { allowedCountries: ["AR", "ar"] }, { allowedCountries: ["USA"] }])("should reject unusable or duplicate phone countries $allowedCountries", ({ allowedCountries }) => {
    expect(messagingUsagePolicyUpdateSchema.safeParse({ operationId, expectedVersion: 1, allowedCountries, verificationDailyLimit: 100, notificationDailyLimit: 200, confirmed: true }).success).toBe(false);
  });

  it("should reject an unconfirmed command or a quota beyond the contract ceiling", () => {
    expect(allowlistEntryUpdateSchema.safeParse({ operationId, expectedVersion: 1, displayName: "Name", confirmed: false }).success).toBe(false);
    expect(messagingUsagePolicyUpdateSchema.safeParse({ operationId, expectedVersion: 1, allowedCountries: [], verificationDailyLimit: 1001, notificationDailyLimit: 200, confirmed: true }).success).toBe(false);
    expect(messagingUsagePolicyUpdateSchema.safeParse({ operationId, expectedVersion: 1, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 5001, confirmed: true }).success).toBe(false);
  });

  it("should require explicit no-allowlist acknowledgement and keep sensitive identity fields out of editable commands", () => {
    const creation = { operationId, internalName: "Synthetic invitation", recipient: invitation.recipient, requiresAllowlist: false, expiresAt: null, confirmed: true };
    expect(personalInvitationCreateSchema.safeParse(creation).success).toBe(false);
    expect(personalInvitationCreateSchema.safeParse({ ...creation, acknowledgeNoAllowlist: true }).success).toBe(true);
    expect(personalInvitationCreateSchema.safeParse({ ...creation, acknowledgeNoAllowlist: true, token: "browser-token" }).success).toBe(false);
    expect(personalInvitationRenameSchema.safeParse({ operationId, expectedVersion: 1, internalName: "New name", confirmed: true, recipient: invitation.recipient }).success).toBe(false);
    expect(allowlistEntryUpdateSchema.safeParse({ operationId, expectedVersion: 1, status: "disabled", confirmed: true, ownerUserId: "other-user" }).success).toBe(false);
  });

  it("should accept real positive mutation versions while rejecting a client-selected creation version", () => {
    expect(allowlistEntryUpdateSchema.parse({ operationId, expectedVersion: 3, status: "disabled", confirmed: true })).toMatchObject({ expectedVersion: 3 });
    expect(personalInvitationRenameSchema.parse({ operationId, expectedVersion: 2, internalName: "New name", confirmed: true })).toMatchObject({ expectedVersion: 2 });
    expect(personalInvitationRevokeSchema.parse({ operationId, expectedVersion: 4, reason: "Synthetic reason", confirmed: true })).toMatchObject({ expectedVersion: 4 });
    const creation = { operationId, contactType: "email", identity: entry.identity, confirmed: true };
    expect(allowlistEntryCreateSchema.safeParse(creation).success).toBe(true);
    expect(allowlistEntryCreateSchema.safeParse({ ...creation, version: 2 }).success).toBe(false);
  });
});
