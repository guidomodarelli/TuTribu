/** Exercises cutover inventory decisions, not source strings or simulated external capability. @module admission-activation-preflight-tests */
import { describe, expect, it } from "vitest";
import { evaluateAdmissionActivationPreflight, type AdmissionActivationInventory } from "@/src/modules/academy-admissions/domain/policies/admission-activation-preflight";

/** Supplies an explicitly complete private inventory; each test removes one actual prerequisite. */
function completeInventory(): AdmissionActivationInventory {
  return { tribeId: "synthetic-tribe", isAcademy: true, policyPresent: true, markerConsistent: true, storagePrepared: true, ingressProtected: true, runtimePrepared: true, unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 };
}

describe("activation cutover inventory", () => {
  it("should require complete inventory and preserve the observed history without changing any fact", () => {
    const inventory = completeInventory(), original = { ...inventory };
    expect(evaluateAdmissionActivationPreflight(inventory.tribeId, inventory)).toEqual({ prepared: true, reasons: [] });
    expect(inventory).toEqual(original);
    expect(evaluateAdmissionActivationPreflight("foreign-tribe", inventory)).toEqual({ prepared: false, reasons: ["preflight_scope_mismatch"] });
  });

  it.each([
    ["isAcademy", "preflight_academy_unavailable"], ["policyPresent", "preflight_policy_unavailable"],
    ["markerConsistent", "preflight_marker_inconsistent"], ["storagePrepared", "preflight_storage_unavailable"],
    ["ingressProtected", "preflight_ingress_unprotected"], ["runtimePrepared", "preflight_runtime_unavailable"],
  ] as const)("should stay closed when %s is unavailable instead of substituting defaults", (field, reason) => {
    const inventory = { ...completeInventory(), [field]: false };
    expect(evaluateAdmissionActivationPreflight(inventory.tribeId, inventory)).toEqual({ prepared: false, reasons: [reason] });
  });

  it.each([1, -1, Number.NaN])("should require authorized history resolution when the unresolved count is %s", (count) => {
    const inventory = { ...completeInventory(), unknownCommercialMemberCount: count, privilegedCommercialMemberCount: count };
    expect(evaluateAdmissionActivationPreflight(inventory.tribeId, inventory)).toEqual({ prepared: false, reasons: ["preflight_unknown_commercial_history", "preflight_privileged_commercial_membership"] });
  });
});
