/** @vitest-environment node */
/** Exercises own WhatsApp inputs and separates private query data from durable results. @module admission-whatsapp-contract-tests */
import { describe, expect, it } from "vitest";
import { admissionPolicyUpdateSchema, admissionSubmissionSchema, admissionWhatsappNumberUpdateSchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";
import { admissionRequestSchema, admissionOwnRequestSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { createDefaultAdmissionPolicy, proposeAdmissionPolicyChange } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { createAcademyAdmissionFixtures } from "@/tests/support/academy-admission-fixtures";

describe("declared WhatsApp contracts", () => {
  const fixtures = createAcademyAdmissionFixtures("whatsapp-contract");
  const operationId = "9307c14c-35d7-46d4-bc49-c8beb02fe664";
  const confirmation = { operationId, confirmed: true as const };
  const draft = { mode: "manual_review", contactType: "email", isOpen: true, allowCommonExceptions: false, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false };

  it("should preserve the current requirement when an earlier policy client omits the new setting", () => {
    const { operationId: ignoredId, confirmed: ignoredConfirmation, expectedVersion, ...patch } = admissionPolicyUpdateSchema.parse({ ...confirmation, ...draft, expectedVersion: 1 });
    expect([ignoredId, ignoredConfirmation]).toEqual([operationId, true]);
    expect(patch).not.toHaveProperty("requiresWhatsappNumber");
    const policy = { ...createDefaultAdmissionPolicy({ id: fixtures.tribes.academyA.id, tribeId: fixtures.tribes.academyA.id }), ...patch, requiresWhatsappNumber: true };
    expect(proposeAdmissionPolicyChange(policy, patch, expectedVersion, { tribeId: policy.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null })).toMatchObject({ outcome: "unchanged", policy: { requiresWhatsappNumber: true } });
  });

  it("should accept an explicit leader setting and keep declared WhatsApp distinct from a verification phone", () => {
    expect(admissionPolicyUpdateSchema.parse({ ...confirmation, ...draft, expectedVersion: 1, requiresWhatsappNumber: true })).toMatchObject({ requiresWhatsappNumber: true });
    expect(admissionSubmissionSchema.parse({ ...confirmation, expectedPolicyVersion: 1, phone: "+442079460018", whatsappNumber: "+14155552671" })).toMatchObject({ phone: "+442079460018", whatsappNumber: "+14155552671" });
    expect(admissionSubmissionSchema.safeParse({ ...confirmation, expectedPolicyVersion: 1, firstName: "Synthetic" }).success).toBe(false);
  });

  it("should require a stable operation, observed version and confirmation without accepting another actor or proof", () => {
    expect(admissionWhatsappNumberUpdateSchema.parse({ ...confirmation, expectedVersion: 2, whatsappNumber: null })).toEqual({ ...confirmation, expectedVersion: 2, whatsappNumber: null });
    for (const extra of [{ userId: "another-user" }, { proofId: operationId }, { confirmed: false }, { expectedVersion: 0 }]) {
      expect(admissionWhatsappNumberUpdateSchema.safeParse({ ...confirmation, expectedVersion: 2, whatsappNumber: "+14155552671", ...extra }).success).toBe(false);
    }
  });

  it("should expose declared numbers only in an authorized query, never in the durable request snapshot", () => {
    const request = { id: operationId, status: "pending", version: 1, submittedAt: fixtures.clock.now().toISOString(), expiresAt: new Date(fixtures.clock.now().getTime() + 1).toISOString(), source: "common", needsVerification: false, eligibilityReasons: [], whatsappNumber: "+14155552671", requiresWhatsappNumber: true };
    expect(admissionOwnRequestSchema.parse(request)).toMatchObject({ whatsappNumber: "+14155552671", requiresWhatsappNumber: true });
    const snapshot = admissionRequestSchema.parse(request);
    expect(snapshot).not.toHaveProperty("whatsappNumber");
    expect(snapshot).not.toHaveProperty("requiresWhatsappNumber");
  });
});
