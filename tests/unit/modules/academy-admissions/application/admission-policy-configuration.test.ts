/** Exercises public policy proposals and current readiness through owned country ports. @module admission-policy-configuration-tests */
import { describe, expect, it, vi } from "vitest";
import { createDefaultAdmissionPolicy, proposeAdmissionPolicyChange, validateAdmissionPolicyConfiguration, validateAdmissionPolicyDraftConfiguration } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { ValidateAdmissionPolicyConfigurationUseCase } from "@/src/modules/academy-admissions/application/use-cases/validate-admission-policy-configuration-use-case";
import type { AdmissionMessagingUsagePolicy, MessagingUsagePolicyReader } from "@/src/modules/academy-admissions/domain/repositories/messaging-usage-policy-reader";
import { proposeAdmissionPolicyActivation, type AdmissionPolicyActivationFacts } from "@/src/modules/academy-admissions/domain/policies/admission-policy-activation";

describe("policy configuration lifecycle", () => {
  it("should propose one policy/marker timestamp only after explicit complete preparation without opening the draft or changing its epoch", () => {
    const policy = createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: "synthetic-tribe" });
    const facts: AdmissionPolicyActivationFacts = { tribeId: policy.tribeId, isAcademy: true, controlActivated: false, preflightComplete: true, evaluatorEnabled: true, recoveryLocked: false, now: new Date("2026-10-07T01:00:00Z"), configuration: { tribeId: policy.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null } };
    const result = proposeAdmissionPolicyActivation(policy, 1, facts);
    expect(result).toMatchObject({ outcome: "changed", policy: { activatedAt: facts.now, version: 2, verificationEpoch: 1, isOpen: false, requiresAdditionalVerification: false }, controlActivatedAt: facts.now });
    expect(policy).toMatchObject({ activatedAt: null, version: 1 });
    if (result.outcome !== "changed") throw new Error("Expected explicit activation proposal");
    expect(proposeAdmissionPolicyActivation(result.policy, 1, { ...facts, controlActivated: true })).toEqual({ outcome: "conflict" });
    expect(proposeAdmissionPolicyActivation(result.policy, 2, { ...facts, controlActivated: true })).toMatchObject({ outcome: "unchanged", policy: { version: 2 } });
  });

  it("should remain closed for missing policy after marker, incomplete preflight, stopped evaluator or recovery lock", () => {
    const policy = createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: "synthetic-tribe" });
    const facts: AdmissionPolicyActivationFacts = { tribeId: policy.tribeId, isAcademy: true, controlActivated: false, preflightComplete: true, evaluatorEnabled: true, recoveryLocked: false, now: new Date("2026-10-07T01:00:00Z"), configuration: { tribeId: policy.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null } };
    expect(proposeAdmissionPolicyActivation(null, 1, { ...facts, controlActivated: true })).toMatchObject({ outcome: "invalid", reason: "policy_unavailable" });
    expect(proposeAdmissionPolicyActivation(policy, 1, { ...facts, preflightComplete: false })).toMatchObject({ outcome: "invalid", reason: "admission_preflight_incomplete" });
    expect(proposeAdmissionPolicyActivation(policy, 1, { ...facts, evaluatorEnabled: false })).toMatchObject({ outcome: "invalid", reason: "admission_evaluator_unavailable" });
    expect(proposeAdmissionPolicyActivation(policy, 1, { ...facts, recoveryLocked: true })).toMatchObject({ outcome: "invalid", reason: "admission_recovery_locked" });
    expect(proposeAdmissionPolicyActivation(policy, 1, { ...facts, controlActivated: true })).toMatchObject({ outcome: "invalid", reason: "admission_preflight_incomplete" });
  });

  it("should start with independent closed defaults and no implied verification or notification connection", () => {
    expect(createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: "synthetic-tribe" })).toMatchObject({ mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, allowCommonExceptions: false, isOpen: false, activatedAt: null, messagingConnectionId: null, messagingConnectionVersion: null, version: 1, verificationEpoch: 1 });
  });

  it("should save an incomplete ON draft while operational validation remains closed to unprepared capability", () => {
    const current = createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: "synthetic-tribe" });
    const facts = { tribeId: current.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null };
    const changed = proposeAdmissionPolicyChange(current, { requiresAdditionalVerification: true }, 1, facts);
    expect(changed).toMatchObject({ outcome: "changed", policy: { requiresAdditionalVerification: true, activatedAt: null, isOpen: false, version: 2, verificationEpoch: 2 } });
    if (changed.outcome !== "changed") throw new Error("Expected valid inactive draft proposal");
    expect(validateAdmissionPolicyDraftConfiguration(changed.policy, facts)).toMatchObject({ valid: true });
    expect(validateAdmissionPolicyConfiguration(changed.policy, facts)).toMatchObject({ valid: false, reason: "verification_unavailable" });
    expect(current).toMatchObject({ requiresAdditionalVerification: false, version: 1, verificationEpoch: 1 });
  });

  it("should retain structural incompatibility in a draft and lock contact type only after activation", () => {
    const current = createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: "synthetic-tribe" });
    const facts = { tribeId: current.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null };
    expect(proposeAdmissionPolicyChange(current, { mode: "allowlist", contactType: "phone" }, 1, facts)).toMatchObject({ outcome: "invalid", reason: "phone_allowlist_verification_required" });
    expect(proposeAdmissionPolicyChange(current, { contactType: "phone" }, 1, facts)).toMatchObject({ outcome: "changed", policy: { contactType: "phone", activatedAt: null } });
    expect(proposeAdmissionPolicyChange({ ...current, activatedAt: new Date("2026-10-07T01:00:00Z") }, { contactType: "phone" }, 1, facts)).toMatchObject({ outcome: "invalid", reason: "contact_type_locked" });
  });

  it("should require current positive quota for active OFF to ON and keep stale requests from becoming no-ops", () => {
    const current = { ...createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: "synthetic-tribe" }), activatedAt: new Date("2026-10-07T01:00:00Z") };
    const facts = { tribeId: current.tribeId, channelPrepared: true, verificationQuotaPositive: false, usagePolicy: null };
    expect(proposeAdmissionPolicyChange(current, { requiresAdditionalVerification: true }, 1, facts)).toMatchObject({ outcome: "invalid", reason: "verification_quota_unavailable" });
    expect(proposeAdmissionPolicyChange({ ...current, version: 2 }, { isOpen: false }, 1, facts)).toEqual({ outcome: "conflict" });
    expect(proposeAdmissionPolicyChange({ ...current, version: 2 }, { isOpen: false }, 2, facts)).toMatchObject({ outcome: "unchanged", policy: { version: 2 } });
  });

  it("should read the sole current country version immediately and reject an obsolete or forbidden telephone readiness", async () => {
    const current = { ...createDefaultAdmissionPolicy({ id: "synthetic-policy", tribeId: "synthetic-tribe" }), contactType: "phone" as const, requiresAdditionalVerification: true, phoneChannel: "sms" as const };
    const usage: AdmissionMessagingUsagePolicy = { tribeId: current.tribeId, version: 4, allowedCountries: ["AR"], platformRestrictions: [] };
    const readForTribe = vi.fn<MessagingUsagePolicyReader["readForTribe"]>(async () => usage);
    const useCase = new ValidateAdmissionPolicyConfigurationUseCase({ readForTribe });
    const readiness = { tribeId: current.tribeId, channelPrepared: true, verificationQuotaPositive: true };
    expect(await useCase.execute(current, readiness)).toMatchObject({ valid: true });
    readForTribe.mockResolvedValueOnce({ ...usage, version: 5, allowedCountries: [] });
    expect(await useCase.execute(current, readiness)).toMatchObject({ valid: false, reason: "recipient_countries_not_configured" });
    readForTribe.mockResolvedValueOnce({ ...usage, version: 6, platformRestrictions: [{ country: "AR", channel: "sms", allowed: false }] });
    expect(await useCase.execute(current, readiness)).toMatchObject({ valid: false, reason: "recipient_countries_restricted" });
    expect(readForTribe).toHaveBeenCalledTimes(3);
  });
});

