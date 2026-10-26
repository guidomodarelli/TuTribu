/** Exercises ordinary disconnection dependencies separately from urgent suspension. @module messaging-connection-retirement-tests */
import { describe, expect, it } from "vitest";
import { assessMessagingConnectionRetirement } from "@/src/modules/messaging/domain/policies/messaging-connection-retirement";

/** @returns Current owner facts for a selected connection with no enabled external dependency. */
function retirementFacts() {
  return { isSelected: true, verificationRequired: false, admissionsPaused: false, externalNotificationsEnabled: false };
}

describe("ordinary messaging retirement", () => {
  it("should allow an unselected candidate to retire without changing the selected connection's dependencies", () => {
    expect(assessMessagingConnectionRetirement({ ...retirementFacts(), isSelected: false, verificationRequired: true, externalNotificationsEnabled: true })).toEqual({ allowed: true });
  });
  it("should block ordinary retirement while admission still requires the selected connection", () => {
    expect(assessMessagingConnectionRetirement({ ...retirementFacts(), verificationRequired: true })).toEqual({ allowed: false, reason: "admission_dependency" });
  });
  it("should allow paused admissions only after external notifications are also disabled", () => {
    expect(assessMessagingConnectionRetirement({ ...retirementFacts(), verificationRequired: true, admissionsPaused: true })).toEqual({ allowed: true });
    expect(assessMessagingConnectionRetirement({ ...retirementFacts(), verificationRequired: true, admissionsPaused: true, externalNotificationsEnabled: true })).toEqual({ allowed: false, reason: "notification_dependency" });
  });
  it("should preserve the notification dependency even when additional contact verification is off", () => {
    expect(assessMessagingConnectionRetirement({ ...retirementFacts(), externalNotificationsEnabled: true })).toEqual({ allowed: false, reason: "notification_dependency" });
    expect(assessMessagingConnectionRetirement(retirementFacts())).toEqual({ allowed: true });
  });
});
