/** Exercises complete frozen-group authority independently of provider or persistence details. @module admission-notification-group-authority-tests */
import { describe, expect, it } from "vitest";
import { freezeAdmissionNotificationGroup } from "@/src/modules/notifications/domain/policies/admission-notification-groups";
import { admissionNotificationManifestsMatch, resolveAdmissionNotificationGroupAuthority } from "@/src/modules/notifications/domain/policies/admission-notification-group-authority";
import type { AdmissionNotificationEmailCandidate, AdmissionNotificationSuppressionReason } from "@/src/modules/notifications/domain/entities/admission-notification";
import type { AdmissionNotificationStoredGroup } from "@/src/modules/notifications/domain/entities/admission-notification-group";
import type { AdmissionNotificationGroupAuthorityMember, AdmissionNotificationGroupAuthorityScope } from "@/src/modules/notifications/domain/entities/admission-notification-group-authority";

/** @returns A genuine domain freeze containing two distinct originals and exact sub-millisecond deadlines. */
function fixture() {
  const now = 1_792_080_500_123_456;
  const identity = { tribeId: "tribe-a", recipientUserId: "reviewer-a", audience: "reviewer" as const, mode: "grouped" as const, preferenceVersion: 1, emailSettingsVersion: 2, individualObligationId: null, window: { startsAtMicroseconds: 1_792_080_000_000_000, closesAtMicroseconds: 1_792_080_300_000_000, timeZone: "UTC" } };
  const candidates: AdmissionNotificationEmailCandidate[] = [{ identity, obligationId: "obligation-a", admissionRequestId: "request-a", event: "pending_created", createdAtMicroseconds: 1_792_080_000_123_456, deadlineAtMicroseconds: 1_792_166_400_123_456 }, { identity, obligationId: "obligation-b", admissionRequestId: "request-b", event: "reminder", createdAtMicroseconds: 1_792_080_000_123_457, deadlineAtMicroseconds: 1_792_166_400_123_457 }];
  const frozen = freezeAdmissionNotificationGroup(identity, candidates, now);
  if (frozen.status !== "frozen") throw new Error("Synthetic authority fixture did not freeze");
  const group: AdmissionNotificationStoredGroup = { id: "group-a", identity, state: "frozen", version: 2, frozenManifest: frozen.manifest, deadlineAtMicroseconds: frozen.deadlineAtMicroseconds, suppressionReason: null, closedAtMicroseconds: now, createdAtMicroseconds: identity.window.startsAtMicroseconds };
  const scope: AdmissionNotificationGroupAuthorityScope = { tribeId: identity.tribeId, groupId: group.id, recipientUserId: identity.recipientUserId, audience: identity.audience };
  const members: AdmissionNotificationGroupAuthorityMember[] = candidates.map((candidate) => ({ obligationId: candidate.obligationId, plan: { status: "candidate", candidate } }));
  return { now, group, scope, members, candidates, manifest: frozen.manifest };
}

