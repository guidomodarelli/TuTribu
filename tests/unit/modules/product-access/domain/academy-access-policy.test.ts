import { describe, expect, it } from "vitest";

import {
  evaluateAcademyAccess,
  resolveContinuousCoverage,
  type AccessGrantInterval,
} from "@/src/modules/product-access/domain/services/academy-access-policy";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function grant(
  startsAt: string,
  endsAt: string | null,
  overrides: Partial<AccessGrantInterval> = {}
): AccessGrantInterval {
  return {
    endsAt: endsAt ? new Date(endsAt) : null,
    revokedAt: null,
    sourceType: "manual_bonus",
    startsAt: new Date(startsAt),
    ...overrides,
  };
}

const ACTIVE_MEMBER = { role: "tribemate", status: "active" } as const;

describe("resolveContinuousCoverage", () => {
  it("reports no coverage without grants", () => {
    expect(resolveContinuousCoverage([], NOW)).toEqual({ covered: false, endsAt: null });
  });

  it("treats ends_at as exclusive: a grant that ends exactly now does not cover", () => {
    const coverage = resolveContinuousCoverage(
      [grant("2026-05-15T12:00:00.000Z", "2026-06-15T12:00:00.000Z")],
      NOW
    );

    expect(coverage.covered).toBe(false);
  });

  it("treats starts_at as inclusive", () => {
    const coverage = resolveContinuousCoverage(
      [grant("2026-06-15T12:00:00.000Z", "2026-07-15T12:00:00.000Z")],
      NOW
    );

    expect(coverage).toEqual({
      covered: true,
      endsAt: new Date("2026-07-15T12:00:00.000Z"),
    });
  });

  it("does not add overlapping bonuses: two simultaneous 30-day grants give 30 days", () => {
    const coverage = resolveContinuousCoverage(
      [
        grant("2026-06-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z"),
        grant("2026-06-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z"),
      ],
      NOW
    );

    expect(coverage.endsAt).toEqual(new Date("2026-07-10T00:00:00.000Z"));
  });

  it("chains adjacent and overlapping intervals into the continuous end", () => {
    const coverage = resolveContinuousCoverage(
      [
        grant("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
        grant("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
          sourceType: "subscription_payment",
        }),
        grant("2026-07-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z"),
      ],
      NOW
    );

    expect(coverage.endsAt).toEqual(new Date("2026-08-20T00:00:00.000Z"));
  });

  it("does not bridge a gap between paid periods (AC-24)", () => {
    const coverage = resolveContinuousCoverage(
      [
        grant("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", {
          sourceType: "subscription_payment",
        }),
        grant("2026-07-05T00:00:00.000Z", "2026-08-05T00:00:00.000Z", {
          sourceType: "subscription_payment",
        }),
      ],
      NOW
    );

    expect(coverage.endsAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(
      resolveContinuousCoverage(
        [
          grant("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
          grant("2026-07-05T00:00:00.000Z", "2026-08-05T00:00:00.000Z"),
        ],
        new Date("2026-07-03T00:00:00.000Z")
      ).covered
    ).toBe(false);
  });

  it("ignores revoked and future grants", () => {
    const coverage = resolveContinuousCoverage(
      [
        grant("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", {
          revokedAt: new Date("2026-06-10T00:00:00.000Z"),
        }),
        grant("2026-06-20T00:00:00.000Z", "2026-07-20T00:00:00.000Z"),
      ],
      NOW
    );

    expect(coverage.covered).toBe(false);
  });

  it("keeps an unbounded legacy grant unbounded", () => {
    const coverage = resolveContinuousCoverage(
      [grant("2025-01-01T00:00:00.000Z", null, { sourceType: "legacy" })],
      NOW
    );

    expect(coverage).toEqual({ covered: true, endsAt: null });
  });
});

describe("evaluateAcademyAccess", () => {
  const bonus = grant("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z");
  const payment = grant("2026-06-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z", {
    sourceType: "subscription_payment",
  });

  it("lets a bonus-only member consume the academy as bonus coverage (AC-10)", () => {
    expect(
      evaluateAcademyAccess({ grants: [bonus], membership: ACTIVE_MEMBER, now: NOW })
    ).toMatchObject({
      canConsume: true,
      hasBonusCoverage: true,
      hasPaidCoverage: false,
      isLeaderPreview: false,
    });
  });

  it("keeps any other valid source when one is revoked (AC-11)", () => {
    const access = evaluateAcademyAccess({
      grants: [{ ...payment, revokedAt: new Date("2026-06-12T00:00:00.000Z") }, bonus],
      membership: ACTIVE_MEMBER,
      now: NOW,
    });

    expect(access.canConsume).toBe(true);
    expect(access.hasPaidCoverage).toBe(false);
    expect(access.hasBonusCoverage).toBe(true);
  });

  it("counts a member with payment and bonus once, with both flags", () => {
    const access = evaluateAcademyAccess({
      grants: [payment, bonus],
      membership: ACTIVE_MEMBER,
      now: NOW,
    });

    expect(access).toMatchObject({ hasBonusCoverage: true, hasPaidCoverage: true });
    expect(access.coverageEndsAt).toEqual(new Date("2026-07-10T00:00:00.000Z"));
  });

  it("denies blocked or removed members even with valid grants (AC-13, INV-03)", () => {
    for (const membership of [
      { role: "tribemate", status: "blocked" },
      { role: "tribemate", status: "removed" },
      null,
    ] as const) {
      expect(
        evaluateAcademyAccess({ grants: [payment, bonus], membership, now: NOW }).canConsume
      ).toBe(false);
    }
  });

  it("keeps reading for muted members with a grant (AC-14)", () => {
    expect(
      evaluateAcademyAccess({
        grants: [bonus],
        membership: { role: "tribemate", status: "muted" },
        now: NOW,
      }).canConsume
    ).toBe(true);
  });

  it("gives an active leader an administrative preview that is not a grant", () => {
    const access = evaluateAcademyAccess({
      grants: [],
      membership: { role: "leader", status: "active" },
      now: NOW,
    });

    expect(access).toMatchObject({
      canConsume: true,
      hasBonusCoverage: false,
      hasPaidCoverage: false,
      isLeaderPreview: true,
    });
  });

  it("does not extend the preview to muted leaders or guardians", () => {
    for (const membership of [
      { role: "leader", status: "muted" },
      { role: "guardian", status: "active" },
    ] as const) {
      expect(evaluateAcademyAccess({ grants: [], membership, now: NOW }).canConsume).toBe(
        false
      );
    }
  });
});
