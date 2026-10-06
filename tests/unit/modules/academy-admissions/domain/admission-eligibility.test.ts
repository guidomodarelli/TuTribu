/** @vitest-environment node */

/** Exercises admission, current-policy review, and permission matrices using own facts. */
import { describe, expect, it } from "vitest";

import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import {
  evaluateAdmissionSubmission,
  evaluatePendingAdmissionReview,
  canPerformAdmissionAction,
  type AdmissionSubmissionFacts,
} from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { createAcademyAdmissionFixtures } from "@/tests/support/academy-admission-fixtures";

/** Builds canonical, same-scope facts; every scenario receives detached resources. */
function submissionFacts(): AdmissionSubmissionFacts {
  const fixtures = createAcademyAdmissionFixtures("eligibility");
  const account = fixtures.accounts.applicantA;
  return {
    now: fixtures.clock.now(),
    tribe: { id: fixtures.tribes.academyA.id, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false },
    account: { userId: account.userId, normalizedEmail: account.email, googleAccount: { id: account.accountId, subject: account.providerSubject } },
    policy: { ...createDefaultAdmissionPolicy({ id: "policy", tribeId: fixtures.tribes.academyA.id }), isOpen: true, activatedAt: fixtures.clock.now() },
    source: { kind: "common" },
    contact: { type: "email", value: account.email },
    baseEvidence: { userId: account.userId, accountId: account.accountId, subject: account.providerSubject, normalizedEmail: account.email, authority: "workspace", invalidated: false },
    localProof: null,
    currentConnection: null,
    membership: null,
    allowlistEntry: { tribeId: fixtures.tribes.academyA.id, contact: { type: "email", value: account.email }, enabled: true, boundUserId: null },
    contactBinding: null,
  };
}

