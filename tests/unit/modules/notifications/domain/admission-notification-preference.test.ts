/** @vitest-environment node */
/** Exercises scoped defaults and explicit CAS plans without a provider or persistence double. @module admission-notification-preference-tests */
import { describe, expect, it } from "vitest";
import { planAdmissionNotificationPreferenceChange, resolveAdmissionNotificationPreference } from "@/src/modules/notifications/domain/policies/admission-notification-preference";
import type { AdmissionNotificationPreference, AdmissionNotificationPreferenceContext, AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";

/** @param overrides - Current server facts changed by the scenario. @returns An isolated scoped active reviewer without any channel/connection dependency. */
function createReviewerContext(overrides: Partial<AdmissionNotificationPreferenceContext> = {}): AdmissionNotificationPreferenceContext {
  return { tribeId: "00000000-0000-4000-8000-000000000001", recipientUserId: "reviewer-account", currentRole: "leader", membershipStatus: "active", ...overrides };
}

/** @param overrides - Original persisted fields changed by the scenario. @returns A current explicit recipient preference with an immutable prior epoch. */
function createStoredPreference(overrides: Partial<AdmissionNotificationPreference> = {}): AdmissionNotificationPreference {
  return { tribeId: "00000000-0000-4000-8000-000000000001", recipientUserId: "reviewer-account", mode: "grouped", version: 4, effectiveFrom: "2026-10-15T09:00:00.123456Z", ...overrides };
}

describe("admission notification preference policy", () => {
  it.each([{ role: "leader", mode: "grouped" }, { role: "guardian", mode: "omitted" }])("should resolve the unstored $mode default when the current role is $role", ({ role, mode }) => {
    // Given a current reviewer whose preference has never been saved.
    const context = createReviewerContext({ currentRole: role });
    // When defaults are read, neither email enablement nor a provider is an input.
    const result = resolveAdmissionNotificationPreference(context, null);
    // Then the role-specific default carries no invented stored version or epoch.
    expect(result).toEqual({ status: "resolved", preference: { tribeId: context.tribeId, recipientUserId: context.recipientUserId, mode, version: 0, effectiveFrom: null, source: "implicit" } });
  });

  it.each(["individual", "grouped", "daily", "omitted"] satisfies AdmissionNotificationPreferenceMode[])("should retain the explicit %s choice when a leader is now an active guardian", (mode) => {
    // Given an explicit choice rather than the guardian's initial omitted default.
    const stored = createStoredPreference({ mode });
    const result = resolveAdmissionNotificationPreference(createReviewerContext({ currentRole: "guardian" }), stored);
    expect(result).toEqual({ status: "resolved", preference: { ...stored, source: "stored" } });
  });

  it.each([{ currentRole: "tribemate", membershipStatus: "active" }, { currentRole: null, membershipStatus: "active" }, { currentRole: "leader", membershipStatus: "muted" }, { currentRole: "guardian", membershipStatus: "blocked" }, { currentRole: "leader", membershipStatus: "removed" }])("should hide stored preferences when current reviewer authority becomes $currentRole/$membershipStatus", (facts) => {
    const context = createReviewerContext(facts), stored = createStoredPreference();
    expect(resolveAdmissionNotificationPreference(context, stored)).toEqual({ status: "rejected", reason: "notification_preference_reviewer_required" });
    expect(planAdmissionNotificationPreferenceChange(context, stored, { mode: "individual", expectedVersion: 4 }, "2026-10-15T13:00:00.654321Z")).toEqual({ status: "rejected", reason: "notification_preference_reviewer_required" });
  });

  it.each([{ tribeId: "00000000-0000-4000-8000-000000000002" }, { recipientUserId: "another-account" }])("should reject a foreign preference when its original scope differs by %o", (scope) => {
    const context = createReviewerContext(), stored = createStoredPreference(scope);
    expect(resolveAdmissionNotificationPreference(context, stored)).toEqual({ status: "rejected", reason: "notification_preference_scope_mismatch" });
    expect(planAdmissionNotificationPreferenceChange(context, stored, { mode: "individual", expectedVersion: 4 }, "2026-10-15T13:00:00.654321Z")).toEqual({ status: "rejected", reason: "notification_preference_scope_mismatch" });
  });

  it("should plan the first explicit record when the requested choice previously existed only as a role default", () => {
    const context = createReviewerContext(), effectiveFrom = "2026-10-15T13:00:00.654321Z";
    const result = planAdmissionNotificationPreferenceChange(context, null, { mode: "grouped", expectedVersion: 0 }, effectiveFrom);
    expect(result).toEqual({ status: "changed", preference: { tribeId: context.tribeId, recipientUserId: context.recipientUserId, mode: "grouped", version: 1, effectiveFrom } });
  });

  it("should preserve the original version and exact epoch when a confirmed stored choice does not change", () => {
    const stored = createStoredPreference();
    expect(planAdmissionNotificationPreferenceChange(createReviewerContext(), stored, { mode: "grouped", expectedVersion: 4 }, "2026-10-15T13:00:00.654321Z")).toEqual({ status: "unchanged", preference: stored });
  });

  it("should plan the next version with the precise database timestamp when the mode changes", () => {
    const stored = createStoredPreference(), before = { ...stored }, effectiveFrom = "2026-10-15T13:00:00.654321Z";
    const result = planAdmissionNotificationPreferenceChange(createReviewerContext(), stored, { mode: "daily", expectedVersion: 4 }, effectiveFrom);
    expect(result).toEqual({ status: "changed", preference: { ...stored, mode: "daily", version: 5, effectiveFrom } });
    expect(stored).toEqual(before);
  });

  it.each(["grouped", "individual"] satisfies AdmissionNotificationPreferenceMode[])("should reject a stale version before planning even the %s choice", (mode) => {
    expect(planAdmissionNotificationPreferenceChange(createReviewerContext(), createStoredPreference(), { mode, expectedVersion: 3 }, "2026-10-15T13:00:00.654321Z")).toEqual({ status: "rejected", reason: "notification_preference_version_conflict" });
  });

  it("should require the original implicit version when another command tries to create the first explicit preference", () => {
    expect(planAdmissionNotificationPreferenceChange(createReviewerContext(), null, { mode: "individual", expectedVersion: 1 }, "2026-10-15T13:00:00.654321Z")).toEqual({ status: "rejected", reason: "notification_preference_version_conflict" });
  });
});
