/** @vitest-environment node */
/** Exercises real own policy boundary contracts while the concrete HTTP handler is being implemented. @module academy-admission-policy-routes-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { admissionPolicyInitializationSchema, admissionPolicyUpdateSchema, admissionPolicyActivationSchema, admissionPolicyPauseSchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";
import { createAdmissionPolicyCommandHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-command-handlers";
import { ManageAdmissionPolicyUseCases } from "@/src/modules/academy-admissions/application/use-cases/manage-admission-policy-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionPolicyCommandWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { createAdmissionPolicyQueryHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-query-handler";
import { admissionPolicyStateResultSchema } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { createAdmissionPreflightQueryHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-preflight-query-handler";

/** Uses the actual authority resolver and boundary; only feature-owned account/storage ports are replaced. */
function commandFixture() {
  const now = new Date("2026-10-07T07:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), operationId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-08T07:00:00Z") }, googleAccount: { id: accountId, subject }, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const completed = { state: "completed" as const, operationId, replayed: false, result: { policyId: tribeId, version: 1, verificationEpoch: 1, activatedAt: null, controlActivated: false, changed: true } };
  const writer: AdmissionPolicyCommandWriter = { initialize: vi.fn(async () => completed), update: vi.fn(async () => completed), activate: vi.fn(async () => completed), pause: vi.fn(async () => completed) };
  const policy = new ManageAdmissionPolicyUseCases(resolver, { read: async () => ({ policy: null, controlActivated: false, usage: null }) }, writer);
  const open = vi.fn(async () => ({ policy, resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) } }));
  const signedScope = (operation: string) => { account.recentAuthentication = [{ id: randomUUID(), intentId: randomUUID(), userId, sessionId, accountId, subject, tribeId, resourceId: tribeId, operation, authenticatedAt: now, verifiedAt: now, validUntil: new Date("2026-10-07T07:09:00Z"), invalidatedAt: null }]; };
  const request = (body: unknown, origin = "https://tutribu.example.test") => new Request("https://tutribu.example.test/api/tribes/synthetic/policy", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { tribeId, operationId, actor, completed, writer, open, signedScope, request, handlers: createAdmissionPolicyCommandHandlers(open), context: { params: Promise.resolve({ slug: "synthetic" }) } };
}

describe("policy explicit input contracts", () => {
  it("should initialize only from a stable confirmed intent without a version, actor, countries or implicit opening", () => {
    const intent = { operationId: randomUUID(), confirmed: true };
    expect(admissionPolicyInitializationSchema.parse(intent)).toEqual(intent);
    for (const extra of [{ expectedVersion: 0 }, { expectedVersion: 1 }, { isOpen: true }, { allowedCountries: ["AR"] }, { userId: "foreign", role: "leader" }]) expect(admissionPolicyInitializationSchema.safeParse({ ...intent, ...extra }).success).toBe(false);
    expect(admissionPolicyInitializationSchema.safeParse({ ...intent, confirmed: false }).success).toBe(false);
  });

  it("should require an observed existing version and reject policy epoch/activation/country authority from the browser", () => {
    const intent = { operationId: randomUUID(), confirmed: true, expectedVersion: 3, mode: "manual_review", contactType: "email", isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null };
    expect(admissionPolicyUpdateSchema.parse(intent)).toEqual(intent);
    for (const extra of [{ expectedVersion: 0 }, { verificationEpoch: 9 }, { activatedAt: "2026-10-07T01:00:00Z" }, { allowedCountries: ["AR"] }, { paid: true, verified: true }, { role: "leader" }]) expect(admissionPolicyUpdateSchema.safeParse({ ...intent, ...extra }).success).toBe(false);
  });

  it("should keep activate and pause explicit without accepting a preflight or recency boolean as authority", () => {
    const intent = { operationId: randomUUID(), confirmed: true, expectedVersion: 2 };
    expect(admissionPolicyActivationSchema.parse(intent)).toEqual(intent);
    expect(admissionPolicyActivationSchema.safeParse({ ...intent, preflightComplete: true, hasRecentAuthentication: true }).success).toBe(false);
    expect(admissionPolicyPauseSchema.parse({ ...intent, reason: "  Revisión  " })).toEqual({ ...intent, reason: "Revisión" });
    expect(admissionPolicyPauseSchema.safeParse({ ...intent, reason: " " }).success).toBe(false);
  });
});

