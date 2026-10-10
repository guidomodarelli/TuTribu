/** @vitest-environment node */
/** Exercises own admission contracts through native HTTP projection and real Zod. @module admission-flow-contracts-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionRouteBoundary } from "@/src/modules/academy-admissions/infrastructure/api/admission-route-http";
import { admissionRequestSchema, admissionReviewSchema, admissionOutcomeSchema, admissionBatchResultSchema, createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionTribeParamsSchema, admissionReviewQuerySchema, admissionSubmissionSchema, admissionBatchDecisionSchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";

/** Builds a synthetic own request with no provider or storage credentials. */
function ownRequest() {
  return { id: randomUUID(), version: 1, status: "pending", submittedAt: "2026-10-06T12:00:00.000Z", expiresAt: "2026-11-05T12:00:00.000Z", source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.invalid", evidenceKind: "declared" } };
}
/** Uses the real response owner with a controlled diagnostic sink. */
function boundary(body?: unknown) {
  return createAdmissionRouteBoundary({ request: new Request("https://tutribu.example.invalid/api/tribes/synthetic/admissions", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), operation: "admission-contract-test", diagnostics: () => undefined });
}

describe("admission flow contracts", () => {
  it("should reject forged authority and duplicated input parts before application work", async () => {
    const owner = boundary({ operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, email: "synthetic@example.invalid", verified: true, role: "leader" });
    expect((await owner.readBody(admissionSubmissionSchema)).usable).toBe(false);
    const params = owner.input("params", admissionTribeParamsSchema, { slug: "synthetic-academy" });
    expect(params).toMatchObject({ usable: true, value: { slug: "synthetic-academy" } });
    expect(owner.input("params", admissionTribeParamsSchema, { slug: "synthetic-academy" })).toMatchObject({ usable: false });
  });

  it("should normalize bounded query input without allowing a caller audience or another actor", () => {
    const query = boundary().input("query", admissionReviewQuerySchema, { status: "pending", limit: "25", search: "  synthetic  " });
    expect(query).toMatchObject({ usable: true, value: { status: "pending", limit: 25, search: "synthetic" } });
    expect(boundary().input("query", admissionReviewQuerySchema, { audience: "leader", userId: randomUUID() })).toMatchObject({ usable: false });
    expect(boundary().input("query", admissionReviewQuerySchema, { limit: "0" })).toMatchObject({ usable: false });
    expect(boundary().input("query", admissionReviewQuerySchema, { submittedFrom: "2026-10-07T12:00:00Z", submittedUntil: "2026-10-06T12:00:00Z" })).toMatchObject({ usable: false });
  });

  it("should strip review-only and storage facts from own responses and preserve them only in the reviewer projection", async () => {
    const request = ownRequest();
    const raw = { ...request, internalReason: "Synthetic internal review", applicant: { id: randomUUID(), name: "Synthetic applicant" }, rawContact: "synthetic@example.invalid", code: "123456", codeMac: "synthetic-private", apiKey: "synthetic-private", eligibleActions: ["approve", "reject"], evidence: { kind: "declared" }, restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null } };
    expect(await boundary().success(admissionRequestSchema, raw).json()).toEqual(request);
    const review = await boundary().success(admissionReviewSchema, raw).json();
    expect(review).toMatchObject({ internalReason: raw.internalReason, applicant: raw.applicant });
    expect(review).not.toHaveProperty("apiKey");
    expect(review).not.toHaveProperty("codeMac");
  });

  it("should reject an unmasked own contact, unknown state or a version-zero public resource", async () => {
    for (const request of [ { ...ownRequest(), version: 0 }, { ...ownRequest(), status: "in_flight" }, { ...ownRequest(), contact: { type: "email", maskedValue: "synthetic@example.invalid", evidenceKind: "base" } } ]) {
      const response = boundary().success(admissionRequestSchema, request);
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: "public_contract_unusable" });
    }
  });

  it("should prevent an admitted outcome from granting a privileged role or external redirect", async () => {
    const valid = { outcome: "admitted", operationId: randomUUID(), membership: { status: "muted", role: "tribemate" }, safeMessage: "Ingresaste a la academia.", nextHref: "/synthetic-academy/academia" };
    expect(await boundary().success(admissionOutcomeSchema, valid).json()).toEqual(valid);
    for (const invalid of [{ ...valid, membership: { status: "active", role: "guardian" } }, { ...valid, nextHref: "https://example.invalid" }, { ...valid, nextHref: "/\\example.invalid" }]) {
      expect(boundary().success(admissionOutcomeSchema, invalid).status).toBe(500);
    }
  });

  it("should reject duplicate selections and oversized batches before effects", async () => {
    const id = randomUUID();
    const command = { operationId: randomUUID(), confirmed: true, decision: "reject", internalReason: "Synthetic reason", items: [{ requestId: id, expectedVersion: 1 }, { requestId: id.toUpperCase(), expectedVersion: 1 }] };
    expect((await boundary(command).readBody(admissionBatchDecisionSchema)).usable).toBe(false);
    expect((await boundary({ ...command, items: Array.from({ length: 51 }, () => ({ requestId: randomUUID(), expectedVersion: 1 })) }).readBody(admissionBatchDecisionSchema)).usable).toBe(false);
  });

  it("should reject a batch that claims unconfirmed progress while preserving mixed confirmed results", async () => {
    const batch = { operationId: randomUUID(), state: "completed", result: "mixed", completedCount: 1, failedCount: 1, unresolvedCount: 0, items: [{ requestId: randomUUID(), status: "approved", version: 2, safeMessage: "Solicitud aprobada." }, { requestId: randomUUID(), status: "conflict", code: "request_conflict", safeMessage: "La solicitud cambió." }] };
    expect(await boundary().success(admissionBatchResultSchema, batch).json()).toEqual(batch);
    expect(boundary().success(admissionBatchResultSchema, { ...batch, completedCount: 2 }).status).toBe(500);
    expect(boundary().success(admissionBatchResultSchema, { ...batch, result: "all_succeeded" }).status).toBe(500);
  });

  it("should keep a recovered commit distinct from a current snapshot and reject result data in a started operation", async () => {
    const schema = createAdmissionOperationStateSchema(admissionRequestSchema);
    const committed = { operationId: randomUUID(), state: "completed", replayed: true, result: ownRequest() };
    const parsed = await boundary().success(schema, { ...committed, currentVersion: 9, rawIntent: { private: true } }).json();
    expect(parsed).toEqual(committed);
    const started = { operationId: randomUUID(), state: "started", result: ownRequest() };
    expect(boundary().success(schema, started).status).toBe(500);
  });

  it("should preserve evidence source, time, scope and nominative constraints only in an authorized review projection", async () => {
    const request = ownRequest();
    const evidence = { kind: "local", source: "local_code", verifiedAt: "2026-10-06T12:00:00.000Z", scope: { tribeId: randomUUID(), requestId: request.id, purpose: "admission" } };
    const restrictions = { requiresAllowlist: true, requiresExceptionReason: false, invitation: { status: "redeemed", requiresAllowlist: true, authorizationRevoked: false, recipientMatches: true, expiresAt: null } };
    const review = { ...request, source: "personal", contact: { ...request.contact, evidenceKind: "local" }, applicant: { id: randomUUID(), name: "Synthetic applicant" }, rawContact: "synthetic@example.invalid", eligibleActions: ["approve", "reject"], evidence, restrictions };
    const published = await boundary().success(admissionReviewSchema, review).json();
    expect(published).toMatchObject({ evidence, restrictions });
    const own = await boundary().success(admissionRequestSchema, review).json();
    expect(own).not.toHaveProperty("evidence");
    expect(own).not.toHaveProperty("restrictions");
    expect(own).not.toHaveProperty("rawContact");
  });
});
