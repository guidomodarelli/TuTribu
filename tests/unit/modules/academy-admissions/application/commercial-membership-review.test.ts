/** @vitest-environment node */
/** Exercises the commercial membership review domain rules, use cases and HTTP boundary with the real resolver and own port doubles. @module commercial-membership-review-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { ManageCommercialMembershipReviewsUseCases } from "@/src/modules/academy-admissions/application/use-cases/manage-commercial-membership-reviews-use-cases";
import { createCommercialMembershipReviewHandlers } from "@/src/modules/academy-admissions/infrastructure/api/commercial-membership-review-handlers";
import { allowedCommercialMembershipDecisions, classifyCommercialMembershipReview, commercialMembershipExpectedState, isCommercialMembershipState, type CommercialMembershipReviewCase } from "@/src/modules/academy-admissions/domain/entities/commercial-membership-review";
import type { CommercialMembershipReviewRepository } from "@/src/modules/academy-admissions/domain/repositories/commercial-membership-review-repository";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

const unknownCase: CommercialMembershipReviewCase = { memberId: randomUUID(), displayName: "Integrante sintética", role: "tribemate", status: "blocked", statusReason: "payment_blocked", recoveryStatus: null, joinedAt: "2026-05-07T12:00:00.000Z" };
const guardianCase: CommercialMembershipReviewCase = { ...unknownCase, memberId: randomUUID(), role: "guardian", status: "removed", statusReason: "subscription_inactive", recoveryStatus: "muted" };

/** Real resolver over own account/actor ports, and a repository double that records what the use case sends. */
function fixture(role: AdmissionActorFacts["role"] = "leader") {
  const now = new Date("2026-10-19T12:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-20T12:00:00Z") }, googleAccount: null, identityEvidence: null };
  const actor: AdmissionActorFacts = { userId, tribeId, role, status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const repository = {
    read: vi.fn<CommercialMembershipReviewRepository["read"]>(async () => ({ cases: [unknownCase, guardianCase], pendingCount: 2, resolvedCount: 0 })),
    resolve: vi.fn<CommercialMembershipReviewRepository["resolve"]>(async (_context, command) => ({ state: "completed", operationId: command.operationId, replayed: false,
      result: { status: "resolved", memberId: command.memberId, decision: command.decision, resultingRole: "tribemate", resultingStatus: "blocked", resultingRecoveryStatus: "active", decidedAt: now.toISOString() } })),
  };
  const useCases = new ManageCommercialMembershipReviewsUseCases(resolver, repository);
  return { tribeId, userId, sessionId, repository, useCases };
}

describe("commercial membership review domain rules", () => {
  it("should classify guardians as privileged and offer every decision, retiring included, to both roles", () => {
    expect(classifyCommercialMembershipReview(unknownCase)).toBe("unknown_history");
    expect(classifyCommercialMembershipReview(guardianCase)).toBe("privileged");
    expect(allowedCommercialMembershipDecisions()).toEqual(["recover_active", "recover_muted", "retire"]);
    expect(commercialMembershipExpectedState(guardianCase)).toEqual({ role: "guardian", status: "removed", statusReason: "subscription_inactive", recoveryStatus: "muted" });
  });

  it("should treat the four commercial combinations, crossed pairs included, as the shared commercial criterion", () => {
    for (const status of ["blocked", "removed"]) for (const statusReason of ["payment_blocked", "subscription_inactive"]) expect(isCommercialMembershipState({ status, statusReason })).toBe(true);
    expect(isCommercialMembershipState({ status: "blocked", statusReason: "conduct_blocked" })).toBe(false);
    expect(isCommercialMembershipState({ status: "removed", statusReason: "none" })).toBe(false);
    expect(isCommercialMembershipState({ status: "active", statusReason: "payment_blocked" })).toBe(false);
    const crossedCase: CommercialMembershipReviewCase = { ...unknownCase, status: "removed", statusReason: "payment_blocked" };
    expect(commercialMembershipExpectedState(crossedCase)).toEqual({ role: "tribemate", status: "removed", statusReason: "payment_blocked", recoveryStatus: null });
  });
});