describe.each([
  { connection: "absent", channelPrepared: false },
  { connection: "prepared", channelPrepared: true },
  { connection: "degraded", channelPrepared: false },
])("policy configuration with $connection messaging", ({ connection, channelPrepared }) => {
  it.each([
    { mode: "manual_review", contactType: "email", verification: false, draftValid: true, preparedValid: true, unavailableValid: true },
    { mode: "allowlist", contactType: "email", verification: false, draftValid: true, preparedValid: true, unavailableValid: true },
    { mode: "manual_review", contactType: "phone", verification: false, draftValid: true, preparedValid: true, unavailableValid: true },
    { mode: "allowlist", contactType: "phone", verification: false, draftValid: false, preparedValid: false, unavailableValid: false },
    { mode: "manual_review", contactType: "email", verification: true, draftValid: true, preparedValid: true, unavailableValid: false },
    { mode: "allowlist", contactType: "email", verification: true, draftValid: true, preparedValid: true, unavailableValid: false },
    { mode: "manual_review", contactType: "phone", verification: true, draftValid: true, preparedValid: true, unavailableValid: false },
    { mode: "allowlist", contactType: "phone", verification: true, draftValid: true, preparedValid: true, unavailableValid: false },
  ] as const)("should preserve draft and operational requirements for $mode/$contactType/ON=$verification", async (row) => {
    const policy = { ...createDefaultAdmissionPolicy({ id: "matrix-policy", tribeId: "matrix-tribe" }), mode: row.mode, contactType: row.contactType, requiresAdditionalVerification: row.verification, phoneChannel: row.contactType === "phone" && row.verification ? "sms" as const : null };
    const usagePolicy: AdmissionMessagingUsagePolicy | null = connection === "absent" ? null : { tribeId: policy.tribeId, version: 3, allowedCountries: ["AR"], platformRestrictions: [] };
    const readForTribe = vi.fn<MessagingUsagePolicyReader["readForTribe"]>(async () => usagePolicy);
    const readiness = { tribeId: policy.tribeId, channelPrepared, verificationQuotaPositive: true };
    const useCase = new ValidateAdmissionPolicyConfigurationUseCase({ readForTribe });

    expect(validateAdmissionPolicyDraftConfiguration(policy, { ...readiness, usagePolicy }).valid).toBe(row.draftValid);
    expect((await useCase.execute(policy, readiness)).valid).toBe(connection === "prepared" ? row.preparedValid : row.unavailableValid);
    expect(readForTribe).toHaveBeenCalledExactlyOnceWith(policy.tribeId);
    expect(policy).toMatchObject({ version: 1, verificationEpoch: 1, activatedAt: null, isOpen: false, messagingConnectionId: null, messagingConnectionVersion: null });
    expect(policy).not.toHaveProperty("allowedCountries");
  });
});