describe("new admission evidence and pathway matrix", () => {
  const configurationRows = [
    { mode: "manual_review", contactType: "email", verification: false, commonOutcome: "pending", personalOutcome: "pending" },
    { mode: "manual_review", contactType: "phone", verification: false, commonOutcome: "pending", personalOutcome: "denied" },
    { mode: "allowlist", contactType: "email", verification: false, commonOutcome: "admitted", personalOutcome: "admitted" },
    { mode: "allowlist", contactType: "phone", verification: false, commonOutcome: "denied", personalOutcome: "denied" },
    { mode: "manual_review", contactType: "email", verification: true, commonOutcome: "pending", personalOutcome: "pending" },
    { mode: "manual_review", contactType: "phone", verification: true, commonOutcome: "pending", personalOutcome: "pending" },
    { mode: "allowlist", contactType: "email", verification: true, commonOutcome: "admitted", personalOutcome: "admitted" },
    { mode: "allowlist", contactType: "phone", verification: true, commonOutcome: "admitted", personalOutcome: "admitted" },
  ] as const;
  const pathwayRows = configurationRows.flatMap((configuration) => [
    { ...configuration, source: "common" as const, requiresAllowlist: false, expectedOutcome: configuration.commonOutcome },
    { ...configuration, source: "personal" as const, requiresAllowlist: true, expectedOutcome: configuration.personalOutcome },
    { ...configuration, source: "personal" as const, requiresAllowlist: false, expectedOutcome: configuration.personalOutcome },
  ]);

  it.each(pathwayRows)("should preserve the $mode/$contactType/ON=$verification/$source/list=$requiresAllowlist contract row", (row) => {
    const facts = submissionFacts();
    facts.policy = { ...facts.policy!, mode: row.mode, contactType: row.contactType, requiresAdditionalVerification: row.verification, phoneChannel: row.contactType === "phone" ? "sms" : null };
    if (row.contactType === "phone") facts.contact = { type: "phone", value: "+14155552671", country: "US" };
    facts.allowlistEntry = { tribeId: facts.tribe.id, contact: facts.contact!, enabled: true, boundUserId: null };
    if (row.verification) {
      facts.currentConnection = { id: "selected-connection", version: 1, securityEpoch: "external-epoch" };
      facts.policy.messagingConnectionId = facts.currentConnection.id;
      facts.policy.messagingConnectionVersion = facts.currentConnection.version;
      facts.localProof = { id: "fresh-proof", appliedRequestId: null, userId: facts.account!.userId, tribeId: facts.tribe.id, contact: facts.contact!, purpose: "admission", verificationEpoch: facts.policy.verificationEpoch, connectionId: facts.currentConnection.id, connectionVersion: facts.currentConnection.version, securityEpoch: facts.currentConnection.securityEpoch, status: "available", verifiedAt: facts.now, applyBefore: new Date(facts.now.getTime() + 900_000) };
    }
    if (row.source === "personal") {
      facts.source = { kind: "personal", invitation: { tribeId: facts.tribe.id, contact: facts.contact!, requiresAllowlist: row.requiresAllowlist, status: "active", authorizationRevoked: false, expiresAt: null } };
      if (!row.requiresAllowlist) facts.allowlistEntry = null;
    }
    const result = evaluateAdmissionSubmission(facts);
    expect(result.outcome).toBe(row.expectedOutcome);
    if (row.contactType === "phone" && !row.verification && row.source === "common" && result.outcome === "pending") expect(result).toMatchObject({ evidenceKind: "declared", bindContact: false });
    if (row.verification && result.outcome !== "denied") expect(result).toMatchObject({ evidenceKind: "local" });
  });

  it.each([
    { mode: "allowlist", source: "common", requiresAllowlist: true, outcome: "admitted" },
    { mode: "allowlist", source: "personal", requiresAllowlist: true, outcome: "admitted" },
    { mode: "allowlist", source: "personal", requiresAllowlist: false, outcome: "admitted" },
    { mode: "manual_review", source: "common", requiresAllowlist: false, outcome: "pending" },
    { mode: "manual_review", source: "personal", requiresAllowlist: true, outcome: "pending" },
    { mode: "manual_review", source: "personal", requiresAllowlist: false, outcome: "pending" },
  ] as const)("should follow $mode/$source/list=$requiresAllowlist after evidence is satisfied", (row) => {
    // Arrange.
    const facts = submissionFacts();
    facts.policy = { ...facts.policy!, mode: row.mode };
    if (row.source === "personal") facts.source = {
      kind: "personal",
      invitation: { tribeId: facts.tribe.id, contact: facts.contact!, requiresAllowlist: row.requiresAllowlist, status: "active", authorizationRevoked: false, expiresAt: null },
    };

    // Act and assert.
    expect(evaluateAdmissionSubmission(facts).outcome).toBe(row.outcome);
  });

  it("should permit manual common admission without contact authority when verification is off", () => {
    const facts = submissionFacts();
    facts.baseEvidence = null;
    facts.contact = null;
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "pending", evidenceKind: "none" });
  });

  it("should leave membership, evidence, policy and contact snapshots unchanged when reading eligibility", () => {
    const facts = submissionFacts();
    const original = structuredClone(facts);
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "pending" });
    expect(evaluatePendingAdmissionReview({ ...facts, request: { id: "pending-request", userId: facts.account!.userId, expiresAt: new Date(facts.now.getTime() + 60_000), source: facts.source, attachedEvidence: null }, reviewer: { userId: "leader", tribeId: facts.tribe.id, role: "leader", status: "active" } })).toMatchObject({ eligible: true });
    expect(facts).toEqual(original);
  });

  it("should offer an exception only when common allowlist policy explicitly permits it", () => {
    const facts = submissionFacts();
    facts.baseEvidence = null;
    facts.policy = { ...facts.policy!, mode: "allowlist" };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "denied", reason: "allowlist_requirement_unmet" });
    facts.policy.allowCommonExceptions = true;
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "pending", requiresExceptionReason: true });
  });

  it("should never reinterpret a personal invitation as common when its recipient is not proven", () => {
    const facts = submissionFacts();
    facts.policy = { ...facts.policy!, mode: "allowlist", allowCommonExceptions: true };
    facts.baseEvidence = null;
    facts.source = { kind: "personal", invitation: { tribeId: facts.tribe.id, contact: facts.contact!, requiresAllowlist: false, status: "active", authorizationRevoked: false, expiresAt: null } };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "denied", reason: "invitation_recipient_unproven" });
  });

  it.each(["account", "subject", "email", "authority", "invalidated"] as const)(
    "should deny automatic matching when current base evidence differs by %s", (changed) => {
      const facts = submissionFacts();
      facts.policy = { ...facts.policy!, mode: "allowlist" };
      if (changed === "account") facts.baseEvidence!.accountId = "another-account";
      if (changed === "subject") facts.baseEvidence!.subject = "another-subject";
      if (changed === "email") facts.baseEvidence!.normalizedEmail = "changed@example.invalid";
      if (changed === "authority") facts.baseEvidence!.authority = "insufficient";
      if (changed === "invalidated") facts.baseEvidence!.invalidated = true;
      expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "denied", reason: "allowlist_requirement_unmet" });
    },
  );

  it("should reject email substitution when it differs from the server-owned current account email", () => {
    const facts = submissionFacts();
    facts.contact = { type: "email", value: "somebody-else@example.invalid" };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "denied", reason: "contact_account_mismatch" });
  });

  it("should require local evidence even when Google email authority is present and verification is on", () => {
    const facts = submissionFacts();
    facts.policy!.requiresAdditionalVerification = true;
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "verification_required" });
  });

  it.each(["user", "tribe", "purpose", "epoch", "connection", "version", "security", "applied", "expired"] as const)(
    "should reject new local proof when its %s scope is not current", (changed) => {
      const facts = submissionFacts();
      facts.policy!.requiresAdditionalVerification = true;
      facts.currentConnection = { id: "connection", version: 1, securityEpoch: "security" };
      facts.localProof = {
        id: "proof", appliedRequestId: null,
        userId: facts.account!.userId, tribeId: facts.tribe.id, contact: facts.contact!,
        purpose: "admission", verificationEpoch: facts.policy!.verificationEpoch,
        connectionId: "connection", connectionVersion: 1, securityEpoch: "security",
        status: "available", verifiedAt: facts.now, applyBefore: new Date(facts.now.getTime() + 900_000),
      };
      if (changed === "user") facts.localProof.userId = "other";
      if (changed === "tribe") facts.localProof.tribeId = "other";
      if (changed === "purpose") facts.localProof.purpose = "connection_diagnostic";
      if (changed === "epoch") facts.localProof.verificationEpoch += 1;
      if (changed === "connection") facts.localProof.connectionId = "other";
      if (changed === "version") facts.localProof.connectionVersion += 1;
      if (changed === "security") facts.localProof.securityEpoch = "other";
      if (changed === "applied") facts.localProof.status = "applied";
      if (changed === "expired") facts.localProof.applyBefore = facts.now;
      expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "verification_required" });
    },
  );

  it("should accept a valid phone proof without requiring dispatch country settings again", () => {
    const facts = submissionFacts();
    facts.policy = { ...facts.policy!, mode: "allowlist", contactType: "phone", requiresAdditionalVerification: true, phoneChannel: "sms" };
    facts.contact = { type: "phone", value: "+12025550123", country: "US" };
    facts.currentConnection = { id: "connection", version: 1, securityEpoch: "security" };
    facts.localProof = { id: "proof", appliedRequestId: null, userId: facts.account!.userId, tribeId: facts.tribe.id, contact: facts.contact, purpose: "admission", verificationEpoch: facts.policy.verificationEpoch, connectionId: "connection", connectionVersion: 1, securityEpoch: "security", status: "available", verifiedAt: facts.now, applyBefore: new Date(facts.now.getTime() + 900_000) };
    facts.allowlistEntry = { tribeId: facts.tribe.id, contact: facts.contact, enabled: true, boundUserId: facts.account!.userId };
    // Country/quota settings authorize new dispatches, not already valid proof.
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "admitted", evidenceKind: "local" });
  });

  it("should reject an available proof older than fifteen minutes even if its stored deadline is later", () => {
    const facts = submissionFacts();
    facts.policy!.requiresAdditionalVerification = true;
    facts.currentConnection = { id: "connection", version: 1, securityEpoch: "security" };
    facts.localProof = { id: "proof", appliedRequestId: null, userId: facts.account!.userId, tribeId: facts.tribe.id, contact: facts.contact!, purpose: "admission", verificationEpoch: facts.policy!.verificationEpoch, connectionId: "connection", connectionVersion: 1, securityEpoch: "security", status: "available", verifiedAt: new Date(facts.now.getTime() - 900_000), applyBefore: new Date(facts.now.getTime() + 60_000) };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "verification_required" });
  });

  it("should preserve active and muted members when policy is missing or admissions are closed", () => {
    const fixtures = createAcademyAdmissionFixtures("eligibility");
    for (const membership of [fixtures.memberships.active, fixtures.memberships.muted, fixtures.memberships.guardian, fixtures.memberships.leader]) {
      const facts = submissionFacts();
      facts.account!.userId = membership.userId;
      facts.membership = membership;
      facts.policy = null;
      facts.tribe.evaluatorEnabled = false;
      expect(evaluateAdmissionSubmission(facts)).toEqual({ outcome: "already_member", membershipEffect: "none" });
      expect(facts.membership).toEqual(membership);
    }
  });

  it.each(["policy_missing", "evaluator_disabled", "recovery_locked", "paused", "activation_missing", "control_inactive"] as const)(
    "should close new admission when the activated scope is %s", (condition) => {
      const facts = submissionFacts();
      if (condition === "policy_missing") facts.policy = null;
      if (condition === "evaluator_disabled") facts.tribe.evaluatorEnabled = false;
      if (condition === "recovery_locked") facts.tribe.recoveryLocked = true;
      if (condition === "paused") facts.policy!.isOpen = false;
      if (condition === "activation_missing") facts.policy!.activatedAt = null;
      if (condition === "control_inactive") facts.tribe.controlActivated = false;
      expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "denied", reason: "admission_closed" });
    },
  );

  it("should close an invalid policy discriminator rather than falling through to automatic admission", () => {
    const facts = submissionFacts();
    facts.policy = { ...facts.policy!, mode: "obsolete-open-mode" as "allowlist" };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "denied", reason: "admission_closed" });
  });

  it("should ignore a declared phone's other binding when manual common submission does not use proof", () => {
    const facts = submissionFacts();
    facts.policy = { ...facts.policy!, contactType: "phone" };
    facts.contact = { type: "phone", value: "+12025550123", country: "US" };
    facts.contactBinding = { ownerUserId: "another-account", contact: facts.contact };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "pending", evidenceKind: "declared", bindContact: false });
  });

  it.each(["active", "muted"] as const)("should recover only the recorded %s commercial state after satisfying the allowlist", (recordedStatus) => {
    const facts = submissionFacts();
    facts.policy!.mode = "allowlist";
    facts.membership = { tribeId: facts.tribe.id, userId: facts.account!.userId, role: "tribemate", status: "blocked", statusReason: "payment_blocked", commercialRecoveryStatus: recordedStatus };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "admitted", membershipEffect: "recover", restoredStatus: recordedStatus });
  });

  it.each([
    { role: "tribemate", status: "blocked", statusReason: "conduct_blocked", commercialRecoveryStatus: "active", reason: "membership_restricted" },
    { role: "tribemate", status: "removed", statusReason: "none", commercialRecoveryStatus: null, reason: "membership_restricted" },
    { role: "guardian", status: "removed", statusReason: "subscription_inactive", commercialRecoveryStatus: "active", reason: "membership_restricted" },
    { role: "leader", status: "removed", statusReason: "subscription_inactive", commercialRecoveryStatus: "active", reason: "membership_restricted" },
    { role: "tribemate", status: "removed", statusReason: "subscription_inactive", commercialRecoveryStatus: null, reason: "membership_recovery_unknown" },
  ] as const)("should retain the $reason restriction for $role/$status/$statusReason", (row) => {
    const facts = submissionFacts();
    facts.policy!.mode = "allowlist";
    facts.membership = { ...row, tribeId: facts.tribe.id, userId: facts.account!.userId };
    expect(evaluateAdmissionSubmission(facts)).toMatchObject({ outcome: "denied", reason: row.reason });
  });

  it.each([
    { action: "configure_policy", leader: true, guardian: false, applicant: false },
    { action: "manage_allowlist", leader: true, guardian: false, applicant: false },
    { action: "manage_invitations", leader: true, guardian: false, applicant: false },
    { action: "manage_connection", leader: true, guardian: false, applicant: false },
    { action: "read_connection_metadata", leader: true, guardian: false, applicant: false },
    { action: "read_connection_alert", leader: true, guardian: true, applicant: false },
    { action: "read_secret", leader: false, guardian: false, applicant: false },
    { action: "read_inbox", leader: true, guardian: true, applicant: false },
    { action: "decide_request", leader: true, guardian: true, applicant: false },
    { action: "reject_request", leader: true, guardian: true, applicant: false },
    { action: "cancel_by_management", leader: true, guardian: false, applicant: false },
    { action: "allow_early_retry", leader: true, guardian: false, applicant: false },
    { action: "read_audit", leader: true, guardian: false, applicant: false },
    { action: "read_review_history", leader: true, guardian: true, applicant: false },
    { action: "read_own_request", leader: false, guardian: false, applicant: true },
    { action: "cancel_own_request", leader: false, guardian: false, applicant: true },
    { action: "attach_own_proof", leader: false, guardian: false, applicant: true },
    { action: "update_own_notification_preferences", leader: true, guardian: true, applicant: false },
    { action: "grant_product_or_role", leader: false, guardian: false, applicant: false },
  ] as const)("should apply the complete actor matrix for $action", (row) => {
    const resource = { tribeId: "tribe-a", applicantUserId: "applicant", hasRecentAuthentication: true };
    expect(canPerformAdmissionAction({ userId: "leader", tribeId: resource.tribeId, role: "leader", status: "active" }, row.action, resource)).toBe(row.leader);
    expect(canPerformAdmissionAction({ userId: "guardian", tribeId: resource.tribeId, role: "guardian", status: "active" }, row.action, resource)).toBe(row.guardian);
    expect(canPerformAdmissionAction({ userId: "applicant", tribeId: resource.tribeId, role: null, status: null }, row.action, resource)).toBe(row.applicant);
  });

  it.each([
    { role: "leader", status: "muted" }, { role: "leader", status: "blocked" }, { role: "leader", status: "removed" },
    { role: "guardian", status: "muted" }, { role: "guardian", status: "blocked" }, { role: "guardian", status: "removed" },
  ] as const)("should withdraw administrative alerts and review from a $status $role", (row) => {
    const actor = { userId: "former-reviewer", tribeId: "tribe-a", ...row };
    expect(canPerformAdmissionAction(actor, "read_connection_alert", { tribeId: actor.tribeId })).toBe(false);
    expect(canPerformAdmissionAction(actor, "read_inbox", { tribeId: actor.tribeId })).toBe(false);
    expect(canPerformAdmissionAction(actor, "decide_request", { tribeId: actor.tribeId, applicantUserId: "applicant" })).toBe(false);
  });
});

