/** Exercises current-account email trust without deriving it from a phone, generic flag or another scope. @module admission-notification-recipient-email-test */
import { describe, expect, it } from "vitest";
import type { AdmissionNotificationRecipientEmailFacts } from "@/src/modules/notifications/domain/entities/admission-notification-recipient-email";
import { resolveAdmissionNotificationRecipientEmail } from "@/src/modules/notifications/domain/policies/admission-notification-recipient-email";

/** @returns Fresh server-owned applicant, original notice and current linked Google capture facts. */
function facts(): AdmissionNotificationRecipientEmailFacts {
  return {
    scope: { tribeId: "tribe-one", obligationId: "obligation-one", recipientUserId: "applicant-one", audience: "applicant" },
    source: { tribeId: "tribe-one", obligationId: "obligation-one", admissionRequestId: "request-one", applicantUserId: "applicant-one", event: "approved", noticeRecipientUserId: "applicant-one", noticeAudience: "applicant", evidenceKind: "none", proofId: null, contactType: null, normalizedContact: null },
    account: { userId: "applicant-one", normalizedEmail: "account@gmail.com", currentRole: null, membershipStatus: null },
    globalEvidence: [{ userId: "applicant-one", accountUserId: "applicant-one", accountId: "account-one", evidenceAccountId: "account-one", providerId: "google", accountSubject: "subject-one", evidenceSubject: "subject-one", normalizedEmail: "account@gmail.com", classification: "gmail", invalidated: false, verifiedInPast: true }],
    localProof: null,
    runtime: { environment: "environment-one", securityEpoch: "security-one" },
  };
}

/** @returns A historical applied email proof that remains valid only for its exact original account/request/tribe. */
function localFacts(): AdmissionNotificationRecipientEmailFacts {
  const input = facts();
  return { ...input, globalEvidence: [], source: { ...input.source, evidenceKind: "local", proofId: "proof-one", contactType: "email", normalizedContact: input.account.normalizedEmail }, localProof: { id: "proof-one", userId: input.account.userId, tribeId: input.scope.tribeId, appliedRequestId: input.source.admissionRequestId, contactType: "email", normalizedContact: input.account.normalizedEmail, purpose: "admission", status: "applied", invalidated: false, verifiedInPast: true, appliedInPast: true, environment: input.runtime.environment, securityEpoch: input.runtime.securityEpoch, resourceSecurityEpoch: input.runtime.securityEpoch } };
}

