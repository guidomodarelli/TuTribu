/** @vitest-environment node */
/** Exercises current/proposed usage differences without writing or rebuilding a policy. @module messaging-usage-change-impact-tests */
import { describe, expect, it } from "vitest";
import { describeMessagingUsageChangeImpact } from "@/src/modules/messaging/application/results/messaging-usage-change-impact";
import type { MessagingUsagePolicyResult } from "@/src/modules/messaging/application/results/messaging-usage-policy-result";

/** @returns One already authorized current policy with consumed reservations kept independently. */
function currentUsage(): MessagingUsagePolicyResult {
  return { version: 6, allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 500, notificationDailyLimit: 1000 }, consumption: { verificationToday: 8, notificationToday: 3 } };
}

describe("messaging usage change impact", () => {
  it("should distinguish a proposed increase from the current values and version without altering consumption", () => {
    const current = currentUsage(), original = structuredClone(current);
    const impact = describeMessagingUsageChangeImpact(current, { allowedCountries: ["AR"], verificationDailyLimit: 150, notificationDailyLimit: 200 });
    expect(impact).toMatchObject({ configurationVersion: 6, verification: { previous: 100, proposed: 150 }, increasesQuota: true, reducesQuota: false, hasChanges: true });
    expect(current).toEqual(original);
    expect(impact).not.toHaveProperty("consumption");
  });

  it("should show zero-quota reduction and each country change while preserving the original owner", () => {
    const current = currentUsage(), original = structuredClone(current);
    const impact = describeMessagingUsageChangeImpact(current, { allowedCountries: ["US"], verificationDailyLimit: 0, notificationDailyLimit: 200 });
    expect(impact).toMatchObject({ verification: { previous: 100, proposed: 0 }, increasesQuota: false, reducesQuota: true, addedCountries: ["US"], removedCountries: ["AR"], hasChanges: true });
    expect(current).toEqual(original);
  });

  it("should recognize an unchanged proposal without creating a new version or a false increase", () => {
    const current = currentUsage();
    const impact = describeMessagingUsageChangeImpact(current, { allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200 });
    expect(impact).toMatchObject({ configurationVersion: 6, increasesQuota: false, reducesQuota: false, hasChanges: false, addedCountries: [], removedCountries: [] });
    expect(current.version).toBe(6);
  });
});
