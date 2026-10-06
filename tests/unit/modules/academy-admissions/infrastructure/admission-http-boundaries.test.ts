/** @vitest-environment node */

/** Exercises own HTTP/DTO boundaries and real SDK failures without disclosing private diagnostics. */
import { randomUUID } from "node:crypto";
import Zavu, { APIConnectionTimeoutError } from "@zavudev/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAdmissionRouteBoundary } from "@/src/modules/academy-admissions/infrastructure/api/admission-route-http";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { allowlistEntryUpdateSchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";
import { normalizeMessagingProviderFailure } from "@/src/modules/messaging/infrastructure/api/messaging-route-http";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { LoadAuthorizedMessagingSecretUseCase, ResolveMessagingContextUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import type { MessagingAuthenticatedAccount, MessagingConnectionAuthorizationFacts, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

describe("admission own HTTP boundary", () => {
  const createRequest = (body: unknown) => new Request("https://tutribu.example.test/api/tribes/synthetic/admissions/allowlist", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("should reject an unversioned command before application work and log only issue categories", async () => {
    const privateValue = randomUUID();
    const diagnostics: unknown[] = [];
    const boundary = createAdmissionRouteBoundary({ request: createRequest({ displayName: privateValue, expectedVersion: 0, verified: true }), operation: "update_allowlist", diagnostics: (entry) => diagnostics.push(entry) });
    const result = await boundary.readBody(allowlistEntryUpdateSchema);
    expect(result.usable).toBe(false);
    if (result.usable) throw new Error("Expected rejected input");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ code: "invalid_input", message: "Revisá los datos de la operación antes de confirmar." });
    expect(JSON.stringify(diagnostics)).not.toContain(privateValue);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
  });

  it("should parse a command once and preserve only its own normalized fields", async () => {
    const command = { operationId: randomUUID(), expectedVersion: 2, status: "disabled", confirmed: true };
    const boundary = createAdmissionRouteBoundary({ request: createRequest(command), operation: "update_allowlist", diagnostics: () => undefined });
    expect(await boundary.readBody(allowlistEntryUpdateSchema)).toEqual({ usable: true, value: command });
    const repeated = await boundary.readBody(allowlistEntryUpdateSchema);
    expect(repeated.usable).toBe(false);
    if (repeated.usable) throw new Error("Expected duplicate-read invariant failure");
    expect(repeated.response.status).toBe(500);
  });

  it("should return invalid_input for malformed JSON without exposing its text", async () => {
    const request = new Request("https://tutribu.example.test/api/admissions", { method: "POST", body: "{broken" });
    const result = await createAdmissionRouteBoundary({ request, operation: "submit", diagnostics: () => undefined }).readBody(z.object({ operationId: z.uuid() }));
    expect(result.usable).toBe(false);
    if (result.usable) throw new Error("Expected malformed JSON rejection");
    expect(result.response.status).toBe(400);
    expect(await result.response.text()).not.toContain("{broken");
  });

  it("should validate an own response/props DTO and strip private nested values before consumption", async () => {
    const privateValue = randomUUID();
    const schema = z.object({ state: z.literal("pending"), request: z.object({ id: z.uuid(), version: z.int().positive() }) });
    const own = { state: "pending", request: { id: randomUUID(), version: 1, internalReason: privateValue }, apiKey: privateValue };
    const boundary = createAdmissionRouteBoundary({ request: createRequest({}), operation: "submit", diagnostics: () => undefined });
    const response = boundary.success(schema, own);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "pending", request: { id: own.request.id, version: 1 } });
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("should reject an unusable public DTO rather than forward private diagnostics", async () => {
    const privateValue = randomUUID();
    const diagnostics: unknown[] = [];
    const boundary = createAdmissionRouteBoundary({ request: createRequest({}), operation: "submit", diagnostics: (entry) => diagnostics.push(entry) });
    const response = boundary.success(z.object({ version: z.int().positive() }), { version: 0, cause: { secret: privateValue } });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "public_contract_unusable" });
    expect(JSON.stringify(diagnostics)).not.toContain(privateValue);
  });

  it.each([
    { code: "authentication_required", status: 401 }, { code: "permission_denied", status: 403 },
    { code: "resource_unavailable", status: 404 }, { code: "allowlist_conflict", status: 409 },
    { code: "invitation_conflict", status: 409 }, { code: "usage_policy_conflict", status: 409 },
    { code: "recipient_not_allowed", status: 422 }, { code: "usage_limit_reached", status: 429 },
    { code: "dependency_unavailable", status: 503 },
  ] as const)("should map $code to $status with a new safe public projection", async (row) => {
    const privateValue = randomUUID();
    const failure = admissionFailure(row.code, { cause: new Error(privateValue) });
    const boundary = createAdmissionRouteBoundary({ request: createRequest({}), operation: "submit", diagnostics: () => undefined });
    const response = boundary.failure(failure);
    expect(response.status).toBe(row.status);
    const body = await response.json();
    expect(admissionPublicErrorSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ code: row.code, requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain(privateValue);
    expect(body).not.toHaveProperty("cause");
  });

  it.each([null, undefined, "raw thrown string", { message: "untrusted diagnostics", token: "opaque-test-value" }])("should close an unknown thrown value %s without forwarding it", async (error) => {
    const diagnostics: unknown[] = [];
    const boundary = createAdmissionRouteBoundary({ request: createRequest({}), operation: "submit", diagnostics: (entry) => diagnostics.push(entry) });
    const response = boundary.unexpected(error);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "unexpected_failure" });
    expect(JSON.stringify(diagnostics)).not.toContain("untrusted diagnostics");
    expect(JSON.stringify(diagnostics)).not.toContain("raw thrown string");
  });

  it("should propagate intentional request cancellation without publishing an error outcome", () => {
    const controller = new AbortController();
    const request = new Request("https://tutribu.example.test/api/admissions", { signal: controller.signal });
    const diagnostics: unknown[] = [];
    const boundary = createAdmissionRouteBoundary({ request, operation: "read", diagnostics: (entry) => diagnostics.push(entry) });
    controller.abort();
    expect(() => boundary.unexpected(controller.signal.reason)).toThrow(controller.signal.reason);
    expect(diagnostics).toEqual([]);
  });

  it("should not invent a registered operation when a commit outcome is unresolved", async () => {
    const boundary = createAdmissionRouteBoundary({ request: createRequest({}), operation: "submit", diagnostics: () => undefined });
    const absent = boundary.failure(admissionFailure("operation_unresolved"));
    expect(absent.status).toBe(500);
    expect(await absent.json()).toMatchObject({ code: "public_contract_unusable" });
    const operation = { operationId: randomUUID(), state: "started" as const };
    const registered = boundary.failure(admissionFailure("operation_unresolved", { operation }));
    expect(registered.status).toBe(202);
    expect(await registered.json()).toMatchObject({ code: "operation_unresolved", operation });
  });

  it("should reject an unusable error body at a browser consumer instead of rendering upstream copy", () => {
    const requestId = randomUUID();
    for (const body of [null, "raw provider copy", { code: "unexpected_failure", message: "raw provider copy", requestId }, { code: "provider_unknown_code", message: "No pudimos completar el ingreso.", requestId }]) {
      expect(admissionPublicErrorSchema.safeParse(body).success).toBe(false);
    }
    expect(admissionPublicErrorSchema.parse({ code: "permission_denied", message: "No tenés permiso para realizar esta operación.", requestId, cause: { secret: randomUUID() } })).toEqual({ code: "permission_denied", message: "No tenés permiso para realizar esta operación.", requestId });
  });

  it("should validate params and query once before exposing them to application", async () => {
    const boundary = createAdmissionRouteBoundary({ request: createRequest({}), operation: "get_request", diagnostics: () => undefined });
    expect(boundary.input("params", z.strictObject({ requestId: z.uuid() }), { requestId: randomUUID() }).usable).toBe(true);
    const query = boundary.input("query", z.strictObject({ state: z.literal("pending") }), { state: "all", role: "leader" });
    expect(query.usable).toBe(false);
    if (query.usable) throw new Error("Expected invalid query rejection");
    expect(query.response.status).toBe(400);
  });
});

