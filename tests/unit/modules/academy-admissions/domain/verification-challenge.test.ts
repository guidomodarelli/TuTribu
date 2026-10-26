/** @vitest-environment node */

/** Exercises local validation and one-use proof proposals with authoritative scoped facts. */
import { describe, expect, it } from "vitest";
import { evaluateContactChallenge, proposeContactChallengeValidation, proposeAdmissionProofApplication } from "@/src/modules/academy-admissions/domain/policies/verification-challenge-policy";
import type { ContactVerificationChallenge, VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { AdmissionVerificationProof } from "@/src/modules/academy-admissions/domain/entities/admission-verification-proof";

describe("contact verification challenge", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const scope: VerificationChallengeScope = { userId: "account-a", tribeId: "tribe-a", contact: { type: "email", value: "synthetic@example.test" }, purpose: "admission", verificationEpoch: 1, connectionId: "connection-a", connectionVersion: 1, securityEpoch: "epoch-a", channel: "email" };
  const challenge: ContactVerificationChallenge = { ...scope, id: "challenge-a", version: 1, state: "issued", createdAt: now, expiresAt: new Date(now.getTime() + 600_000), failedAttempts: 0, verifiedAt: null, invalidatedAt: null, invalidationReason: null, codeMac: new Uint8Array([1]), macKeyId: "mac-a", codeEnvelopeId: "envelope-a", deliveryId: "delivery-a" };

  it("should validate a current local challenge without provider availability or new-send quota", () => {
    const result = proposeContactChallengeValidation({ now, scope, challenge, currentChallengeId: challenge.id, accountFailureBudgetAvailable: true, codeMatches: true });
    expect(result).toMatchObject({ outcome: "verified", challenge: { state: "verified", version: 2, verifiedAt: now, codeMac: null, codeEnvelopeId: null }, purpose: "admission" });
    expect(challenge.state).toBe("issued");
  });

  it.each(["account", "tribe", "contact", "purpose", "epoch", "connection", "connection_version", "security_epoch", "channel"] as const)("should reject a challenge with crossed %s without changing failure counts", (changed) => {
    const crossed: VerificationChallengeScope = { ...scope, contact: { ...scope.contact } };
    if (changed === "account") crossed.userId = "account-b";
    if (changed === "tribe") crossed.tribeId = "tribe-b";
    if (changed === "contact") crossed.contact = { type: "email", value: "other@example.test" };
    if (changed === "purpose") { crossed.purpose = "connection_diagnostic"; crossed.verificationEpoch = null; }
    if (changed === "epoch") crossed.verificationEpoch = 2;
    if (changed === "connection") crossed.connectionId = "connection-b";
    if (changed === "connection_version") crossed.connectionVersion += 1;
    if (changed === "security_epoch") crossed.securityEpoch = "epoch-b";
    if (changed === "channel") crossed.channel = "sms";
    expect(proposeContactChallengeValidation({ now, scope: crossed, challenge, currentChallengeId: challenge.id, accountFailureBudgetAvailable: true, codeMatches: false })).toMatchObject({ outcome: "denied", reason: "verification_scope_mismatch" });
    expect(challenge.failedAttempts).toBe(0);
  });

  it.each(["expires", "not_current", "already_verified", "invalidated", "five_failures", "account_blocked", "invalid_clock"] as const)("should close local validation when the challenge is %s", (changed) => {
    const current = { ...challenge };
    if (changed === "expires") current.expiresAt = now;
    if (changed === "already_verified") { current.state = "verified"; current.verifiedAt = now; }
    if (changed === "invalidated") current.invalidatedAt = now;
    if (changed === "five_failures") current.failedAttempts = 5;
    expect(evaluateContactChallenge({ now: changed === "invalid_clock" ? new Date(Number.NaN) : now, scope, challenge: current, currentChallengeId: changed === "not_current" ? "new-challenge" : challenge.id, accountFailureBudgetAvailable: changed !== "account_blocked" })).toMatchObject({ allowed: false });
  });

  it("should count a wrong code and invalidate the fifth failure without extending expiry", () => {
    const result = proposeContactChallengeValidation({ now, scope, challenge: { ...challenge, failedAttempts: 4 }, currentChallengeId: challenge.id, accountFailureBudgetAvailable: true, codeMatches: false });
    expect(result).toMatchObject({ outcome: "wrong_code", challenge: { state: "invalidated", failedAttempts: 5, expiresAt: challenge.expiresAt, invalidatedAt: now, codeMac: null, codeEnvelopeId: null }, recordAccountFailure: true });
  });

  it("should preserve the current deadline on a wrong code before the last attempt", () => {
    expect(proposeContactChallengeValidation({ now, scope, challenge, currentChallengeId: challenge.id, accountFailureBudgetAvailable: true, codeMatches: false })).toMatchObject({ outcome: "wrong_code", challenge: { state: "issued", failedAttempts: 1, expiresAt: challenge.expiresAt, codeEnvelopeId: challenge.codeEnvelopeId } });
  });

  it("should validate diagnostics only as diagnostics without minting an admission proof", () => {
    const diagnosticScope = { ...scope, purpose: "connection_diagnostic" as const, verificationEpoch: null };
    expect(proposeContactChallengeValidation({ now, scope: diagnosticScope, challenge: { ...challenge, ...diagnosticScope }, currentChallengeId: challenge.id, accountFailureBudgetAvailable: true, codeMatches: true })).toMatchObject({ outcome: "verified", purpose: "connection_diagnostic" });
  });

  it("should reject further validation of a successfully consumed challenge", () => {
    const first = proposeContactChallengeValidation({ now, scope, challenge, currentChallengeId: challenge.id, accountFailureBudgetAvailable: true, codeMatches: true });
    if (first.outcome !== "verified") throw new Error("Expected verified proposal");
    expect(proposeContactChallengeValidation({ now, scope, challenge: first.challenge, currentChallengeId: challenge.id, accountFailureBudgetAvailable: true, codeMatches: true })).toMatchObject({ outcome: "denied" });
  });
});

