/** Exercises who resolves each activation block and the allowlisted settings navigation. @module admission-activation-blockers-tests */
import { describe, expect, it } from "vitest";
import { ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON, isAdmissionPolicyPlatformReason } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { admissionPolicyStepHref, readAdmissionSettingsNavigation, withPolicyReviewReturn } from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import { evaluateAdmissionActivationPreflight, type AdmissionActivationInventory } from "@/src/modules/academy-admissions/domain/policies/admission-activation-preflight";

/** @returns A complete inventory that the preflight accepts. */
function inventory(): AdmissionActivationInventory {
  return { tribeId: "synthetic-tribe", isAcademy: true, policyPresent: true, markerConsistent: true, storagePrepared: true, ingressProtected: true, runtimePrepared: true, evaluatorEnabled: true, recoveryLocked: false };
}

describe("activation blockers", () => {
  it("should route every preflight reason the evaluator can emit to the leader, a flow step or the TuTribu team", () => {
    const reasons = evaluateAdmissionActivationPreflight("synthetic-tribe", { ...inventory(), isAcademy: false, policyPresent: false, markerConsistent: false, storagePrepared: false, ingressProtected: false, runtimePrepared: false, evaluatorEnabled: false, recoveryLocked: true }).reasons;
    expect(Object.fromEntries(reasons.map((reason) => [reason, ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason]]))).toEqual({
      preflight_academy_unavailable: "academy", preflight_policy_unavailable: "self_resolved", preflight_marker_inconsistent: "platform",
      preflight_storage_unavailable: "platform", preflight_ingress_unprotected: "platform",
      preflight_runtime_unavailable: "platform", preflight_evaluator_disabled: "academy", preflight_recovery_locked: "platform",
    });
    expect(ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[evaluateAdmissionActivationPreflight("synthetic-tribe", { ...inventory(), tribeId: "other" }).reasons[0]]).toBe("recheck");
  });

  it("should leave channel, quota and contact requirements to the leader and platform requirements to the team", () => {
    expect(["verification_unavailable", "sms_alternative_unavailable"].map((reason) => ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason as "verification_unavailable"])).toEqual(["connection", "connection"]);
    expect(ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON.recipient_countries_restricted).toBe("usage");
    expect(ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON.contact_type_locked).toBe("contact_step");
    expect(ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON.admission_clock_invalid).toBe("recheck");
    expect(["admission_preflight_incomplete", "admission_recovery_locked"].every((reason) => isAdmissionPolicyPlatformReason(reason as "admission_recovery_locked"))).toBe(true);
    // Closed academy admissions are switched on by the leader in academy management, never by the TuTribu team.
    expect(ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON.admission_evaluator_unavailable).toBe("academy");
    expect(isAdmissionPolicyPlatformReason("admission_evaluator_unavailable")).toBe(false);
  });
});

describe("settings navigation", () => {
  it("should accept only allowlisted return targets and steps and keep the rest of the query for the page loader", () => {
    expect(readAdmissionSettingsNavigation({ return: "policy-review", step: "review", other: "x" })).toEqual({ navigation: { returnTo: "policy-review", step: "review" }, query: { other: "x" } });
    // The membership review step is gone: an old link to it opens the flow from the start.
    expect(readAdmissionSettingsNavigation({ step: "memberships" })).toEqual({ navigation: { returnTo: null, step: null }, query: {} });
    expect(readAdmissionSettingsNavigation({ return: "https://evil.example.test", step: ["review", "review"] })).toEqual({ navigation: { returnTo: null, step: null }, query: {} });
    expect(readAdmissionSettingsNavigation({})).toEqual({ navigation: { returnTo: null, step: null }, query: {} });
  });

  it("should build the rules step and return links without free URLs", () => {
    expect(admissionPolicyStepHref("mi tribu", "review")).toBe("/mi%20tribu/academia/admissions/settings?step=review");
    expect(withPolicyReviewReturn("/tribu/academia/admissions/messaging")).toBe("/tribu/academia/admissions/messaging?return=policy-review");
  });
});
