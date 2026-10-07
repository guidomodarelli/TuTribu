/** Exercises editable country/quota input independently of current stored version and historical recovery. @module messaging-usage-browser-intent-tests */
import { describe, expect, it } from "vitest";
import { createMessagingUsageDraft, parseMessagingUsageDraft } from "@/src/modules/messaging/application/commands/messaging-usage-browser-intent";

describe("usage editable input", () => {
  it("should normalize a country set and preserve explicit zero quotas without fabricating a persisted version", () => {
    const absent = { state: "not_configured" as const, policy: null }, draft = createMessagingUsageDraft(absent);
    expect(draft).toEqual({ allowedCountries: [], verificationDailyLimit: "100", notificationDailyLimit: "200" });
    expect(draft).not.toHaveProperty("version");
    expect(parseMessagingUsageDraft({ ...draft, allowedCountries: [" us ", "ar"], verificationDailyLimit: "0" }, absent)).toEqual({ ok: true, value: { allowedCountries: ["AR", "US"], verificationDailyLimit: 0, notificationDailyLimit: 200 } });
  });
  it("should reject empty, fractional or over-limit counts and unsupported or duplicate countries before a writer", () => {
    const absent = { state: "not_configured" as const, policy: null }, draft = createMessagingUsageDraft(absent);
    for (const count of ["", "1.5", "-1", "1001"]) expect(parseMessagingUsageDraft({ ...draft, verificationDailyLimit: count }, absent)).toMatchObject({ ok: false });
    expect(parseMessagingUsageDraft({ ...draft, allowedCountries: ["AR", " ar "] }, absent)).toMatchObject({ ok: false });
    expect(parseMessagingUsageDraft({ ...draft, allowedCountries: ["ZZ"] }, absent)).toMatchObject({ ok: false });
    const configured = { state: "configured" as const, policy: { version: 5, allowedCountries: ["AR"], verificationDailyLimit: 0, notificationDailyLimit: 0, platformMaximums: { verificationDailyLimit: 10, notificationDailyLimit: 20 }, consumption: { verificationToday: 4, notificationToday: 3 } } };
    expect(parseMessagingUsageDraft({ ...draft, verificationDailyLimit: "11", notificationDailyLimit: "0" }, configured)).toMatchObject({ ok: false });
    expect(createMessagingUsageDraft(configured)).toMatchObject({ verificationDailyLimit: "0", notificationDailyLimit: "0" });
  });
});