describe("admission verification proof", () => {
  const verifiedAt = new Date("2026-10-05T12:00:00.000Z");
  const scope: VerificationChallengeScope = { userId: "account-a", tribeId: "tribe-a", contact: { type: "phone", value: "+14155552671", country: "US" }, purpose: "admission", verificationEpoch: 1, connectionId: "connection-a", connectionVersion: 1, securityEpoch: "epoch-a", channel: "whatsapp" };
  const proof: AdmissionVerificationProof = { ...scope, purpose: "admission", verificationEpoch: 1, id: "proof-a", challengeId: "challenge-a", status: "available", verifiedAt, applyBefore: new Date(verifiedAt.getTime() + 900_000), appliedRequestId: null, appliedAt: null, invalidatedAt: null, invalidationReason: null };

  it("should apply fresh proof to one exact request without extending its freshness", () => {
    expect(proposeAdmissionProofApplication({ now: verifiedAt, scope, proof, requestId: "request-a" })).toMatchObject({ outcome: "applied", proof: { status: "applied", appliedRequestId: "request-a", appliedAt: verifiedAt, applyBefore: proof.applyBefore } });
    expect(proof.status).toBe("available");
  });

  it.each(["expired", "future", "used", "revoked", "account", "tribe", "epoch", "connection_version", "security_epoch", "diagnostic", "contact"] as const)("should reject a proof that is %s before applying it", (changed) => {
    const current = { ...proof };
    const currentScope = { ...scope };
    let now = verifiedAt;
    if (changed === "expired") now = proof.applyBefore;
    if (changed === "future") current.verifiedAt = new Date(now.getTime() + 1);
    if (changed === "used") { current.status = "applied"; current.appliedRequestId = "request-b"; current.appliedAt = now; }
    if (changed === "revoked") { current.status = "invalid"; current.invalidatedAt = now; }
    if (changed === "account") currentScope.userId = "account-b";
    if (changed === "tribe") currentScope.tribeId = "tribe-b";
    if (changed === "epoch") currentScope.verificationEpoch = 2;
    if (changed === "connection_version") currentScope.connectionVersion = 2;
    if (changed === "security_epoch") currentScope.securityEpoch = "epoch-b";
    if (changed === "diagnostic") { currentScope.purpose = "connection_diagnostic"; currentScope.verificationEpoch = null; }
    if (changed === "contact") currentScope.contact = { type: "phone", value: "+14155552672", country: "US" };
    expect(proposeAdmissionProofApplication({ now, scope: currentScope, proof: current, requestId: "request-a" })).toMatchObject({ outcome: "denied" });
  });
});