describe("current complete frozen-group authority", () => {
  it("should retain the entire manifest and exact earliest original deadline", () => {
    const current = fixture();
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, current.members, current.now)).toEqual({ status: "current", manifest: current.manifest, deadlineAtMicroseconds: 1_792_166_400_123_456 });
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, [...current.members].reverse(), current.now).status).toBe("current");
  });

  it.each(["tribeId", "groupId", "recipientUserId"] as const)("should deny a crossed original %s", (field) => {
    const current = fixture();
    expect(resolveAdmissionNotificationGroupAuthority({ ...current.scope, [field]: "other" }, current.group, current.members, current.now)).toEqual({ status: "denied", reason: "notification_scope_mismatch" });
  });

  it("should deny another audience and a removed original group", () => {
    const current = fixture();
    expect(resolveAdmissionNotificationGroupAuthority({ ...current.scope, audience: "applicant" }, current.group, current.members, current.now)).toEqual({ status: "denied", reason: "notification_scope_mismatch" });
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, null, current.members, current.now)).toEqual({ status: "denied", reason: "notification_group_unavailable" });
  });

  it.each(["open", "suppressed", "expired"] as const)("should deny an original group currently %s", (state) => {
    const current = fixture();
    const closedReason = state === "expired" ? "notification_deadline_expired" : "email_disabled";
    const group: AdmissionNotificationStoredGroup = { ...current.group, state, version: state === "open" ? 1 : 2, frozenManifest: null, deadlineAtMicroseconds: null, suppressionReason: state === "open" ? null : closedReason, closedAtMicroseconds: state === "open" ? null : current.now };
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, group, current.members, current.now)).toEqual({ status: "denied", reason: "notification_group_not_frozen" });
  });

  it.each(["recipient_not_authorized", "preference_omitted", "account_email_untrusted", "email_disabled", "email_capability_unavailable", "event_not_current"] as const)("should deny the whole original when the second member is %s", (reason: AdmissionNotificationSuppressionReason) => {
    const current = fixture();
    const second: AdmissionNotificationGroupAuthorityMember = { ...current.members[1], plan: { status: "suppressed", reason } };
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, [current.members[0], second], current.now)).toEqual({ status: "denied", reason });
  });

  it("should refuse a missing second source instead of authorizing from the first remaining obligation", () => {
    const current = fixture();
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, [current.members[0]], current.now)).toEqual({ status: "denied", reason: "notification_group_manifest_changed" });
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, [], current.now)).toEqual({ status: "denied", reason: "notification_group_manifest_changed" });
  });

  it("should refuse a duplicate or added source and a crossed member identity", () => {
    const current = fixture();
    const added: AdmissionNotificationGroupAuthorityMember = { obligationId: "obligation-c", plan: { status: "candidate", candidate: { ...current.candidates[1], obligationId: "obligation-c", admissionRequestId: "request-c" } } };
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, [...current.members, current.members[0]], current.now)).toEqual({ status: "denied", reason: "notification_group_manifest_changed" });
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, [...current.members, added], current.now)).toEqual({ status: "denied", reason: "notification_group_manifest_changed" });
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, [{ ...current.members[0], obligationId: "crossed-source" }, current.members[1]], current.now)).toEqual({ status: "denied", reason: "notification_scope_mismatch" });
  });

  it("should close exactly at the earliest native microsecond even while the next member remains live", () => {
    const current = fixture(), deadline = current.group.deadlineAtMicroseconds!;
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, current.members, deadline - 1).status).toBe("current");
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, current.group, current.members, deadline)).toEqual({ status: "denied", reason: "notification_deadline_expired" });
    expect(resolveAdmissionNotificationGroupAuthority(current.scope, { ...current.group, deadlineAtMicroseconds: deadline + 1 }, current.members, current.now)).toEqual({ status: "denied", reason: "notification_group_manifest_changed" });
  });

  it.each(["obligationId", "admissionRequestId", "event", "createdAtMicroseconds", "deadlineAtMicroseconds"] as const)("should reject changed frozen member %s", (field) => {
    const current = fixture(), item = current.manifest.items[1], value = item[field];
    const changed = { ...current.manifest, items: [current.manifest.items[0], { ...item, [field]: typeof value === "number" ? value + 1 : "changed" }] };
    expect(admissionNotificationManifestsMatch(current.manifest, changed)).toBe(false);
  });

  it("should compare jsonb objects independently of property ordering while preserving the signed array order", () => {
    const current = fixture();
    const reorderedIdentity = Object.fromEntries(Object.entries(current.manifest.identity).reverse()) as typeof current.manifest.identity;
    expect(admissionNotificationManifestsMatch(current.manifest, { ...current.manifest, identity: reorderedIdentity })).toBe(true);
    expect(admissionNotificationManifestsMatch(current.manifest, { ...current.manifest, items: [...current.manifest.items].reverse() })).toBe(false);
    expect(admissionNotificationManifestsMatch(current.manifest, { ...current.manifest, identity: { ...current.manifest.identity, preferenceVersion: 2 } })).toBe(false);
  });
});
