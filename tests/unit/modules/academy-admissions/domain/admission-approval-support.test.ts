/** Verifies the approval support rule shared by the reviewer inbox and the decision writer. @module admission-approval-support-tests */
import { describe, expect, it } from "vitest";
import { isAdmissionApprovalSupported, isAdmissionRequestApprovable } from "@/src/modules/academy-admissions/domain/policies/admission-approval-support";

const BINDING_ID = "binding-synthetic";
const MANUAL_POLICY = { mode: "manual_review" as const };
const LIST_POLICY = { mode: "allowlist" as const };

describe("admission approval support", () => {
  it("should approve stored common requests and personal ones bound to their redeemed invitation only", () => {
    expect(isAdmissionRequestApprovable({ source: "common", bindingId: null })).toBe(true);
    expect(isAdmissionRequestApprovable({ source: "personal", bindingId: BINDING_ID })).toBe(true);
    expect(isAdmissionRequestApprovable({ source: "personal", bindingId: null })).toBe(false);
    expect(isAdmissionRequestApprovable({ source: "legacy", bindingId: null })).toBe(false);
    expect(isAdmissionRequestApprovable({ source: "legacy", bindingId: BINDING_ID })).toBe(false);
  });

  it("should keep legacy closed whatever its current source or policy reads", () => {
    for (const policy of [MANUAL_POLICY, LIST_POLICY]) {
      expect(isAdmissionApprovalSupported({ request: { source: "legacy", bindingId: null }, source: { kind: "common" }, policy })).toBe(false);
      expect(isAdmissionApprovalSupported({ request: { source: "legacy", bindingId: null }, source: { kind: "legacy" }, policy })).toBe(false);
    }
  });

  it("should require a readable personal invitation and a manual or list policy", () => {
    expect(isAdmissionApprovalSupported({ request: { source: "common", bindingId: null }, source: { kind: "common" }, policy: MANUAL_POLICY })).toBe(true);
    expect(isAdmissionApprovalSupported({ request: { source: "personal", bindingId: BINDING_ID }, source: { kind: "personal" }, policy: LIST_POLICY })).toBe(true);
    expect(isAdmissionApprovalSupported({ request: { source: "personal", bindingId: BINDING_ID }, source: { kind: "common" }, policy: LIST_POLICY })).toBe(false);
    expect(isAdmissionApprovalSupported({ request: { source: "common", bindingId: null }, source: { kind: "common" }, policy: null })).toBe(false);
  });
});
