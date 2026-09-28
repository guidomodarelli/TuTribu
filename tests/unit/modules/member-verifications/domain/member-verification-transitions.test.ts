import { describe, expect, it } from "vitest";

import {
  resolveVerificationRequestTransition,
  resolveVerificationReviewTransition,
} from "@/src/modules/member-verifications/domain/services/member-verification-transitions";

describe("resolveVerificationRequestTransition", () => {
  it("creates the relation on the first request", () => {
    expect(resolveVerificationRequestTransition(null, false)).toEqual({ kind: "create" });
  });

  it("is idempotent when a pending request is resent", () => {
    expect(resolveVerificationRequestTransition("pending", false)).toEqual({
      kind: "unchanged",
    });
  });

  it("does not verify anything by selecting a provider again (AC-04)", () => {
    expect(resolveVerificationRequestTransition("verified", false)).toEqual({
      kind: "unchanged",
    });
  });

  it("returns a verified relation to pending when the declared data changes (AC-06)", () => {
    expect(resolveVerificationRequestTransition("verified", true)).toEqual({ kind: "reopen" });
  });

  it("reopens rejected and revoked relations", () => {
    expect(resolveVerificationRequestTransition("rejected", false)).toEqual({ kind: "reopen" });
    expect(resolveVerificationRequestTransition("revoked", false)).toEqual({ kind: "reopen" });
  });
});

describe("resolveVerificationReviewTransition", () => {
  it("verifies or rejects only pending relations", () => {
    expect(resolveVerificationReviewTransition("pending", "verified", null)).toEqual({
      kind: "apply",
      nextStatus: "verified",
    });
    expect(resolveVerificationReviewTransition("rejected", "verified", null)).toEqual({
      kind: "invalid_transition",
    });
  });

  it("requires a reason to reject or revoke", () => {
    expect(resolveVerificationReviewTransition("pending", "rejected", null)).toEqual({
      kind: "reason_required",
    });
    expect(resolveVerificationReviewTransition("verified", "revoked", "Cuenta cerrada")).toEqual({
      kind: "apply",
      nextStatus: "revoked",
    });
  });

  it("revokes only verified relations", () => {
    expect(resolveVerificationReviewTransition("pending", "revoked", "Motivo")).toEqual({
      kind: "invalid_transition",
    });
  });
});