describe("real messaging failure classification", () => {
  it.each([
    { status: 400, code: "upstream_rejected" }, { status: 422, code: "upstream_rejected" },
    { status: 401, code: "invalid_credentials" }, { status: 403, code: "missing_capability" },
    { status: 429, code: "provider_rate_limited" }, { status: 503, code: "dependency_unavailable" },
    { status: 408, code: "transport_timeout" },
  ] as const)("should prefer SDK HTTP $status over an upstream message mentioning timeout", async (row) => {
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/me", method: "GET", respond: () => Response.json({ error: { message: "timeout with private provider details" } }, { status: row.status }) }]);
    const client = new Zavu({ apiKey: randomUUID(), baseURL: "https://api.zavu.dev", fetch: transport.fetch, maxRetries: 0, logLevel: "off" });
    let caught: unknown;
    try { await client.me.retrieve(); } catch (error) { caught = error; }
    expect(normalizeMessagingProviderFailure(caught, { operation: "read", dispatchAuthorized: false })).toMatchObject({ code: row.code, upstreamStatus: row.status, cause: caught });
    expect(transport.receipts).toHaveLength(1);
  });

  it("should preserve possible external dispatch after a timeout or uncorrelated 409", () => {
    const timeout = new APIConnectionTimeoutError();
    expect(normalizeMessagingProviderFailure(timeout, { operation: "send", dispatchAuthorized: true })).toMatchObject({ code: "delivery_unknown", cause: timeout });
    expect(normalizeMessagingProviderFailure({ status: 409 }, { operation: "send", dispatchAuthorized: true })).toMatchObject({ code: "delivery_unknown" });
    expect(normalizeMessagingProviderFailure(timeout, { operation: "read", dispatchAuthorized: false })).toMatchObject({ code: "transport_timeout" });
  });

  it("should preserve uncertainty for a real HTTP 408 response after the durable send marker", async () => {
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: () => Response.json({ error: { message: "request timeout" } }, { status: 408 }) }]);
    const client = new Zavu({ apiKey: randomUUID(), baseURL: "https://api.zavu.dev", fetch: transport.fetch, maxRetries: 0, logLevel: "off" });
    let caught: unknown;
    try { await client.messages.send({ "Zavu-Sender": randomUUID(), to: "synthetic@example.test", channel: "email", subject: "Prueba sintética", text: randomUUID(), fallbackEnabled: false, idempotencyKey: randomUUID() }); } catch (error) { caught = error; }
    expect(normalizeMessagingProviderFailure(caught, { operation: "send", dispatchAuthorized: true })).toMatchObject({ code: "delivery_unknown", upstreamStatus: 408, cause: caught });
    expect(transport.receipts).toHaveLength(1);
  });
});

