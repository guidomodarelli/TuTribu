/** @vitest-environment node */
/** Exercises the prerequisite rules of the admission forms against the same facts their writers check. @module admission-setup-prerequisites-tests */
import { describe, expect, it } from "vitest";
import { readPersonalInvitationIssuePrerequisite } from "@/src/modules/academy-admissions/application/queries/admission-setup-prerequisites";
import { admissionSetupPrerequisiteHref } from "@/src/modules/academy-admissions/constants/admission-setup-prerequisite";

describe("readPersonalInvitationIssuePrerequisite", () => {
  it.each([
    [{ contactType: null, requiresAdditionalVerification: false }, "invitation_rules"],
    [{ contactType: "phone", requiresAdditionalVerification: false }, "invitation_phone_verification"],
    [{ contactType: "phone", requiresAdditionalVerification: true }, null],
    [{ contactType: "email", requiresAdditionalVerification: false }, null],
    [{ contactType: "email", requiresAdditionalVerification: true }, null],
  ] as const)("should map the rules %o to %s", (facts, expected) => {
    expect(readPersonalInvitationIssuePrerequisite(facts)).toBe(expected);
  });
});

describe("admissionSetupPrerequisiteHref", () => {
  it("should open the tab that resolves each prerequisite inside the encoded tribe path", () => {
    expect(admissionSetupPrerequisiteHref("mi tribu", "invitation_rules")).toBe("/mi%20tribu/academia/admissions/settings");
    expect(admissionSetupPrerequisiteHref("tribu", "notification_prepared_email")).toBe("/tribu/academia/admissions/messaging/connections");
  });
});
