/** @vitest-environment node */

/** Exercises deterministic synthetic actors and independent clocks for admission matrices. */
import { describe, expect, it } from "vitest";
import { createAcademyAdmissionFixtures } from "./academy-admission-fixtures";

describe("academy admission fixtures", () => {
  it("should preserve account and tribe isolation when the same seed is reused", () => {
    // Arrange and act.
    const first = createAcademyAdmissionFixtures("suite-a");
    const repeated = createAcademyAdmissionFixtures("suite-a");
    const different = createAcademyAdmissionFixtures("suite-b");

    // Assert.
    expect(first.accounts).toEqual(repeated.accounts);
    expect(first.tribes).toEqual(repeated.tribes);
    expect(first.accounts.applicantA.userId).not.toBe(first.accounts.applicantB.userId);
    expect(first.tribes.academyA.id).not.toBe(first.tribes.academyB.id);
    expect(first.tribes.academyA.id).not.toBe(different.tribes.academyA.id);
    expect(first.accounts.applicantA.email).toMatch(/@example\.invalid$/);
  });

  it("should retain recovery uncertainty when commercial and conduct cases are enumerated", () => {
    // Arrange and act.
    const fixtures = createAcademyAdmissionFixtures("recovery-cases");

    // Assert: preserving muted and unknown are distinct from automatic recovery.
    expect(fixtures.memberships.active).toMatchObject({ role: "tribemate", status: "active" });
    expect(fixtures.memberships.muted).toMatchObject({ role: "tribemate", status: "muted" });
    expect(fixtures.memberships.commercialMuted).toMatchObject({ statusReason: "payment_blocked", commercialRecoveryStatus: "muted" });
    expect(fixtures.memberships.commercialUnknown).toMatchObject({ statusReason: "subscription_inactive", commercialRecoveryStatus: null });
    expect(fixtures.memberships.conductBlocked).toMatchObject({ statusReason: "conduct_blocked" });
    expect(fixtures.memberships.removedGuardian).toMatchObject({ role: "guardian", status: "removed" });
  });

  it("should keep mutable versions and country initialization distinct from verification epochs", () => {
    // Arrange and act.
    const fixtures = createAcademyAdmissionFixtures("configuration-cases");

    // Assert.
    expect(fixtures.policies.manualEmailOff).toMatchObject({ mode: "manual_review", contactType: "email", requiresAdditionalVerification: false });
    expect(fixtures.usagePolicy).toMatchObject({ allowedCountries: [], version: 1 });
    expect(fixtures.allowlistEntry.version).toBe(1);
    expect(fixtures.invitation.version).toBe(1);
    fixtures.usagePolicy.allowedCountries.push("AR");
    expect(createAcademyAdmissionFixtures("configuration-cases").usagePolicy.allowedCountries).toEqual([]);
  });

  it("should return independent dates when one scenario advances its authoritative clock", () => {
    // Arrange.
    const first = createAcademyAdmissionFixtures("clock");
    const second = createAcademyAdmissionFixtures("clock");
    const initialTime = first.clock.now().getTime();

    // Act.
    first.clock.advance(60_000);
    const returnedDate = first.clock.now();
    returnedDate.setUTCFullYear(2000);

    // Assert: no global fake timers or shared Date state.
    expect(first.clock.now().getTime()).toBe(initialTime + 60_000);
    expect(second.clock.now().getTime()).toBe(initialTime);
    expect(first.memberships.muted.createdAt.getTime()).toBe(initialTime);
  });
});
