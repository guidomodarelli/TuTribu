/** @vitest-environment node */
/** Exercises native Request/Response and actual own boundaries with only application ports supplied. @module academy-admission-routes-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionQueryHandlers, type AdmissionQueryServices } from "@/src/modules/academy-admissions/infrastructure/api/admission-query-handlers";
import { createAdmissionMutationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-mutation-handlers";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { DecideAdmissionRequestUseCase } from "@/src/modules/academy-admissions/application/use-cases/decide-admission-request-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionCommandWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";

/** Creates explicit read-only application ports and public own data, without platform mocks. */
function queryHandlers() {
  const overview = { tribe: { slug: "synthetic-academy", name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "sign_in_required", nextAction: "sign_in", safeMessage: "Iniciá sesión para continuar.", secretReference: randomUUID() };
  const ports = {
    overview: { execute: vi.fn<AdmissionQueryServices["overview"]["execute"]>(async () => ({ ok: true, value: overview })) },
    resolveTribe: { execute: vi.fn<AdmissionQueryServices["resolveTribe"]["execute"]>(async () => ({ ok: true, value: { tribeId: randomUUID() } })) },
    own: { getOwn: vi.fn<AdmissionQueryServices["own"]["getOwn"]>(async () => ({ ok: true, value: null })) },
  };
  const open = vi.fn(async () => ports);
  return { ports, open, handlers: createAdmissionQueryHandlers(open) };
}

describe("academy admission query handlers", () => {
  it("should return an allowlisted public overview with private caching and safe correlation without mutation ports", async () => {
    const fixture = queryHandlers();
    const response = await fixture.handlers.overview(new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/overview", { headers: { "x-request-id": "synthetic-overview-request" } }), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toBe("synthetic-overview-request");
    const body = await response.json();
    expect(body).toMatchObject({ state: "sign_in_required", tribe: { slug: "synthetic-academy" } });
    expect(body).not.toHaveProperty("secretReference");
    expect(fixture.ports.own.getOwn).not.toHaveBeenCalled();
    expect(fixture.ports.resolveTribe.execute).not.toHaveBeenCalled();
  });

  it("should reject malformed paths and browser identity/query flags before opening any module", async () => {
    const fixture = queryHandlers();
    expect((await fixture.handlers.overview(new Request("https://tutribu.example.invalid/api/tribes/a/admissions/overview"), { params: Promise.resolve({ slug: "../foreign" }) })).status).toBe(400);
    expect((await fixture.handlers.own(new Request("https://tutribu.example.invalid/api/tribes/a/admissions/own-request?userId=foreign&role=leader"), { params: Promise.resolve({ slug: "synthetic-academy" }) })).status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should represent own absence without a version and translate unexpected composition failures without raw details", async () => {
    const fixture = queryHandlers();
    const response = await fixture.handlers.own(new Request("https://tutribu.example.invalid/api/tribes/a/admissions/own-request"), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    fixture.open.mockRejectedValueOnce(new Error("Synthetic internal provider identifier and stack"));
    const failed = await fixture.handlers.overview(new Request("https://tutribu.example.invalid/api/tribes/a/admissions/overview"), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ code: "unexpected_failure", message: expect.any(String) });
    expect(fixture.ports.overview.execute).not.toHaveBeenCalled();
  });

  it("should project an exact own request without reviewer-only fields and reject an unusable own DTO", async () => {
    const fixture = queryHandlers(), admissionRequestId = randomUUID();
    const request = new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/own-request?admissionRequestId=${admissionRequestId}`);
    const context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
    fixture.ports.own.getOwn.mockResolvedValueOnce({ ok: true, value: { id: admissionRequestId, status: "pending", version: 1, submittedAt: "2026-10-07T00:00:00Z", expiresAt: "2026-11-06T00:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], internalReason: "Private reviewer reason", providerToken: "Private provider token" } });
    const response = await fixture.handlers.own(request, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: admissionRequestId, status: "pending", version: 1, submittedAt: "2026-10-07T00:00:00Z", expiresAt: "2026-11-06T00:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [] });
    expect(fixture.ports.own.getOwn).toHaveBeenCalledWith(expect.objectContaining({ admissionRequestId }));
    fixture.ports.own.getOwn.mockResolvedValueOnce({ ok: true, value: { id: admissionRequestId, status: "pending", version: 0, internalReason: "Private reviewer reason" } });
    const unusable = await fixture.handlers.own(request, context);
    expect(unusable.status).toBe(500);
    expect(await unusable.json()).toMatchObject({ code: "public_contract_unusable" });
  });

  it("should preserve current authentication failure without reading own data and reject an unusable public overview", async () => {
    const fixture = queryHandlers(), context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
    fixture.ports.resolveTribe.execute.mockResolvedValueOnce({ ok: false, failure: { code: "authentication_required" } });
    const own = await fixture.handlers.own(new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/own-request"), context);
    expect(own.status).toBe(401);
    expect(fixture.ports.own.getOwn).not.toHaveBeenCalled();
    fixture.ports.overview.execute.mockResolvedValueOnce({ ok: true, value: { state: "pending", secretReference: "Private provider reference" } });
    const publicResponse = await fixture.handlers.overview(new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/overview"), context);
    expect(publicResponse.status).toBe(500);
    expect(await publicResponse.json()).toEqual(expect.objectContaining({ code: "public_contract_unusable", message: expect.any(String), requestId: expect.any(String) }));
  });
});

describe("admission HTTP with actual current-authority use cases", () => {
  it("should reject self approval and a role revoked during lookup before any decision write", async () => {
    const tribeId = randomUUID(), requestId = randomUUID(), operationId = randomUUID();
    const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "reviewer@example.test", session: { id: randomUUID(), expiresAt: new Date("2100-10-07T12:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
    const actor: AdmissionActorFacts = { userId: account.userId, tribeId, role: "guardian", status: "active" };
    let applicantUserId = account.userId, revokeDuringLookup = false;
    const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => { if (revokeDuringLookup) actor.status = "muted"; return { id: requestId, tribeId, applicantUserId }; } }, () => new Date("2026-10-07T00:00:00Z"));
    const write = vi.fn<AdmissionCommandWriter["decide"]>();
    const writer: AdmissionCommandWriter = { submit: vi.fn(), cancel: vi.fn(), decide: write };
    const useCase = new DecideAdmissionRequestUseCase(resolver, writer);
    const handlers = createAdmissionMutationHandlers(async () => ({ resolveTribe: { execute: async () => ({ ok: true, value: { tribeId } }) }, submit: { execute: vi.fn() }, cancelOwn: { execute: vi.fn() }, cancelByManagement: { execute: vi.fn() }, decide: useCase, allowRetry: { execute: vi.fn() } }));
    const context = { params: Promise.resolve({ slug: "synthetic-academy", requestId }) };
    const request = () => new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/requests/${requestId}/decision`, { method: "POST", headers: { origin: "https://tutribu.example.invalid", "content-type": "application/json" }, body: JSON.stringify({ operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión" }) });
    const selfApproval = await handlers.decide(request(), context);
    expect(selfApproval.status).toBe(403);
    expect(await selfApproval.json()).toMatchObject({ code: "permission_denied" });
    applicantUserId = randomUUID(); revokeDuringLookup = true;
    const revoked = await handlers.decide(request(), context);
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({ code: "permission_denied" });
    expect(write).not.toHaveBeenCalled();
  });
});
