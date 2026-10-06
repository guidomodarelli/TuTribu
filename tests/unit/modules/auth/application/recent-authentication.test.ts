/** @vitest-environment node */

/** Exercises signed recency and operation-bound intents without using local admission codes. */
import { describe, expect, it } from "vitest";
import { evaluateGlobalReauthenticationCallback, evaluateRecentAuthentication } from "@/src/modules/auth/domain/policies/recent-authentication";

describe("recent global authentication", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const scope = { userId: "synthetic-user", sessionId: "session-after-callback", accountId: "google-account", subject: "google-subject", tribeId: "tribe", operation: "save_messaging_credentials", resourceId: "connection" };
  const intent = { id: "intent", ...scope, originalSessionId: "original-session", nonceVerified: true, consumedAt: null as Date | null, expiresAt: new Date(now.getTime() + 60_000) };
  const evidence = { ...scope, intentId: intent.id, authenticatedAt: new Date(now.getTime() - 60_000), verifiedAt: now, validUntil: new Date(now.getTime() + 540_000), invalidatedAt: null as Date | null };

  it("should accept the current account and exact operation when signed authentication is recent", () => {
    expect(evaluateRecentAuthentication({ now, scope, evidence, sessionActive: true, currentLeaderUserId: scope.userId })).toEqual({ allowed: true });
  });

  it.each(["old_authentication", "future_authentication", "revoked_session", "lost_leadership", "different_user", "different_session", "different_account", "different_subject", "different_tribe", "different_operation", "different_resource", "invalidated_evidence", "expired_evidence", "invalid_clock"] as const)(
    "should close a sensitive operation when its global evidence is %s", (changed) => {
      const currentEvidence = { ...evidence };
      let sessionActive = true;
      let currentLeaderUserId = scope.userId;
      if (changed === "old_authentication") currentEvidence.authenticatedAt = new Date(now.getTime() - 600_000);
      if (changed === "future_authentication") currentEvidence.authenticatedAt = new Date(now.getTime() + 1);
      if (changed === "invalidated_evidence") currentEvidence.invalidatedAt = now;
      if (changed === "expired_evidence") currentEvidence.validUntil = now;
      if (changed === "revoked_session") sessionActive = false;
      if (changed === "lost_leadership") currentLeaderUserId = "other-leader";
      if (changed === "different_user") currentEvidence.userId = "other";
      if (changed === "different_session") currentEvidence.sessionId = "other";
      if (changed === "different_account") currentEvidence.accountId = "other";
      if (changed === "different_subject") currentEvidence.subject = "other";
      if (changed === "different_tribe") currentEvidence.tribeId = "other";
      if (changed === "different_operation") currentEvidence.operation = "rotate_messaging_credentials";
      if (changed === "different_resource") currentEvidence.resourceId = "other";
      expect(evaluateRecentAuthentication({ now: changed === "invalid_clock" ? new Date(Number.NaN) : now, scope, evidence: currentEvidence, sessionActive, currentLeaderUserId })).toMatchObject({ allowed: false });
    },
  );

  it("should reject missing signed authentication time rather than using verification time as a substitute", () => {
    expect(evaluateRecentAuthentication({ now, scope, evidence: { ...evidence, authenticatedAt: null }, sessionActive: true, currentLeaderUserId: scope.userId })).toMatchObject({ allowed: false });
  });

  it("should allow fresh issued evidence after its callback already consumed the intent", () => {
    const completedIntent = { ...intent, consumedAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() - 1) };
    expect(evaluateGlobalReauthenticationCallback({ now, scope, intent: completedIntent, sessionActive: true, currentLeaderUserId: scope.userId })).toMatchObject({ allowed: false });
    expect(evaluateRecentAuthentication({ now, scope, evidence, sessionActive: true, currentLeaderUserId: scope.userId })).toEqual({ allowed: true });
  });

  it("should accept an unused verified callback intent before issuing evidence", () => {
    expect(evaluateGlobalReauthenticationCallback({ now, scope, intent, sessionActive: true, currentLeaderUserId: scope.userId })).toEqual({ allowed: true });
  });

  it.each(["missing_nonce", "consumed", "expired", "wrong_account", "wrong_operation", "missing_intent", "invalid_expiry", "revoked_session", "lost_leadership"] as const)(
    "should reject a callback intent that is %s", (changed) => {
      const currentIntent = { ...intent };
      if (changed === "missing_nonce") currentIntent.nonceVerified = false;
      if (changed === "consumed") currentIntent.consumedAt = now;
      if (changed === "expired") currentIntent.expiresAt = now;
      if (changed === "invalid_expiry") currentIntent.expiresAt = new Date(Number.NaN);
      if (changed === "wrong_account") currentIntent.accountId = "other-account";
      if (changed === "wrong_operation") currentIntent.operation = "other-operation";
      expect(evaluateGlobalReauthenticationCallback({ now, scope, intent: changed === "missing_intent" ? null : currentIntent, sessionActive: changed !== "revoked_session", currentLeaderUserId: changed === "lost_leadership" ? "other-leader" : scope.userId })).toMatchObject({ allowed: false });
    },
  );
});