describe("commercial membership review use cases", () => {
  it("should list cases only for the current leader and deny a guardian", async () => {
    const leader = fixture();
    expect(await leader.useCases.read({ tribeId: leader.tribeId, requestId: randomUUID() })).toEqual({ ok: true, value: { cases: [unknownCase, guardianCase], pendingCount: 2, resolvedCount: 0 } });
    expect(leader.repository.read.mock.calls[0][0]).toMatchObject({ tribeId: leader.tribeId, userId: leader.userId, action: "read_policy" });
    const guardian = fixture("guardian");
    expect(await guardian.useCases.read({ tribeId: guardian.tribeId, requestId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(guardian.repository.read).not.toHaveBeenCalled();
  });

  it("should publish crossed commercial pairs listed by the owner with the facts the decision compares", async () => {
    const data = fixture();
    const crossed: CommercialMembershipReviewCase[] = [
      { ...unknownCase, memberId: randomUUID(), status: "removed", statusReason: "payment_blocked" },
      { ...guardianCase, memberId: randomUUID(), status: "blocked", statusReason: "subscription_inactive" },
    ];
    data.repository.read.mockResolvedValueOnce({ cases: crossed, pendingCount: 2, resolvedCount: 0 });
    expect(await data.useCases.read({ tribeId: data.tribeId, requestId: randomUUID() })).toEqual({ ok: true, value: { cases: crossed, pendingCount: 2, resolvedCount: 0 } });
    const operationId = randomUUID();
    await data.useCases.resolve({ tribeId: data.tribeId, requestId: randomUUID(), operationId, confirmed: true, memberId: crossed[0].memberId, decision: "recover_active", expected: commercialMembershipExpectedState(crossed[0]), reason: null });
    expect(data.repository.resolve.mock.calls[0][1]).toMatchObject({ expected: { role: "tribemate", status: "removed", statusReason: "payment_blocked", recoveryStatus: null } });
  });

  it("should reject an unusable list instead of publishing it", async () => {
    const data = fixture();
    data.repository.read.mockResolvedValueOnce({ cases: [unknownCase, unknownCase], pendingCount: 2, resolvedCount: 0 });
    expect(await data.useCases.read({ tribeId: data.tribeId, requestId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should send a trimmed confirmed decision with its own sensitive purpose and the observed facts", async () => {
    const data = fixture(), operationId = randomUUID();
    const result = await data.useCases.resolve({ tribeId: data.tribeId, requestId: randomUUID(), operationId, confirmed: true, memberId: unknownCase.memberId, decision: "recover_active", expected: commercialMembershipExpectedState(unknownCase), reason: "  Pago regularizado  " });
    expect(result).toMatchObject({ ok: true, value: { state: "completed", operationId, result: { status: "resolved", memberId: unknownCase.memberId } } });
    const [context, command] = data.repository.resolve.mock.calls[0];
    expect(context).toMatchObject({ action: "configure_policy", sensitiveOperation: "resolve_commercial_membership_review" });
    expect(command).toEqual({ operationId, confirmed: true, memberId: unknownCase.memberId, decision: "recover_active", expected: commercialMembershipExpectedState(unknownCase), reason: "Pago regularizado" });
  });

  it("should reject an oversized reason and a result for another member", async () => {
    const data = fixture();
    const base = { tribeId: data.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const, memberId: unknownCase.memberId, decision: "recover_muted" as const, expected: commercialMembershipExpectedState(unknownCase) };
    expect(await data.useCases.resolve({ ...base, reason: "x".repeat(501) })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(data.repository.resolve).not.toHaveBeenCalled();
    data.repository.resolve.mockResolvedValueOnce({ state: "completed", operationId: base.operationId, replayed: true, result: { status: "rejected", memberId: guardianCase.memberId, reason: "membership_changed" } });
    expect(await data.useCases.resolve({ ...base, reason: null })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should keep registered progress and owner denials as closed failures", async () => {
    const data = fixture(), operationId = randomUUID();
    const base = { tribeId: data.tribeId, requestId: randomUUID(), operationId, confirmed: true as const, memberId: unknownCase.memberId, decision: "recover_muted" as const, expected: commercialMembershipExpectedState(unknownCase), reason: null };
    data.repository.resolve.mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId }));
    expect(await data.useCases.resolve(base)).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId, state: "started" } } });
    data.repository.resolve.mockRejectedValueOnce(new AdmissionOperationError("authentication_required"));
    expect(await data.useCases.resolve(base)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });
});

describe("commercial membership review HTTP boundary", () => {
  /** @returns Handlers over the real use cases, plus request builders. */
  function http() {
    const data = fixture();
    const open = vi.fn(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId: data.tribeId } }) }, reviews: data.useCases }));
    const handlers = createCommercialMembershipReviewHandlers(open);
    const post = (memberId: string, body: unknown, origin = "https://tutribu.example.test") => handlers.resolve(new Request(`https://tutribu.example.test/api/tribes/synthetic/admissions/commercial-memberships/${memberId}/resolution`, { method: "POST", headers: { origin, host: "tutribu.example.test", "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ slug: "synthetic", memberId }) });
    return { data, open, handlers, post };
  }
  const body = (operationId = randomUUID()) => ({ operationId, confirmed: true, decision: "retire", expected: commercialMembershipExpectedState(guardianCase), reason: "No vuelve" });

  it("should list pending cases and reject hidden query authority", async () => {
    const { handlers, open } = http(), context = { params: Promise.resolve({ slug: "synthetic" }) };
    expect((await handlers.list(new Request("https://tutribu.example.test/api/tribes/synthetic/admissions/commercial-memberships?role=leader"), context)).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
    const response = await handlers.list(new Request("https://tutribu.example.test/api/tribes/synthetic/admissions/commercial-memberships"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cases: [unknownCase, guardianCase], pendingCount: 2, resolvedCount: 0 });
  });

  it("should accept one same-origin confirmed decision and return its original result", async () => {
    const { post, data } = http(), input = body();
    data.repository.resolve.mockResolvedValueOnce({ state: "completed", operationId: input.operationId, replayed: false, result: { status: "resolved", memberId: guardianCase.memberId, decision: "retire", resultingRole: "tribemate", resultingStatus: "removed", resultingRecoveryStatus: "muted", decidedAt: "2026-10-19T12:00:00.000Z" } });
    const response = await post(guardianCase.memberId, input);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "completed", operationId: input.operationId, result: { status: "resolved", decision: "retire", resultingStatus: "removed" } });
    expect(data.repository.resolve.mock.calls[0][1]).toMatchObject({ memberId: guardianCase.memberId, reason: "No vuelve" });
  });

  it("should reject a foreign origin, a missing confirmation, unknown fields and an invalid member id before composing", async () => {
    const { post, open } = http();
    expect((await post(guardianCase.memberId, body(), "https://evil.example.test")).status).toBe(403);
    expect((await post(guardianCase.memberId, { ...body(), confirmed: false })).status).toBe(400);
    expect((await post(guardianCase.memberId, { ...body(), role: "leader" })).status).toBe(400);
    expect((await post(guardianCase.memberId, { ...body(), decision: "promote" })).status).toBe(400);
    expect((await post("not-a-uuid", body())).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
  });

  it("should answer registered progress as accepted without claiming a result", async () => {
    const { post, data } = http(), input = body();
    data.repository.resolve.mockResolvedValueOnce({ state: "started", operationId: input.operationId });
    const response = await post(guardianCase.memberId, input);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "started", operationId: input.operationId });
  });
});
