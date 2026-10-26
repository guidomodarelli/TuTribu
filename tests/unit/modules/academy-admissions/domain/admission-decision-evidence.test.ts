/** Exercises minimal historical evidence as an actual domain value contract. @module admission-decision-evidence-tests */
import { describe, expect, it } from "vitest";
import { snapshotAdmissionDecisionEvidence } from "@/src/modules/academy-admissions/domain/value-objects/admission-decision-evidence";

describe("admission decision evidence", () => {
  it.each(["none", "declared"] as const)("should record explicit %s without inventing a verification reference", (kind) => {
    expect(snapshotAdmissionDecisionEvidence({ kind })).toEqual({ kind, referenceId: null, verifiedAt: null });
  });

  it("should preserve base provenance in a detached snapshot without contact or provider fields", () => {
    const verifiedAt = new Date("2026-10-07T01:00:00Z");
    const snapshot = snapshotAdmissionDecisionEvidence({ kind: "base", identityEvidenceId: "synthetic-base-reference", verifiedAt });
    verifiedAt.setUTCFullYear(2030);
    expect(snapshot).toEqual({ kind: "base", referenceId: "synthetic-base-reference", verifiedAt: new Date("2026-10-07T01:00:00Z") });
    expect(Object.keys(snapshot)).toEqual(["kind", "referenceId", "verifiedAt"]);
  });

  it("should preserve the applied local proof reference and original time without reusing code material", () => {
    const verifiedAt = new Date("2026-10-07T01:00:00Z");
    expect(snapshotAdmissionDecisionEvidence({ kind: "local", proofId: "synthetic-proof-reference", verifiedAt })).toEqual({ kind: "local", referenceId: "synthetic-proof-reference", verifiedAt });
  });
});
