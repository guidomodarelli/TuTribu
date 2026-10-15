/** Exercises original admission audiences, precise cuts and immutable group manifests. @module admission-notification-groups-test */
import { describe, expect, it } from "vitest";
import { createAdmissionNotificationWindow, createAdmissionNotificationGroupKey, freezeAdmissionNotificationGroup, planAdmissionNotificationEmailCandidate, isAdmissionNotificationReminderDue } from "@/src/modules/notifications/domain/policies/admission-notification-groups";
import type { AdmissionNotificationEmailFacts, AdmissionNotificationEmailCandidate } from "@/src/modules/notifications/domain/entities/admission-notification";

/** @param overrides - Current server-owned facts changed by one scenario. @returns A real-domain candidate context without an address, note, template or SDK payload. */
function facts(overrides: Partial<AdmissionNotificationEmailFacts> = {}): AdmissionNotificationEmailFacts {
  return {
    nowMicroseconds: 1_792_080_100_123_456,
    source: { id: "obligation-one", tribeId: "tribe-one", admissionRequestId: "request-one", applicantUserId: "applicant-one", event: "pending_created", createdAtMicroseconds: 1_792_080_000_123_456 },
    request: { id: "request-one", tribeId: "tribe-one", applicantUserId: "applicant-one", status: "pending", submittedAtMicroseconds: 1_791_734_400_123_456, expiresAtMicroseconds: 1_794_672_000_123_456 },
    recipient: { userId: "reviewer-one", audience: "reviewer", currentRole: "leader", membershipStatus: "active", preference: { tribeId: "tribe-one", recipientUserId: "reviewer-one", mode: "grouped", version: 1, effectiveFromMicroseconds: 1_792_079_000_123_456 } },
    emailSettings: { tribeId: "tribe-one", enabled: true, version: 2, enabledAtMicroseconds: 1_792_078_000_123_456, timeZone: "America/Argentina/Buenos_Aires" },
    availability: { tribeId: "tribe-one", recipientUserId: "reviewer-one", trustedAccountEmailAvailable: true, preparedEmailConnectionAvailable: true },
    dailyWindow: null,
    ...overrides,
  };
}

/** @param input - Current server-owned policy facts. @returns Its explicitly admitted private grouping candidate. */
function candidate(input: AdmissionNotificationEmailFacts = facts()): AdmissionNotificationEmailCandidate {
  const result = planAdmissionNotificationEmailCandidate(input);
  if (result.status !== "candidate") throw new Error(`Synthetic notice candidate rejected: ${result.reason}`);
  return result.candidate;
}