describe("policy native command HTTP boundary", () => {
  it("should publish safe informational cutover blockers without accepting browser readiness or exposing inventory metadata", async () => {
    const tribeId = randomUUID(), value = { prepared: false, reasons: ["preflight_runtime_unavailable"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 }, privateCatalog: "synthetic-private" };
    const execute = vi.fn(async () => ({ ok: true as const, value })), open = vi.fn(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, preflight: { execute } }));
    const handler = createAdmissionPreflightQueryHandler(open), context = { params: Promise.resolve({ slug: "synthetic" }) };
    expect((await handler(new Request("https://tutribu.example.test/policy/preflight?prepared=true"), context)).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
    const response = await handler(new Request("https://tutribu.example.test/policy/preflight"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ prepared: false, reasons: ["preflight_runtime_unavailable"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } });
    expect(response.headers.get("cache-control")).toContain("no-store");
    execute.mockResolvedValueOnce({ ok: true, value: { ...value, prepared: true } });
    expect((await handler(new Request("https://tutribu.example.test/policy/preflight"), context)).status).toBe(500);
  });

  it("should return a read-only current absence DTO without opening composition for invalid query authority", async () => {
    const tribeId = randomUUID(), value = { state: "not_configured", policy: null, usage: null, controlActivated: false, preparation: { state: "not_evaluated", requirements: ["policy_unavailable"] }, impact: { pendingRequestCount: 0, contactTypeLocked: false, historicalLinksProtected: false, warnings: [] } };
    const execute = vi.fn(async () => ({ ok: true as const, value }));
    const open = vi.fn(async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, policy: { execute } }));
    const handler = createAdmissionPolicyQueryHandler(open), context = { params: Promise.resolve({ slug: "synthetic" }) };
    expect((await handler(new Request("https://tutribu.example.test/policy?role=leader"), context)).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
    const response = await handler(new Request("https://tutribu.example.test/policy"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(value);
    expect(execute).toHaveBeenCalledWith({ tribeId, requestId: expect.any(String) });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(admissionPolicyStateResultSchema.safeParse({ ...value, impact: { ...value.impact, historicalLinksProtected: true } }).success).toBe(false);
    expect(admissionPolicyStateResultSchema.safeParse({ ...value, impact: { ...value.impact, contactTypeLocked: true } }).success).toBe(false);
  });

  it("should reject foreign origin, browser authority and invalid confirmation before opening composition", async () => {
    const data = commandFixture(), body = { operationId: data.operationId, confirmed: true };
    expect((await data.handlers.initialize(data.request(body, "https://foreign.example.test"), data.context)).status).toBe(403);
    for (const extra of [{ confirmed: false }, { expectedVersion: 1 }, { role: "leader" }, { allowedCountries: ["AR"] }]) expect((await data.handlers.initialize(data.request({ ...body, ...extra }), data.context)).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
    expect(data.writer.initialize).not.toHaveBeenCalled();
  });

  it("should deny a guardian and unrelated or browser-only recency before the policy writer", async () => {
    const data = commandFixture(), body = { operationId: data.operationId, confirmed: true, expectedVersion: 1 };
    data.actor.role = "guardian";
    expect((await data.handlers.activate(data.request(body), data.context)).status).toBe(403);
    data.actor.role = "leader";
    expect((await data.handlers.activate(data.request(body), data.context)).status).toBe(401);
    data.signedScope("update_admission_policy");
    expect((await data.handlers.activate(data.request(body), data.context)).status).toBe(401);
    expect((await data.handlers.activate(data.request({ ...body, hasRecentAuthentication: true, preflightComplete: true }), data.context)).status).toBe(400);
    expect(data.writer.activate).not.toHaveBeenCalled();
  });

  it("should confirm activation only with an original committed protection marker", async () => {
    const data = commandFixture(); data.signedScope("activate_admission_policy");
    const body = { operationId: data.operationId, confirmed: true, expectedVersion: 1 };
    vi.mocked(data.writer.activate).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, version: 2 } });
    expect((await data.handlers.activate(data.request(body), data.context)).status).toBe(500);
    vi.mocked(data.writer.activate).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, version: 2, activatedAt: "2026-10-07T07:00:00Z", controlActivated: true } });
    const activated = await data.handlers.activate(data.request(body), data.context);
    expect(activated.status).toBe(200);
    expect(await activated.json()).toMatchObject({ result: { version: 2, controlActivated: true, activatedAt: "2026-10-07T07:00:00Z" } });
  });

  it("should preserve the exact signed initialization intent and publish only its minimal original snapshot", async () => {
    const data = commandFixture(); data.signedScope("update_admission_policy");
    const response = await data.handlers.initialize(data.request({ operationId: data.operationId, confirmed: true }), data.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data.completed);
    expect(data.writer.initialize).toHaveBeenCalledWith({ context: expect.objectContaining({ userId: data.actor.userId, sensitiveOperation: "update_admission_policy", resourceId: data.tribeId }), operationId: data.operationId, confirmed: true, type: "initialize_admission_policy" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("should reject an effective initialization claiming activation or later counters while preserving existing-resource no-ops", async () => {
    const data = commandFixture(); data.signedScope("update_admission_policy");
    const body = { operationId: data.operationId, confirmed: true };
    for (const incorrect of [{ version: 2 }, { verificationEpoch: 2 }, { activatedAt: "2026-10-07T07:00:00Z", controlActivated: true }]) {
      vi.mocked(data.writer.initialize).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, ...incorrect } });
      expect((await data.handlers.initialize(data.request(body), data.context)).status).toBe(500);
    }
    vi.mocked(data.writer.initialize).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, changed: false, version: 5, verificationEpoch: 3, activatedAt: "2026-10-07T07:00:00Z", controlActivated: true } });
    const existing = await data.handlers.initialize(data.request(body), data.context);
    expect(existing.status).toBe(200);
    expect(await existing.json()).toMatchObject({ result: { changed: false, version: 5, verificationEpoch: 3, controlActivated: true } });
  });

  it("should map stale policy to visible 409 without exposing its private cause", async () => {
    const data = commandFixture(); data.signedScope("pause_admission_policy");
    vi.mocked(data.writer.pause).mockRejectedValue(new AdmissionOperationError("policy_conflict", { cause: new Error("Synthetic private SQL diagnostic") }));
    const response = await data.handlers.pause(data.request({ operationId: data.operationId, confirmed: true, expectedVersion: 3, reason: "  Revisión  " }), data.context);
    expect(response.status).toBe(409);
    const result = await response.json();
    expect(result).toMatchObject({ code: "policy_conflict", message: "La configuración cambió. Revisala y volvé a confirmar." });
    expect(JSON.stringify(result)).not.toContain("Synthetic private SQL diagnostic");
    expect(data.writer.pause).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 3, reason: "Revisión" }));
  });

  it("should keep editable draft settings apart from the original UUID/version and reject a second country list", async () => {
    const data = commandFixture(); data.signedScope("update_admission_policy");
    const patch = { mode: "manual_review", contactType: "email", isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: true, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null };
    const body = { operationId: data.operationId, confirmed: true, expectedVersion: 3, ...patch };
    expect((await data.handlers.update(data.request({ ...body, allowedCountries: ["AR"] }), data.context)).status).toBe(400);
    expect(data.writer.update).not.toHaveBeenCalled();
    expect((await data.handlers.update(data.request(body), data.context)).status).toBe(500);
    vi.mocked(data.writer.update).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, version: 4 } });
    expect((await data.handlers.update(data.request(body), data.context)).status).toBe(200);
    expect(data.writer.update).toHaveBeenCalledWith({ context: expect.objectContaining({ sensitiveOperation: "update_admission_policy" }), operationId: data.operationId, confirmed: true, expectedVersion: 3, patch, type: "update_admission_policy" });
    expect(data.writer.activate).not.toHaveBeenCalled();
    expect(data.writer.initialize).not.toHaveBeenCalled();
  });

  it("should preserve a historical replay of the same versioned intent and reject a claimed no-op counter increment", async () => {
    const data = commandFixture(); data.signedScope("pause_admission_policy");
    const body = { operationId: data.operationId, confirmed: true, expectedVersion: 3, reason: "Pausa explícita" };
    vi.mocked(data.writer.pause).mockResolvedValue({ ...data.completed, replayed: true, result: { ...data.completed.result, version: 4 } });
    const replay = await data.handlers.pause(data.request(body), data.context);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, result: { version: 4 } });
    vi.mocked(data.writer.pause).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, version: 4, changed: false } });
    expect((await data.handlers.pause(data.request(body), data.context)).status).toBe(500);
    vi.mocked(data.writer.pause).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, version: 3, changed: false } });
    expect((await data.handlers.pause(data.request(body), data.context)).status).toBe(200);
  });

  it("should return 202 only for the registered original operation and reject foreign commit or UUID results", async () => {
    const data = commandFixture(); data.signedScope("update_admission_policy");
    const body = { operationId: data.operationId, confirmed: true };
    vi.mocked(data.writer.initialize).mockResolvedValue({ state: "started", operationId: data.operationId });
    const started = await data.handlers.initialize(data.request(body), data.context);
    expect(started.status).toBe(202);
    expect(await started.json()).toEqual({ state: "started", operationId: data.operationId });
    vi.mocked(data.writer.initialize).mockResolvedValue({ ...data.completed, operationId: randomUUID() });
    expect((await data.handlers.initialize(data.request(body), data.context)).status).toBe(500);
    vi.mocked(data.writer.initialize).mockResolvedValue({ ...data.completed, result: { ...data.completed.result, policyId: randomUUID() } });
    expect((await data.handlers.initialize(data.request(body), data.context)).status).toBe(500);
  });
});
