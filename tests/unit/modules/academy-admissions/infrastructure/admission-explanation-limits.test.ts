/** @vitest-environment node */
/** Exercises the real public input boundary for applicant explanations and mandatory review reasons. @module admission-explanation-limits-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admissionDecisionSchema, admissionSubmissionSchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";

describe("admission explanation limits", () => {
  it("should accept a 500-character explanation and reject 501 characters while keeping ordinary manual messages optional", () => {
    const intent = { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1 };
    expect(admissionSubmissionSchema.safeParse(intent).success).toBe(true);
    const accepted = admissionSubmissionSchema.parse({ ...intent, message: "a".repeat(500) });
    expect(accepted.message).toHaveLength(500);
    expect(admissionSubmissionSchema.safeParse({ ...intent, message: "a".repeat(501) }).success).toBe(false);
  });

  it.each(["approve", "reject"])("should require a nonblank bounded reason for an explicit %s decision", (decision) => {
    const intent = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision };
    expect(admissionDecisionSchema.safeParse({ ...intent, internalReason: "" }).success).toBe(false);
    expect(admissionDecisionSchema.safeParse({ ...intent, internalReason: "   " }).success).toBe(false);
    expect(admissionDecisionSchema.parse({ ...intent, internalReason: "a".repeat(500) }).internalReason).toHaveLength(500);
    expect(admissionDecisionSchema.safeParse({ ...intent, internalReason: "a".repeat(501) }).success).toBe(false);
  });
});