describe("admission notification recipient email", () => {
  it.each(["gmail", "workspace"] as const)("should select the current account email backed by current %s capture", (classification) => {
    const input = facts();
    const email = classification === "gmail" ? "account@gmail.com" : "account@workspace.example";
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, account: { ...input.account, normalizedEmail: email }, globalEvidence: [{ ...input.globalEvidence[0], classification, normalizedEmail: email }] })).toEqual({ ...input.scope, normalizedEmail: email });
  });

  it("should retain an applied local email proof only in its original context without another freshness window", () => {
    const input = localFacts();
    expect(resolveAdmissionNotificationRecipientEmail(input)).toEqual({ ...input.scope, normalizedEmail: input.account.normalizedEmail });
  });

  it("should keep an unproved account email unavailable despite a generic verified flag and an applied phone proof", () => {
    const input = localFacts();
    const untrusted = { ...input, account: { ...input.account, emailVerified: true }, source: { ...input.source, contactType: "phone", normalizedContact: "+5491155501234" }, localProof: { ...input.localProof!, contactType: "phone", normalizedContact: "+5491155501234" } };
    expect(resolveAdmissionNotificationRecipientEmail(untrusted)).toBeNull();
  });

  it("should use independently captured account email even when the request verified a phone", () => {
    const input = facts();
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, source: { ...input.source, contactType: "phone", normalizedContact: "+5491155501234" } })).toEqual({ ...input.scope, normalizedEmail: input.account.normalizedEmail });
  });

  it.each([
    ["invalidated", { invalidated: true }],
    ["insufficient", { classification: "insufficient" }],
    ["another capture user", { userId: "another-account" }],
    ["another linked user", { accountUserId: "another-account" }],
    ["another linked account", { evidenceAccountId: "another-link" }],
    ["another provider", { providerId: "another-provider" }],
    ["another subject", { evidenceSubject: "another-subject" }],
    ["another email", { normalizedEmail: "another@gmail.com" }],
    ["future verification", { verifiedInPast: false }],
  ] as const)("should reject a global capture with %s", (_label, change) => {
    const input = facts();
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, globalEvidence: [{ ...input.globalEvidence[0], ...change }] })).toBeNull();
  });

  it.each([
    ["another proof", { id: "another-proof" }],
    ["another account", { userId: "another-account" }],
    ["another tribe", { tribeId: "another-tribe" }],
    ["another request", { appliedRequestId: "another-request" }],
    ["another contact", { normalizedContact: "another@gmail.com" }],
    ["phone", { contactType: "phone" }],
    ["diagnostic purpose", { purpose: "connection_diagnostic" }],
    ["available state", { status: "available" }],
    ["invalidated state", { invalidated: true }],
    ["future verification", { verifiedInPast: false }],
    ["future application", { appliedInPast: false }],
    ["another environment", { environment: "another-environment" }],
    ["another security epoch", { securityEpoch: "another-security" }],
    ["another source security epoch", { resourceSecurityEpoch: "another-security" }],
  ] as const)("should reject an applied local proof with %s", (_label, change) => {
    const input = localFacts();
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, localProof: { ...input.localProof!, ...change } })).toBeNull();
  });

  it.each([
    ["another source tribe", { tribeId: "another-tribe" }],
    ["another obligation", { obligationId: "another-obligation" }],
    ["another recipient", { noticeRecipientUserId: "another-account" }],
    ["another notice audience", { noticeAudience: "reviewer" }],
    ["another applicant", { applicantUserId: "another-account" }],
  ] as const)("should reject an original notice with %s", (_label, change) => {
    const input = facts();
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, source: { ...input.source, ...change } })).toBeNull();
  });

  it("should reject a local source whose recorded request contact differs from the account email", () => {
    const input = localFacts();
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, source: { ...input.source, normalizedContact: "another@gmail.com" } })).toBeNull();
  });

  it.each(["leader", "guardian"])("should allow current %s email without letting an omitted email preference alter trust", (role) => {
    const input = facts();
    const reviewer = { ...input, scope: { ...input.scope, audience: "reviewer" as const }, source: { ...input.source, event: "pending_created" as const, noticeAudience: "reviewer" as const }, account: { ...input.account, currentRole: role, membershipStatus: "active" } };
    expect(resolveAdmissionNotificationRecipientEmail(reviewer)).toEqual({ ...reviewer.scope, normalizedEmail: input.account.normalizedEmail });
  });

  it.each([["tribemate", "active"], ["guardian", "muted"], ["leader", "removed"]])("should reject reviewer email after current role %s or status %s changes", (role, status) => {
    const input = facts();
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, scope: { ...input.scope, audience: "reviewer" }, source: { ...input.source, event: "pending_created", noticeAudience: "reviewer" }, account: { ...input.account, currentRole: role, membershipStatus: status } })).toBeNull();
  });

  it("should not turn an applicant applied proof into reviewer email authority", () => {
    const input = localFacts();
    expect(resolveAdmissionNotificationRecipientEmail({ ...input, scope: { ...input.scope, audience: "reviewer" }, source: { ...input.source, event: "pending_created", noticeAudience: "reviewer" }, account: { ...input.account, currentRole: "leader", membershipStatus: "active" } })).toBeNull();
  });

  it("should project only current destination and scope without source notes, claims or credentials", () => {
    const input = { ...facts(), internalReason: "Private synthetic note", credential: "Private synthetic canary" };
    expect(resolveAdmissionNotificationRecipientEmail(input)).toEqual({ ...input.scope, normalizedEmail: input.account.normalizedEmail });
  });
});