describe("current messaging authority before SecretStore", () => {
  /** Own port facts are detached from browser inputs; no auth/database/SDK library is replaced. */
  function createAuthority() {
    const now = new Date("2026-10-05T12:00:00.000Z");
    const command = { tribeId: "tribe-a", connectionId: "connection-a", operation: "validate_messaging_connection", requestId: randomUUID() };
    const evidence = { userId: "leader-a", sessionId: "session-a", accountId: "google-account-a", subject: "google-subject-a", tribeId: command.tribeId, operation: command.operation, resourceId: command.connectionId, intentId: "consumed-intent", authenticatedAt: new Date(now.getTime() - 60_000), verifiedAt: now, validUntil: new Date(now.getTime() + 540_000), invalidatedAt: null };
    const account: MessagingAuthenticatedAccount = { userId: evidence.userId, session: { id: evidence.sessionId, expiresAt: new Date(now.getTime() + 3_600_000) }, googleAccount: { id: evidence.accountId, subject: evidence.subject }, recentAuthentication: [evidence] };
    const leadership: MessagingLeadershipFacts = { tribeId: command.tribeId, leaderUserId: account.userId, membership: { userId: account.userId, role: "leader", status: "active" } };
    const connection: MessagingConnectionAuthorizationFacts = { id: command.connectionId, tribeId: command.tribeId, version: 1, contributedByUserId: account.userId, state: "active", securityEpoch: "epoch-a", retiredAt: null, secretRef: "secret-a" };
    const security = { environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false };
    const state = { account: account as MessagingAuthenticatedAccount | null, leadership: leadership as MessagingLeadershipFacts | null, connection: connection as MessagingConnectionAuthorizationFacts | null, security, now, secretLoads: 0, afterResourceRead: () => undefined as void };
    const resolver = new ResolveMessagingContextUseCase(
      { getAuthenticatedAccount: async () => state.account ? structuredClone(state.account) : null },
      { getCurrentLeadership: async () => state.leadership ? structuredClone(state.leadership) : null, getConnection: async () => { state.afterResourceRead(); return state.connection ? structuredClone(state.connection) : null; } },
      { getCurrentSecurityFacts: async () => ({ ...state.security }) }, () => state.now,
    );
    const loader = new LoadAuthorizedMessagingSecretUseCase(resolver, { loadAuthorizedSecret: async () => { state.secretLoads += 1; return randomUUID(); } });
    return { state, command, loader };
  }

  it("should load a credential only after resolving the current leader and exact recent scope", async () => {
    const { state, command, loader } = createAuthority();
    expect(await loader.execute(command)).toMatchObject({ allowed: true, context: { actorUserId: "leader-a", tribeId: command.tribeId, connectionId: command.connectionId, connectionVersion: 1 } });
    expect(state.secretLoads).toBe(1);
  });

  it.each(["missing_session", "guardian", "muted", "wrong_tribe", "wrong_resource", "previous_leader", "retired", "suspended", "disconnected", "old_epoch", "recovery_lock", "expired_session", "invalid_session_expiry", "old_authentication", "wrong_account", "wrong_subject", "wrong_operation"] as const)("should reject %s before calling SecretStore", async (changed) => {
    const { state, command, loader } = createAuthority();
    if (changed === "missing_session") state.account = null;
    if (changed === "guardian") state.leadership!.membership!.role = "guardian";
    if (changed === "muted") state.leadership!.membership!.status = "muted";
    if (changed === "wrong_tribe") state.connection!.tribeId = "tribe-b";
    if (changed === "wrong_resource") state.connection!.id = "connection-b";
    if (changed === "previous_leader") state.connection!.contributedByUserId = "previous-leader";
    if (changed === "retired") state.connection!.retiredAt = state.now;
    if (changed === "suspended") state.connection!.state = "suspended";
    if (changed === "disconnected") state.connection!.state = "disconnected";
    if (changed === "old_epoch") state.security.securityEpoch = "epoch-after-restore";
    if (changed === "recovery_lock") state.security.recoveryLocked = true;
    if (changed === "expired_session") state.account!.session.expiresAt = state.now;
    if (changed === "invalid_session_expiry") state.account!.session.expiresAt = new Date(Number.NaN);
    if (changed === "old_authentication") state.account!.recentAuthentication[0].authenticatedAt = new Date(state.now.getTime() - 600_000);
    if (changed === "wrong_account") state.account!.googleAccount!.id = "other-account";
    if (changed === "wrong_subject") state.account!.googleAccount!.subject = "other-subject";
    if (changed === "wrong_operation") command.operation = "rotate_messaging_credentials";
    expect(await loader.execute(command)).toMatchObject({ allowed: false });
    expect(state.secretLoads).toBe(0);
  });

  it("should revalidate a role lost during a resource read before loading the credential", async () => {
    const { state, command, loader } = createAuthority();
    state.afterResourceRead = () => { state.leadership!.leaderUserId = "new-leader"; state.leadership!.membership!.role = "tribemate"; };
    expect(await loader.execute(command)).toMatchObject({ allowed: false, failure: { code: "permission_denied" } });
    expect(state.secretLoads).toBe(0);
  });

  it("should reject a revoked session after an awaited resource read", async () => {
    const { state, command, loader } = createAuthority();
    state.afterResourceRead = () => { state.account = null; };
    expect(await loader.execute(command)).toMatchObject({ allowed: false, failure: { code: "authentication_required" } });
    expect(state.secretLoads).toBe(0);
  });
});
