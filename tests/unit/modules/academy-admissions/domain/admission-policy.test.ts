/** @vitest-environment node */

/** Exercises the configuration and evidence matrices independently of provider DTOs. */
import { describe, expect, it } from "vitest";

import {
  createDefaultAdmissionPolicy,
  validateAdmissionPolicyConfiguration,
  proposeAdmissionPolicyChange,
} from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createAcademyAdmissionFixtures } from "@/tests/support/academy-admission-fixtures";

describe("admission policy configuration", () => {
  const fixtures = createAcademyAdmissionFixtures("policy-matrix");

  it("should start closed with manual email and verification off when a leader begins configuration", () => {
    const policy = createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: fixtures.tribes.academyA.id });
    expect(policy).toMatchObject({ mode: "manual_review", contactType: "email", isOpen: false, requiresAdditionalVerification: false, allowCommonExceptions: false, version: 1 });
    expect(policy).not.toHaveProperty("allowedCountries");
  });

  it.each([
    { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, valid: true },
    { mode: "manual_review", contactType: "phone", requiresAdditionalVerification: false, valid: true },
    { mode: "allowlist", contactType: "email", requiresAdditionalVerification: false, valid: true },
    { mode: "allowlist", contactType: "phone", requiresAdditionalVerification: false, valid: false },
    { mode: "manual_review", contactType: "email", requiresAdditionalVerification: true, valid: true },
    { mode: "allowlist", contactType: "email", requiresAdditionalVerification: true, valid: true },
    { mode: "manual_review", contactType: "phone", requiresAdditionalVerification: true, valid: true },
    { mode: "allowlist", contactType: "phone", requiresAdditionalVerification: true, valid: true },
  ] as const)("should apply the $mode/$contactType/$requiresAdditionalVerification configuration row", (row) => {
    // Arrange: prepared capability and country facts belong to the same tribe.
    const policy = { ...createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: fixtures.tribes.academyA.id }), ...row, phoneChannel: "sms" as const };
    const result = validateAdmissionPolicyConfiguration(policy, {
      tribeId: policy.tribeId, channelPrepared: true, verificationQuotaPositive: true,
      usagePolicy: { tribeId: policy.tribeId, version: 1, allowedCountries: ["AR"], platformRestrictions: [] },
    });

    // Assert.
    expect(result.valid).toBe(row.valid);
    if (row.contactType === "phone" && row.mode === "manual_review" && !row.requiresAdditionalVerification) {
      expect(result.warnings).toContain("phone_invitations_unavailable");
    }
  });

  it("should reject phone verification activation when the only country configuration is empty", () => {
    const policy = { ...fixtures.policies.manualPhoneOff, requiresAdditionalVerification: true, phoneChannel: "sms" as const };
    expect(validateAdmissionPolicyConfiguration(policy, {
      tribeId: policy.tribeId, channelPrepared: true, verificationQuotaPositive: true,
      usagePolicy: { ...fixtures.usagePolicy, platformRestrictions: [] },
    })).toMatchObject({ valid: false, reason: "recipient_countries_not_configured" });
  });

  it("should allow manual phone with verification off when no provider or countries exist", () => {
    expect(validateAdmissionPolicyConfiguration(fixtures.policies.manualPhoneOff, {
      tribeId: fixtures.tribes.academyA.id, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null,
    })).toMatchObject({ valid: true, warnings: ["phone_invitations_unavailable"] });
  });

  it("should reject an activation fact when its tenant differs from the policy", () => {
    const policy = { ...fixtures.policies.manualEmailOff, requiresAdditionalVerification: true };
    expect(validateAdmissionPolicyConfiguration(policy, {
      tribeId: fixtures.tribes.academyB.id, channelPrepared: true, verificationQuotaPositive: true, usagePolicy: null,
    })).toMatchObject({ valid: false, reason: "policy_scope_mismatch" });
  });

  it("should preserve the selected contact type when the policy has already been activated", () => {
    const policy = { ...fixtures.policies.manualPhoneOff };
    expect(validateAdmissionPolicyConfiguration(policy, {
      tribeId: policy.tribeId, channelPrepared: false, verificationQuotaPositive: false,
      usagePolicy: null, lockedContactType: "email",
    })).toMatchObject({ valid: false, reason: "contact_type_locked" });
  });

  it("should reject a known prohibited destination when no permitted configured country remains", () => {
    const policy = { ...fixtures.policies.manualPhoneOff, requiresAdditionalVerification: true, phoneChannel: "sms" as const };
    expect(validateAdmissionPolicyConfiguration(policy, {
      tribeId: policy.tribeId, channelPrepared: true, verificationQuotaPositive: true,
      usagePolicy: { ...fixtures.usagePolicy, allowedCountries: ["AR"], platformRestrictions: [{ country: "AR", channel: "sms", allowed: false }] },
    })).toMatchObject({ valid: false, reason: "recipient_countries_restricted" });
  });

  it("should require a prepared alternative when WhatsApp is configured with explicit SMS fallback", () => {
    const policy = { ...fixtures.policies.manualPhoneOff, requiresAdditionalVerification: true, phoneChannel: "whatsapp" as const, allowSmsAlternative: true };
    expect(validateAdmissionPolicyConfiguration(policy, {
      tribeId: policy.tribeId, channelPrepared: true, verificationQuotaPositive: true, smsAlternativePrepared: false,
      usagePolicy: { ...fixtures.usagePolicy, allowedCountries: ["AR"], platformRestrictions: [] },
    })).toMatchObject({ valid: false, reason: "sms_alternative_unavailable" });
  });

  it("should start a new epoch only when verification changes from off to on", () => {
    const current = createDefaultAdmissionPolicy({ id: "policy", tribeId: fixtures.tribes.academyA.id });
    const facts = { tribeId: current.tribeId, channelPrepared: true, verificationQuotaPositive: true, usagePolicy: null };
    const enabled = proposeAdmissionPolicyChange(current, { requiresAdditionalVerification: true }, current.version, facts);
    expect(enabled).toMatchObject({ outcome: "changed", policy: { version: 2, verificationEpoch: 2 }, invalidateUnappliedEvidence: true, requiresPendingRecheck: true });
    if (enabled.outcome !== "changed") throw new Error("Expected a valid policy transition");
    const disabled = proposeAdmissionPolicyChange(enabled.policy, { requiresAdditionalVerification: false }, enabled.policy.version, facts);
    expect(disabled).toMatchObject({ outcome: "changed", policy: { version: 3, verificationEpoch: 2 }, invalidateUnappliedEvidence: true });
    expect(current).toMatchObject({ version: 1, verificationEpoch: 1, requiresAdditionalVerification: false });
  });

  it("should reject a stale mutation before treating its desired state as a no-op", () => {
    const current = { ...createDefaultAdmissionPolicy({ id: "policy", tribeId: fixtures.tribes.academyA.id }), version: 2 };
    const facts = { tribeId: current.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null };
    expect(proposeAdmissionPolicyChange(current, { isOpen: false }, 1, facts)).toMatchObject({ outcome: "conflict" });
    expect(proposeAdmissionPolicyChange(current, { isOpen: false }, 2, facts)).toMatchObject({ outcome: "unchanged", policy: { version: 2 } });
  });

  it("should allow pausing an existing verification policy when its provider is unavailable", () => {
    const current = { ...createDefaultAdmissionPolicy({ id: "policy", tribeId: fixtures.tribes.academyA.id }), isOpen: true, requiresAdditionalVerification: true, activatedAt: fixtures.clock.now() };
    expect(proposeAdmissionPolicyChange(current, { isOpen: false }, current.version, {
      tribeId: current.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null,
    })).toMatchObject({ outcome: "changed", policy: { isOpen: false, requiresAdditionalVerification: true }, invalidateUnappliedEvidence: false });
  });

  it("should reject a cross-tribe no-op before returning another tribe's policy", () => {
    const current = createDefaultAdmissionPolicy({ id: "policy", tribeId: fixtures.tribes.academyA.id });
    expect(proposeAdmissionPolicyChange(current, {}, current.version, {
      tribeId: fixtures.tribes.academyB.id, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null,
    })).toMatchObject({ outcome: "invalid", reason: "policy_scope_mismatch" });
  });

  it.each(["phoneChannel", "messagingConnectionId", "messagingConnectionVersion"] as const)(
    "should invalidate unapplied verification when %s changes without starting another epoch", (changedField) => {
      const current = { ...createDefaultAdmissionPolicy({ id: "policy", tribeId: fixtures.tribes.academyA.id }), contactType: "phone" as const, requiresAdditionalVerification: true, phoneChannel: "sms" as const, messagingConnectionId: "connection", messagingConnectionVersion: 1 };
      const patch = changedField === "phoneChannel" ? { phoneChannel: "whatsapp" as const }
        : changedField === "messagingConnectionId" ? { messagingConnectionId: "replacement" }
        : { messagingConnectionVersion: 2 };
      expect(proposeAdmissionPolicyChange(current, patch, current.version, {
        tribeId: current.tribeId, channelPrepared: true, verificationQuotaPositive: true,
        usagePolicy: { ...fixtures.usagePolicy, allowedCountries: ["AR"], platformRestrictions: [] },
      })).toMatchObject({ outcome: "changed", invalidateUnappliedEvidence: true, policy: { verificationEpoch: 1, version: 2 } });
    },
  );
});