describe("admission notification grouping policy", () => {
  // Windows are based on the fresh materialization clock, so late facts never append to a closed intent.
  it("should close five-minute windows exactly at the boundary and retain microsecond cuts", () => {
    expect(createAdmissionNotificationWindow("grouped", 300_000_000 - 1, "UTC", null)).toEqual({ startsAtMicroseconds: 0, closesAtMicroseconds: 300_000_000, timeZone: "UTC" });
    expect(createAdmissionNotificationWindow("grouped", 300_000_000, "UTC", null)).toEqual({ startsAtMicroseconds: 300_000_000, closesAtMicroseconds: 600_000_000, timeZone: "UTC" });
    const current = facts();
    expect(planAdmissionNotificationEmailCandidate({ ...current, emailSettings: { ...current.emailSettings, enabledAtMicroseconds: current.source.createdAtMicroseconds + 1 } })).toEqual({ status: "suppressed", reason: "event_predates_email_enablement" });
    expect(planAdmissionNotificationEmailCandidate({ ...current, recipient: { ...current.recipient, preference: { ...current.recipient.preference!, effectiveFromMicroseconds: current.source.createdAtMicroseconds + 1 } } })).toEqual({ status: "suppressed", reason: "event_predates_preference" });
    expect(planAdmissionNotificationEmailCandidate({ ...current, emailSettings: { ...current.emailSettings, enabledAtMicroseconds: current.source.createdAtMicroseconds } }).status).toBe("candidate");
  });

  it.each([
    ["email disabled", (input: AdmissionNotificationEmailFacts) => ({ ...input, emailSettings: { ...input.emailSettings, enabled: false } }), "email_disabled"],
    ["email untrusted", (input: AdmissionNotificationEmailFacts) => ({ ...input, availability: { ...input.availability, trustedAccountEmailAvailable: false } }), "account_email_untrusted"],
    ["email capability absent", (input: AdmissionNotificationEmailFacts) => ({ ...input, availability: { ...input.availability, preparedEmailConnectionAvailable: false } }), "email_capability_unavailable"],
    ["reviewer removed", (input: AdmissionNotificationEmailFacts) => ({ ...input, recipient: { ...input.recipient, membershipStatus: "removed" } }), "recipient_not_authorized"],
    ["reviewer demoted", (input: AdmissionNotificationEmailFacts) => ({ ...input, recipient: { ...input.recipient, currentRole: "tribemate" } }), "recipient_not_authorized"],
    ["preference omitted", (input: AdmissionNotificationEmailFacts) => ({ ...input, recipient: { ...input.recipient, preference: { ...input.recipient.preference!, mode: "omitted" as const } } }), "preference_omitted"],
    ["pending resolved", (input: AdmissionNotificationEmailFacts) => ({ ...input, request: { ...input.request, status: "approved" } }), "event_not_current"],
    ["pending expired", (input: AdmissionNotificationEmailFacts) => ({ ...input, request: { ...input.request, expiresAtMicroseconds: input.nowMicroseconds } }), "event_not_current"],
    ["24-hour deadline reached", (input: AdmissionNotificationEmailFacts) => ({ ...input, nowMicroseconds: input.source.createdAtMicroseconds + 86_400_000_000 }), "notification_deadline_expired"],
  ] as const)("should suppress a candidate when %s without weakening internal notice authority", (_scenario, change, reason) => {
    // Given current private facts, not browser permission flags.
    expect(planAdmissionNotificationEmailCandidate(change(facts()))).toEqual({ status: "suppressed", reason });
  });

  it.each(["request", "recipient preference", "availability", "email settings"])("should reject crossed %s scope before constructing a group", (scope) => {
    const input = facts();
    const changed = scope === "request" ? { ...input, request: { ...input.request, tribeId: "other-tribe" } }
      : scope === "recipient preference" ? { ...input, recipient: { ...input.recipient, preference: { ...input.recipient.preference!, recipientUserId: "other-account" } } }
      : scope === "availability" ? { ...input, availability: { ...input.availability, recipientUserId: "other-account" } }
      : { ...input, emailSettings: { ...input.emailSettings, tribeId: "other-tribe" } };
    expect(planAdmissionNotificationEmailCandidate(changed)).toEqual({ status: "suppressed", reason: "notification_scope_mismatch" });
  });

  it("should plan an individual resolution for the actual applicant when the trusted email owner reports availability", () => {
    const input = facts();
    const source = { ...input.source, event: "approved" as const, internalReason: "Private synthetic reviewer note", normalizedContact: "canary@example.invalid" };
    const result = planAdmissionNotificationEmailCandidate({ ...input, source, request: { ...input.request, status: "approved" }, recipient: { userId: input.source.applicantUserId, audience: "applicant", currentRole: null, membershipStatus: null, preference: null }, availability: { ...input.availability, recipientUserId: input.source.applicantUserId } });
    expect(result).toMatchObject({ status: "candidate", candidate: { identity: { audience: "applicant", mode: "individual", recipientUserId: "applicant-one", individualObligationId: "obligation-one" } } });
    expect(JSON.stringify(result)).not.toMatch(/@|internalReason|normalizedContact|template|apiKey/u);
    expect(planAdmissionNotificationEmailCandidate({ ...input, source: { ...input.source, event: "approved" }, request: { ...input.request, status: "approved" } })).toEqual({ status: "suppressed", reason: "recipient_not_authorized" });
  });

  it.each([{ role: "leader", expected: "candidate" }, { role: "guardian", expected: "suppressed" }])("should honor the implicit $role default without persisting a preference", ({ role, expected }) => {
    const input = facts();
    expect(planAdmissionNotificationEmailCandidate({ ...input, recipient: { ...input.recipient, currentRole: role, preference: null } }).status).toBe(expected);
  });

  it("should keep pending confirmations internal for applicants and reject another account's resolution", () => {
    const input = facts(), recipient = { userId: input.source.applicantUserId, audience: "applicant" as const, currentRole: null, membershipStatus: null, preference: null };
    expect(planAdmissionNotificationEmailCandidate({ ...input, recipient, availability: { ...input.availability, recipientUserId: recipient.userId } })).toEqual({ status: "suppressed", reason: "recipient_not_authorized" });
    expect(planAdmissionNotificationEmailCandidate({ ...input, source: { ...input.source, event: "rejected" }, request: { ...input.request, status: "rejected" }, recipient: { ...recipient, userId: "other-applicant" }, availability: { ...input.availability, recipientUserId: "other-applicant" } })).toEqual({ status: "suppressed", reason: "recipient_not_authorized" });
  });

  it("should mark a reminder due only after three days while the request remains pending and unexpired", () => {
    const input = facts(), boundary = input.request.submittedAtMicroseconds + 259_200_000_000;
    expect(isAdmissionNotificationReminderDue(input.request, boundary - 1)).toBe(false);
    expect(isAdmissionNotificationReminderDue(input.request, boundary)).toBe(true);
    expect(isAdmissionNotificationReminderDue({ ...input.request, status: "approved" }, boundary)).toBe(false);
    expect(isAdmissionNotificationReminderDue({ ...input.request, expiresAtMicroseconds: boundary }, boundary)).toBe(false);
    expect(planAdmissionNotificationEmailCandidate({ ...input, nowMicroseconds: boundary - 1, source: { ...input.source, event: "reminder", createdAtMicroseconds: boundary - 2 }, emailSettings: { ...input.emailSettings, enabledAtMicroseconds: boundary - 10 }, recipient: { ...input.recipient, preference: { ...input.recipient.preference!, effectiveFromMicroseconds: boundary - 10 } } })).toEqual({ status: "suppressed", reason: "event_not_current" });
  });

  it("should preserve the original 24-hour deadline when a late event moves into the current grouping window", () => {
    const input = facts(), first = candidate(input), later = candidate({ ...input, nowMicroseconds: first.identity.window.closesAtMicroseconds });
    expect(later.identity.window.startsAtMicroseconds).toBe(first.identity.window.closesAtMicroseconds);
    expect(later.deadlineAtMicroseconds).toBe(first.deadlineAtMicroseconds);
    expect(createAdmissionNotificationGroupKey(later.identity)).not.toBe(createAdmissionNotificationGroupKey(first.identity));
  });

  it("should retain the same individual identity on replay at a later materialization clock", () => {
    const input = facts(), recipient = { ...input.recipient, preference: { ...input.recipient.preference!, mode: "individual" as const } };
    const first = candidate({ ...input, recipient }), later = candidate({ ...input, recipient, nowMicroseconds: input.nowMicroseconds + 1 });
    expect(createAdmissionNotificationGroupKey(later.identity)).toBe(createAdmissionNotificationGroupKey(first.identity));
  });

  it("should revalidate a closed original bucket without moving its members into the next window or reviving a changed preference", () => {
    const input = facts(), original = candidate(input), fresh = { ...input, nowMicroseconds: original.identity.window.closesAtMicroseconds };
    const result = planAdmissionNotificationEmailCandidate(fresh, original.identity);
    expect(result).toMatchObject({ status: "candidate", candidate: { identity: original.identity } });
    expect(planAdmissionNotificationEmailCandidate({ ...fresh, recipient: { ...fresh.recipient, preference: { ...fresh.recipient.preference!, version: 2 } } }, original.identity)).toEqual({ status: "suppressed", reason: "notification_scope_mismatch" });
    expect(planAdmissionNotificationEmailCandidate({ ...fresh, recipient: { ...fresh.recipient, currentRole: "tribemate" } }, original.identity)).toEqual({ status: "suppressed", reason: "recipient_not_authorized" });
  });

  it("should honor a native daily nine-o'clock window without extending an event's retry limit", () => {
    const input = facts(), dailyWindow = { startsAtMicroseconds: input.nowMicroseconds - 1, closesAtMicroseconds: input.nowMicroseconds + 3_600_000_000, timeZone: "America/New_York" };
    const recipient = { ...input.recipient, preference: { ...input.recipient.preference!, mode: "daily" as const } };
    expect(planAdmissionNotificationEmailCandidate({ ...input, recipient, dailyWindow, emailSettings: { ...input.emailSettings, timeZone: dailyWindow.timeZone } })).toMatchObject({ status: "candidate", candidate: { identity: { mode: "daily", window: dailyWindow } } });
    expect(planAdmissionNotificationEmailCandidate({ ...input, recipient, dailyWindow: { ...dailyWindow, closesAtMicroseconds: input.source.createdAtMicroseconds + 86_400_000_000 }, emailSettings: { ...input.emailSettings, timeZone: dailyWindow.timeZone } })).toEqual({ status: "suppressed", reason: "deadline_before_preferred_window" });
  });

  it("should keep group identities distinct across recipients, tribes, preferences, enablement and individual events", () => {
    const identity = candidate().identity, key = createAdmissionNotificationGroupKey(identity);
    const variants = [{ ...identity, recipientUserId: "other" }, { ...identity, tribeId: "other" }, { ...identity, preferenceVersion: identity.preferenceVersion + 1 }, { ...identity, emailSettingsVersion: identity.emailSettingsVersion + 1 }, { ...identity, window: { ...identity.window, timeZone: "UTC" } }];
    expect(new Set([key, ...variants.map(createAdmissionNotificationGroupKey)]).size).toBe(variants.length + 1);
    const individual = { ...identity, mode: "individual" as const, individualObligationId: "one" };
    expect(createAdmissionNotificationGroupKey(individual)).not.toBe(createAdmissionNotificationGroupKey({ ...individual, individualObligationId: "two" }));
  });

  it("should freeze one ordered minimal manifest after close and preserve the earliest live event deadline", () => {
    const input = facts(), first = candidate(input), second = candidate({ ...input, source: { ...input.source, id: "obligation-two", admissionRequestId: "request-two", createdAtMicroseconds: input.source.createdAtMicroseconds + 1 }, request: { ...input.request, id: "request-two" } });
    const before = JSON.stringify([first, second]);
    expect(freezeAdmissionNotificationGroup(first.identity, [second, first], first.identity.window.closesAtMicroseconds - 1)).toEqual({ status: "not_due" });
    const result = freezeAdmissionNotificationGroup(first.identity, [second, first], first.identity.window.closesAtMicroseconds);
    expect(result).toMatchObject({ status: "frozen", deadlineAtMicroseconds: first.deadlineAtMicroseconds, manifest: { format: 1, items: [{ obligationId: "obligation-one", admissionRequestId: "request-one" }, { obligationId: "obligation-two", admissionRequestId: "request-two" }] } });
    expect(JSON.stringify(result)).not.toMatch(/@|internalReason|normalizedContact|template|apiKey/u);
    expect(JSON.stringify([first, second])).toBe(before);
  });

  it("should reject mixed or repeated logical sources instead of silently merging them", () => {
    const first = candidate(), now = first.identity.window.closesAtMicroseconds;
    expect(freezeAdmissionNotificationGroup(first.identity, [first, first], now)).toEqual({ status: "rejected", reason: "duplicate_notification_obligation" });
    expect(freezeAdmissionNotificationGroup(first.identity, [{ ...first, identity: { ...first.identity, recipientUserId: "other" } }], now)).toEqual({ status: "rejected", reason: "notification_scope_mismatch" });
    expect(freezeAdmissionNotificationGroup(first.identity, [], now)).toEqual({ status: "empty" });
  });

  it("should leave expired items visible as expired and freeze only the remaining live subset", () => {
    const first = candidate(), now = first.deadlineAtMicroseconds;
    const second = { ...first, obligationId: "obligation-two", admissionRequestId: "request-two", deadlineAtMicroseconds: now + 1 };
    expect(freezeAdmissionNotificationGroup(first.identity, [first], now)).toEqual({ status: "expired", expiredObligationIds: [first.obligationId] });
    expect(freezeAdmissionNotificationGroup(first.identity, [first, second], now)).toMatchObject({ status: "frozen", deadlineAtMicroseconds: now + 1, expiredObligationIds: [first.obligationId], manifest: { items: [{ obligationId: "obligation-two" }] } });
  });
});
