import { describe, expect, it } from "vitest";

import {
  buildAcademyAccessStatus,
  resolveAcademyEligibility,
  type AcademyAccessSnapshot,
} from "@/src/modules/product-access/domain/services/academy-access-status";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function snapshot(overrides: Partial<AcademyAccessSnapshot> = {}): AcademyAccessSnapshot {
  return {
    firstActivatedAt: null,
    grants: [],
    membership: { role: "tribemate", status: "active" },
    offerPurchasable: true,
    renewalStatus: "none",
    verificationStates: [],
    ...overrides,
  };
}

const bonus = {
  endsAt: new Date("2026-07-01T00:00:00.000Z"),
  revokedAt: null,
  sourceType: "manual_bonus" as const,
  startsAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("resolveAcademyEligibility", () => {
  it("stays eligible with one verified relation among revoked ones (AC-07)", () => {
    expect(resolveAcademyEligibility(["revoked", "verified", "revoked"])).toBe("verified");
  });

  it("distinguishes not requested, pending and not verified", () => {
    expect(resolveAcademyEligibility([])).toBe("not_requested");
    expect(resolveAcademyEligibility(["rejected", "pending"])).toBe("pending");
    expect(resolveAcademyEligibility(["rejected", "revoked"])).toBe("not_verified");
  });
});

describe("buildAcademyAccessStatus", () => {
  it("guides a new basic member to request verification", () => {
    expect(buildAcademyAccessStatus(snapshot(), NOW)).toMatchObject({
      accessEndsAt: null,
      canStartCheckout: false,
      level: "basic",
      nextAction: "request_verification",
    });
  });

  it("keeps a pending member out of checkout (AC-03)", () => {
    expect(
      buildAcademyAccessStatus(snapshot({ verificationStates: ["pending"] }), NOW)
    ).toMatchObject({ canStartCheckout: false, nextAction: "wait_for_verification" });
  });

  it("offers checkout to a verified basic member while sales are on", () => {
    expect(
      buildAcademyAccessStatus(snapshot({ verificationStates: ["verified"] }), NOW)
    ).toMatchObject({ canStartCheckout: true, nextAction: "view_offer" });
    expect(
      buildAcademyAccessStatus(
        snapshot({ offerPurchasable: false, verificationStates: ["verified"] }),
        NOW
      ).canStartCheckout
    ).toBe(false);
  });

  it("does not offer a new checkout while a bonus is in force", () => {
    expect(
      buildAcademyAccessStatus(
        snapshot({ grants: [bonus], verificationStates: ["verified"] }),
        NOW
      )
    ).toMatchObject({
      accessEndsAt: bonus.endsAt,
      canStartCheckout: false,
      hasBonusCoverage: true,
      level: "academy",
      nextAction: "continue_learning",
    });
  });

  it("points to the pending checkout instead of a second purchase", () => {
    expect(
      buildAcademyAccessStatus(
        snapshot({ renewalStatus: "pending", verificationStates: ["verified"] }),
        NOW
      )
    ).toMatchObject({ canStartCheckout: false, nextAction: "complete_checkout" });
  });

  it("returns to basic after the grant ends, keeping the activation date", () => {
    const firstActivatedAt = new Date("2026-06-01T00:00:00.000Z");

    expect(
      buildAcademyAccessStatus(
        snapshot({ firstActivatedAt, grants: [bonus], verificationStates: ["verified"] }),
        new Date("2026-07-01T00:00:00.000Z")
      )
    ).toMatchObject({
      accessEndsAt: null,
      canStartCheckout: true,
      firstActivatedAt,
      level: "basic",
    });
  });

  it("sends blocked members to support without offering checkout", () => {
    expect(
      buildAcademyAccessStatus(
        snapshot({
          grants: [bonus],
          membership: { role: "tribemate", status: "blocked" },
          verificationStates: ["verified"],
        }),
        NOW
      )
    ).toMatchObject({ canStartCheckout: false, level: "basic", nextAction: "contact_support" });
  });
});
