/** Exercises the admission consumer through its own current-state port, with no provider or infrastructure mocks. */
import { describe, expect, it } from "vitest";
import { ValidateAdmissionPolicyConfigurationUseCase } from "@/src/modules/academy-admissions/application/use-cases/validate-admission-policy-configuration-use-case";
import type { AdmissionMessagingUsagePolicy } from "@/src/modules/academy-admissions/domain/repositories/messaging-usage-policy-reader";

describe("admission policy country facts", () => {
  const tribeId = "synthetic-tribe";
  const policy = { tribeId, mode: "manual_review" as const, contactType: "phone" as const, isOpen: true, allowCommonExceptions: false, requiresAdditionalVerification: true, phoneChannel: "sms" as const };
  const readiness = { tribeId, channelPrepared: true, verificationQuotaPositive: true };

  it("should read current countries for each decision instead of reusing an old policy snapshot", async () => {
    let current: AdmissionMessagingUsagePolicy | null = null;
    const consumer = new ValidateAdmissionPolicyConfigurationUseCase({ readForTribe: async () => current });
    expect(await consumer.execute(policy, readiness)).toMatchObject({ valid: false, reason: "recipient_countries_not_configured" });
    current = { tribeId, version: 1, allowedCountries: [], platformRestrictions: [] };
    expect(await consumer.execute(policy, readiness)).toMatchObject({ valid: false, reason: "recipient_countries_not_configured" });
    current = { tribeId, version: 2, allowedCountries: ["AR"], platformRestrictions: [] };
    expect(await consumer.execute(policy, readiness)).toEqual({ valid: true, warnings: [] });
    current = { ...current, version: 3, allowedCountries: [] };
    expect(await consumer.execute(policy, readiness)).toMatchObject({ valid: false, reason: "recipient_countries_not_configured" });
    expect(policy).not.toHaveProperty("allowedCountries");
  });

  it("should apply the checked restriction for the chosen channel and reject another tribe projection", async () => {
    let current: AdmissionMessagingUsagePolicy = { tribeId, version: 1, allowedCountries: ["AR"], platformRestrictions: [{ country: "AR", channel: "sms", allowed: false }] };
    const consumer = new ValidateAdmissionPolicyConfigurationUseCase({ readForTribe: async () => current });
    expect(await consumer.execute(policy, readiness)).toMatchObject({ valid: false, reason: "recipient_countries_restricted" });
    current = { ...current, platformRestrictions: [{ country: "AR", channel: "whatsapp", allowed: false }] };
    expect(await consumer.execute(policy, readiness)).toEqual({ valid: true, warnings: [] });
    current = { ...current, tribeId: "another-tribe" };
    expect(await consumer.execute(policy, readiness)).toMatchObject({ valid: false, reason: "policy_scope_mismatch" });
  });

  it("should preserve manual phone OFF and prepared email without creating a second countries setting", async () => {
    const consumer = new ValidateAdmissionPolicyConfigurationUseCase({ readForTribe: async () => null });
    expect(await consumer.execute({ ...policy, requiresAdditionalVerification: false }, readiness)).toEqual({ valid: true, warnings: ["phone_invitations_unavailable"] });
    expect(await consumer.execute({ ...policy, contactType: "email", phoneChannel: null }, readiness)).toEqual({ valid: true, warnings: [] });
  });

  it("should replace a stale supplied snapshot and preserve a reader failure instead of validating with it", async () => {
    const stale = { ...readiness, usagePolicy: { tribeId, version: 1, allowedCountries: ["AR"], platformRestrictions: [] } };
    const current = new ValidateAdmissionPolicyConfigurationUseCase({ readForTribe: async () => ({ tribeId, version: 2, allowedCountries: [], platformRestrictions: [] }) });
    expect(await current.execute(policy, stale)).toMatchObject({ valid: false, reason: "recipient_countries_not_configured" });
    const failure = new Error("Synthetic owner authorization unavailable");
    const unavailable = new ValidateAdmissionPolicyConfigurationUseCase({ readForTribe: async () => { throw failure; } });
    await expect(unavailable.execute(policy, stale)).rejects.toBe(failure);
  });
});
