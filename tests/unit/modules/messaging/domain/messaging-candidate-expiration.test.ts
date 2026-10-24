/** Exercises the abandoned-candidate decision independently from selected-channel operation or irreversible prior retirement. @module messaging-candidate-expiration-tests */
import { describe, expect, it } from "vitest";
import { assessMessagingCandidateExpiration } from "@/src/modules/messaging/domain/policies/messaging-candidate-expiration";

/** @returns Current exact candidate/version facts with an original activity timestamp. */
function candidateFacts() {
  return { isSelected: false, isCandidate: true, resourceRetiredAt: null, connectionRetiredAt: null, lastActivityAt: new Date("2026-10-01T07:00:00Z"), now: new Date("2026-10-08T07:00:00Z") };
}

describe("abandoned messaging candidate expiration", () => {
  it("should expire only an unselected live candidate at its original seven-day boundary", () => {
    expect(assessMessagingCandidateExpiration(candidateFacts())).toEqual({ eligible: true, expiredAt: new Date("2026-10-08T07:00:00Z"), purgeBy: new Date("2026-10-09T07:00:00Z") });
  });

  it("should preserve a selected connection or a recent candidate without restarting its lifetime", () => {
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), isSelected: true })).toEqual({ eligible: false, reason: "selected_connection" });
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), now: new Date("2026-10-08T06:59:59.999Z") })).toEqual({ eligible: false, reason: "candidate_current" });
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), isCandidate: false })).toEqual({ eligible: false, reason: "not_candidate" });
  });

  it("should keep the original purge deadline when maintenance observes the candidate late", () => {
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), now: new Date("2026-10-10T07:00:00Z") })).toEqual({ eligible: true, expiredAt: new Date("2026-10-08T07:00:00Z"), purgeBy: new Date("2026-10-09T07:00:00Z") });
  });

  it("should never revive a retired version or connection from an otherwise old candidate", () => {
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), resourceRetiredAt: new Date("2026-10-03T07:00:00Z") })).toEqual({ eligible: false, reason: "resource_retired" });
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), connectionRetiredAt: new Date("2026-10-03T07:00:00Z") })).toEqual({ eligible: false, reason: "connection_retired" });
  });

  it("should close on an unusable clock or activity timestamp instead of inventing an eligible deadline", () => {
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), now: new Date(Number.NaN) })).toEqual({ eligible: false, reason: "clock_unavailable" });
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), lastActivityAt: new Date(Number.NaN) })).toEqual({ eligible: false, reason: "activity_unavailable" });
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), lastActivityAt: new Date("2026-10-09T07:00:00Z") })).toEqual({ eligible: false, reason: "activity_unavailable" });
  });

  it("should close when an original expiration or purge deadline exceeds the valid Date range", () => {
    const lastValidInstant = new Date("+275760-09-13T00:00:00.000Z");
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), now: lastValidInstant, lastActivityAt: new Date("+275760-09-06T00:00:00.000Z") })).toEqual({ eligible: false, reason: "activity_unavailable" });
    expect(assessMessagingCandidateExpiration({ ...candidateFacts(), now: lastValidInstant, lastActivityAt: lastValidInstant })).toEqual({ eligible: false, reason: "activity_unavailable" });
  });
});