describe("current-policy review and permissions", () => {
  it("should require an explicit reviewer decision when a pending request becomes eligible", () => {
    const facts = submissionFacts();
    expect(evaluatePendingAdmissionReview({ ...facts, request: { id: "pending-request", userId: facts.account!.userId, expiresAt: new Date(facts.now.getTime() + 60_000), source: facts.source, attachedEvidence: null }, reviewer: { userId: "leader", role: "leader", status: "active", tribeId: facts.tribe.id } })).toMatchObject({ eligible: true, requiresExplicitDecision: true });
  });

  it("should reject self approval even when the requester is currently a leader", () => {
    const facts = submissionFacts();
    expect(canPerformAdmissionAction({ userId: facts.account!.userId, role: "leader", status: "active", tribeId: facts.tribe.id }, "decide_request", { tribeId: facts.tribe.id, applicantUserId: facts.account!.userId })).toBe(false);
  });

  it("should preserve a previously applied proof after freshness expiry and ordinary connection rotation", () => {
    const facts = submissionFacts();
    facts.policy!.requiresAdditionalVerification = true;
    facts.currentConnection = { id: "new-connection", version: 2, securityEpoch: "test-security-epoch" };
    const proof = {
      id: "proof", appliedRequestId: "pending-request",
      userId: facts.account!.userId, tribeId: facts.tribe.id, contact: facts.contact!,
      purpose: "admission" as const, verificationEpoch: facts.policy!.verificationEpoch,
      connectionId: "old-connection", connectionVersion: 1, securityEpoch: "test-security-epoch",
      status: "applied" as const, verifiedAt: new Date(facts.now.getTime() - 3 * 86_400_000),
      applyBefore: new Date(facts.now.getTime() - 3 * 86_400_000 + 900_000),
    };
    const review = { ...facts, request: { id: "pending-request", userId: facts.account!.userId, expiresAt: new Date(facts.now.getTime() + 60_000), source: facts.source, attachedEvidence: proof }, reviewer: { userId: "leader", role: "leader" as const, status: "active" as const, tribeId: facts.tribe.id } };
    expect(evaluatePendingAdmissionReview(review)).toMatchObject({ eligible: true });
    facts.policy!.verificationEpoch += 1;
    review.policy = facts.policy;
    expect(evaluatePendingAdmissionReview(review)).toMatchObject({ eligible: false, reason: "local_proof_required" });
  });

  it("should preserve redeemed invitation authority when its former deadline passes during review", () => {
    const facts = submissionFacts();
    const invitation = { tribeId: facts.tribe.id, contact: facts.contact!, requiresAllowlist: true, status: "redeemed" as const, authorizationRevoked: false, expiresAt: new Date(facts.now.getTime() - 60_000) };
    facts.source = { kind: "personal", invitation };
    const review = { ...facts, request: { id: "pending-request", userId: facts.account!.userId, expiresAt: new Date(facts.now.getTime() + 60_000), source: facts.source, attachedEvidence: null }, reviewer: { userId: "leader", role: "leader" as const, status: "active" as const, tribeId: facts.tribe.id } };
    expect(evaluatePendingAdmissionReview(review)).toMatchObject({ eligible: true });
    invitation.authorizationRevoked = true;
    expect(evaluatePendingAdmissionReview(review)).toMatchObject({ eligible: false, reason: "invitation_unusable" });
  });

  it("should reject a reviewer decision when the target account is absent", () => {
    expect(canPerformAdmissionAction({ userId: "leader", role: "leader", status: "active", tribeId: "tribe-a" }, "decide_request", { tribeId: "tribe-a" })).toBe(false);
  });

  it("should reject a proof already applied to another request of the same account", () => {
    const facts = submissionFacts();
    facts.policy!.requiresAdditionalVerification = true;
    const proof = { id: "proof", appliedRequestId: "another-request", userId: facts.account!.userId, tribeId: facts.tribe.id, contact: facts.contact!, purpose: "admission" as const, verificationEpoch: facts.policy!.verificationEpoch, connectionId: "retired", connectionVersion: 1, securityEpoch: "security", status: "applied" as const, verifiedAt: facts.now, applyBefore: new Date(facts.now.getTime() + 60_000) };
    expect(evaluatePendingAdmissionReview({ ...facts, request: { id: "current-request", userId: facts.account!.userId, expiresAt: new Date(facts.now.getTime() + 60_000), source: facts.source, attachedEvidence: proof }, reviewer: { userId: "leader", role: "leader", status: "active", tribeId: facts.tribe.id } })).toMatchObject({ eligible: false, reason: "local_proof_required" });
  });

  it("should allow the requester to read and cancel its own state without a membership", () => {
    const actor = { userId: "applicant", tribeId: "tribe-a", role: null, status: null };
    for (const action of ["read_own_request", "cancel_own_request", "attach_own_proof"] as const) {
      expect(canPerformAdmissionAction(actor, action, { tribeId: "tribe-a", applicantUserId: "applicant" })).toBe(true);
      expect(canPerformAdmissionAction(actor, action, { tribeId: "tribe-a", applicantUserId: "other" })).toBe(false);
    }
    expect(canPerformAdmissionAction(actor, "read_inbox", { tribeId: "tribe-a" })).toBe(false);
  });

  it("should require current sensitive authorization while never exposing saved secrets or granting products", () => {
    const actor = { userId: "leader", tribeId: "tribe-a", role: "leader" as const, status: "active" as const };
    expect(canPerformAdmissionAction(actor, "manage_connection", { tribeId: "tribe-a" })).toBe(false);
    expect(canPerformAdmissionAction(actor, "manage_connection", { tribeId: "tribe-a", hasRecentAuthentication: true })).toBe(true);
    expect(canPerformAdmissionAction(actor, "read_secret", { tribeId: "tribe-a", hasRecentAuthentication: true })).toBe(false);
    expect(canPerformAdmissionAction(actor, "grant_product_or_role", { tribeId: "tribe-a", hasRecentAuthentication: true })).toBe(false);
  });

  it.each(["paused", "expired", "proof_revoked", "list_removed", "allowed_exception"] as const)(
    "should revalidate a pending request when its current requirements are %s", (changed) => {
      const facts = submissionFacts();
      facts.policy!.mode = "allowlist";
      const review = { ...facts, request: { id: "pending-request", userId: facts.account!.userId, expiresAt: new Date(facts.now.getTime() + 60_000), source: facts.source, attachedEvidence: null as AdmissionSubmissionFacts["localProof"] }, reviewer: { userId: "leader", role: "leader" as const, status: "active" as const, tribeId: facts.tribe.id }, exceptionReason: "Motivo interno de excepción" };
      if (changed === "paused") review.policy!.isOpen = false;
      if (changed === "expired") review.request.expiresAt = facts.now;
      if (changed === "proof_revoked") review.request.attachedEvidence = { id: "proof", appliedRequestId: "pending-request", userId: facts.account!.userId, tribeId: facts.tribe.id, contact: facts.contact!, purpose: "admission", verificationEpoch: 1, connectionId: "retired", connectionVersion: 1, securityEpoch: "security", status: "invalid", verifiedAt: facts.now, applyBefore: facts.now };
      if (changed === "list_removed" || changed === "allowed_exception") review.allowlistEntry = null;
      if (changed === "allowed_exception") review.policy!.allowCommonExceptions = true;
      expect(evaluatePendingAdmissionReview(review).eligible).toBe(changed === "allowed_exception");
      expect(evaluatePendingAdmissionReview(review).requiresExplicitDecision).toBe(true);
    },
  );

  it.each([
    { role: "leader", status: "active", configure: true, review: true },
    { role: "guardian", status: "active", configure: false, review: true },
    { role: "tribemate", status: "active", configure: false, review: false },
    { role: "leader", status: "muted", configure: false, review: false },
    { role: "guardian", status: "removed", configure: false, review: false },
  ] as const)("should apply current role/status permissions for $role/$status", (row) => {
    const actor = { userId: "reviewer", role: row.role, status: row.status, tribeId: "tribe-a" };
    expect(canPerformAdmissionAction(actor, "configure_policy", { tribeId: "tribe-a" })).toBe(row.configure);
    expect(canPerformAdmissionAction(actor, "manage_allowlist", { tribeId: "tribe-a" })).toBe(row.configure);
    expect(canPerformAdmissionAction(actor, "decide_request", { tribeId: "tribe-a", applicantUserId: "applicant" })).toBe(row.review);
    expect(canPerformAdmissionAction(actor, "decide_request", { tribeId: "tribe-b", applicantUserId: "applicant" })).toBe(false);
  });
});
