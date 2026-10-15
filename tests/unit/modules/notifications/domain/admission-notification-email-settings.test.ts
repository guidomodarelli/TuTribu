/** Exercises independent email epochs without provider, OTP or storage side effects. @module admission-notification-email-settings-test */
import { describe, expect, it } from "vitest";
import { planAdmissionNotificationEmailSettingsChange, resolveAdmissionNotificationEmailSettings } from "@/src/modules/notifications/domain/policies/admission-notification-email-settings";
import type { AdmissionNotificationEmailSettings } from "@/src/modules/notifications/domain/entities/admission-notification";

/** @returns Existing settings with an exact native enablement cut. */
function settings(): AdmissionNotificationEmailSettings {
  return { tribeId: "tribe", enabled: true, version: 3, enabledAtMicroseconds: 1790000000000001, timeZone: "America/Argentina/Buenos_Aires" };
}
/** @param stored - Existing settings or actual absence. @returns A boundary-validated explicit proposal and fresh owner facts. */
function input(stored: AdmissionNotificationEmailSettings | null = settings()) {
  return { tribeId: "tribe", stored, change: { expectedVersion: stored?.version ?? 0, enabled: true, timeZone: "America/Argentina/Buenos_Aires" }, preparedEmail: { tribeId: "tribe", available: true }, nowMicroseconds: 1790000000000123 };
}

describe("independent admission email settings", () => {
  // Arrange/act/assert: reading absent configuration produces only the specified read-only default.
  it("should resolve absent settings as OFF without inventing a persisted version or enablement", () => {
    expect(resolveAdmissionNotificationEmailSettings("tribe", null)).toEqual({ tribeId: "tribe", enabled: false, version: 0, enabledAtMicroseconds: null, timeZone: "America/Argentina/Buenos_Aires" });
  });

  it("should preserve precise current settings while projecting only owned fields", () => {
    const original = { ...settings(), privateProviderValue: "not projected" };
    expect(resolveAdmissionNotificationEmailSettings("tribe", original)).toEqual(settings());
  });

  it("should reject settings from another tribe before projecting them", () => {
    expect(resolveAdmissionNotificationEmailSettings("other", settings())).toBeNull();
  });

  it("should enable a first configuration at the authoritative current cut", () => {
    const proposal = input(null);
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "changed", settings: { tribeId: "tribe", enabled: true, version: 1, enabledAtMicroseconds: proposal.nowMicroseconds, timeZone: "America/Argentina/Buenos_Aires" } });
    expect(proposal.stored).toBeNull();
  });

  it("should leave an untouched implicit OFF default unpersisted", () => {
    const proposal = input(null);
    proposal.change.enabled = false;
    proposal.preparedEmail.available = false;
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "unchanged", settings: resolveAdmissionNotificationEmailSettings("tribe", null) });
  });

  it.each([false, true])("should reject a stale version before treating enabled=%s as a no-op", (enabled) => {
    const proposal = input({ ...settings(), enabled, enabledAtMicroseconds: enabled ? settings().enabledAtMicroseconds : null });
    proposal.change.enabled = enabled;
    proposal.change.expectedVersion -= 1;
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "rejected", reason: "email_settings_version_conflict" });
  });

  it.each(["unavailable", "foreign"])("should reject a new enablement when tested email is %s", (reason) => {
    const proposal = input(null);
    if (reason === "foreign") proposal.preparedEmail.tribeId = "other";
    else proposal.preparedEmail.available = false;
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "rejected", reason: "email_capability_unavailable" });
  });

  it("should preserve the original version and cut for a true no-op even if capability has since closed", () => {
    const proposal = input();
    proposal.preparedEmail.available = false;
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "unchanged", settings: settings() });
  });

  it("should disable email without requiring a working connection and clear the active cut", () => {
    const proposal = input();
    proposal.change.enabled = false;
    proposal.preparedEmail.available = false;
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "changed", settings: { ...settings(), version: 4, enabled: false, enabledAtMicroseconds: null } });
  });

  it("should renew the cut when enabling again instead of replaying the previous enabled period", () => {
    const proposal = input({ ...settings(), enabled: false, enabledAtMicroseconds: null });
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "changed", settings: { ...settings(), version: 4, enabledAtMicroseconds: proposal.nowMicroseconds } });
  });

  it("should begin a new enabled epoch when changing the daily zone", () => {
    const proposal = input();
    proposal.change.timeZone = "America/New_York";
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "changed", settings: { ...settings(), version: 4, enabledAtMicroseconds: proposal.nowMicroseconds, timeZone: "America/New_York" } });
  });

  it("should store a disabled zone choice without enabling email or requiring a connection", () => {
    const proposal = input(null);
    proposal.change.enabled = false;
    proposal.change.timeZone = "Asia/Kolkata";
    proposal.preparedEmail.available = false;
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "changed", settings: { tribeId: "tribe", enabled: false, enabledAtMicroseconds: null, version: 1, timeZone: "Asia/Kolkata" } });
  });

  it("should reject crossed stored settings instead of overwriting another tribe", () => {
    const proposal = input({ ...settings(), tribeId: "other" });
    expect(planAdmissionNotificationEmailSettingsChange(proposal)).toEqual({ status: "rejected", reason: "notification_scope_mismatch" });
  });
});
