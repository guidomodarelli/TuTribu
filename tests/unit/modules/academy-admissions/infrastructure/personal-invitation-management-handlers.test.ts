/** @vitest-environment node */
/** Exercises actual administrative HTTP guards while replacing only the feature's own application ports. @module personal-invitation-management-handler-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPersonalInvitationManagementHandlers, type PersonalInvitationManagementServices } from "@/src/modules/academy-admissions/infrastructure/api/personal-invitation-management-handlers";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";

/** @returns Own application ports, native Requests and guarded handlers; validators and HTTP responses remain real. */
function setup() {
  const tribeId = randomUUID(), invitationId = randomUUID(), operationId = randomUUID();
  const metadata = { id: invitationId, version: 1, internalName: "Grupo inicial", recipient: { type: "email" as const, value: "recipient@example.test" }, requiresAllowlist: true, expiresAt: null, status: "active" as const, createdAt: "2026-10-09T10:00:00Z", redeemedAt: null, revokedAt: null, authorizationRevokedAt: null };
  const snapshot = { invitationId, version: 1, changed: true, created: true };
  const services: PersonalInvitationManagementServices = {
    resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) },
    publicOrigin: vi.fn(() => "https://tutribu.example.test"),
    invitations: {
      list: vi.fn(async () => ({ ok: true as const, value: { items: [metadata], nextCursor: null } })),
      read: vi.fn(async () => ({ ok: true as const, value: metadata })),
      create: vi.fn(async () => ({ ok: true as const, value: { state: "completed" as const, operationId, replayed: false as const, result: snapshot, initialToken: randomBytes(32).toString("base64url") } })),
      rename: vi.fn(async () => ({ ok: true as const, value: { state: "completed" as const, operationId, replayed: false, result: { ...snapshot, version: 2, created: false } } })),
      revoke: vi.fn(async () => ({ ok: true as const, value: { state: "completed" as const, operationId, replayed: false, result: { ...snapshot, version: 2, created: false } } })),
    },
  };
  const open = vi.fn(async () => services), handlers = createPersonalInvitationManagementHandlers(open);
  const context = { params: Promise.resolve({ slug: "synthetic", invitationId }) };
  const creation = { operationId, confirmed: true, internalName: "Grupo inicial", recipient: { type: "email", value: "recipient@example.test" }, requiresAllowlist: true };
  /** @param method - Explicit own method. @param body - Browser proposal. @param query - Own query. @param origin - Native Origin header. @returns The actual Web request without actor authority. */
  const request = (method = "GET", body?: unknown, query = "", origin = "https://tutribu.example.test") => new Request(`https://tutribu.example.test/api/tribes/synthetic/admissions/invitations${query}`, { method, headers: { origin, "content-type": "application/json", "x-request-id": "synthetic-management" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { tribeId, invitationId, operationId, metadata, snapshot, services, open, handlers, context, creation, request };
}

describe("personal invitation management HTTP", () => {
  it("should read only private metadata without opening security or creating an operation", async () => {
    const fixture = setup();
    const response = await fixture.handlers.list(fixture.request(), { params: Promise.resolve({ slug: "synthetic" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [fixture.metadata], nextCursor: null });
    expect(fixture.services.publicOrigin).not.toHaveBeenCalled();
    expect(fixture.services.invitations.create).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("should normalize private status and microsecond cursor without accepting caller authority", async () => {
    const fixture = setup(), timestamp = "2026-10-09T10:00:00.123456Z";
    const response = await fixture.handlers.list(fixture.request("GET", undefined, `?limit=2&status=redeemed&cursor=${encodeURIComponent(timestamp + "~" + fixture.invitationId.toUpperCase())}`), { params: Promise.resolve({ slug: "synthetic" }) });
    expect(response.status).toBe(200);
    expect(fixture.services.invitations.list).toHaveBeenCalledWith({ tribeId: fixture.tribeId, requestId: "synthetic-management", limit: 2, status: "redeemed", cursor: { createdAt: timestamp, id: fixture.invitationId } });
  });

  it.each(["?limit=0", "?limit=201", "?role=leader", "?cursor=invalid", "?status=unknown"])("should reject invalid private list input %s before composition", async (query) => {
    const fixture = setup();
    expect((await fixture.handlers.list(fixture.request("GET", undefined, query), { params: Promise.resolve({ slug: "synthetic" }) })).status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should return a configured one-view URL only for the original acknowledged creation", async () => {
    const fixture = setup();
    const response = await fixture.handlers.create(fixture.request("POST", fixture.creation), { params: Promise.resolve({ slug: "synthetic" }) }), body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ state: "completed", operationId: fixture.operationId, replayed: false, result: fixture.snapshot });
    expect(new URL(body.invitationUrl).origin).toBe("https://tutribu.example.test");
    expect(new URL(body.invitationUrl).pathname).toMatch(/^\/admissions\/invitations\/[A-Za-z0-9_-]{43}$/u);
    expect(body).not.toHaveProperty("initialToken");
    expect(fixture.services.invitations.create).toHaveBeenCalledWith({ tribeId: fixture.tribeId, requestId: "synthetic-management", operationId: fixture.operationId, confirmed: true, internalName: "Grupo inicial", contactType: "email", identity: "recipient@example.test", requiresAllowlist: true, allowlistExemptionAcknowledged: false });
    vi.mocked(fixture.services.invitations.create).mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: true, result: fixture.snapshot } });
    const replay = await fixture.handlers.create(fixture.request("POST", fixture.creation), { params: Promise.resolve({ slug: "synthetic" }) });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ state: "completed", operationId: fixture.operationId, replayed: true, result: fixture.snapshot });
  });

  it("should preserve explicit exemption, offset expiry and observed replacement in the inward command", async () => {
    const fixture = setup(), expiresAt = "2026-10-16T12:30:00-03:00";
    const command = { ...fixture.creation, operationId: fixture.operationId.toUpperCase(), requiresAllowlist: false, acknowledgeNoAllowlist: true, expiresAt, replacement: { invitationId: fixture.invitationId.toUpperCase(), expectedVersion: 4 } };
    expect((await fixture.handlers.create(fixture.request("POST", command), { params: Promise.resolve({ slug: "synthetic" }) })).status).toBe(201);
    expect(fixture.services.invitations.create).toHaveBeenCalledWith(expect.objectContaining({ operationId: fixture.operationId, expiresAt: new Date(expiresAt), allowlistExemptionAcknowledged: true, replacement: { invitationId: fixture.invitationId, expectedVersion: 4 } }));
  });

  it.each([{ confirmed: false }, { requiresAllowlist: false }, { token: "caller-token" }, { actorUserId: "caller" }, { replacement: { invitationId: randomUUID(), expectedVersion: 0 } }])("should reject invalid issuance proposal %j without calling the owner", async (patch) => {
    const fixture = setup();
    expect((await fixture.handlers.create(fixture.request("POST", { ...fixture.creation, ...patch }), { params: Promise.resolve({ slug: "synthetic" }) })).status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should retain original started progress without an invented invitation or URL", async () => {
    const fixture = setup();
    vi.mocked(fixture.services.invitations.create).mockResolvedValueOnce({ ok: true, value: { state: "started", operationId: fixture.operationId } });
    const response = await fixture.handlers.create(fixture.request("POST", fixture.creation), { params: Promise.resolve({ slug: "synthetic" }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "started", operationId: fixture.operationId });
  });

  it("should rename and separately revoke redeemed authorization with exact resource version", async () => {
    const fixture = setup(), input = { operationId: fixture.operationId, confirmed: true, expectedVersion: 1 };
    expect((await fixture.handlers.rename(fixture.request("PATCH", { ...input, internalName: "Otro nombre" }), fixture.context)).status).toBe(200);
    expect((await fixture.handlers.revoke(fixture.request("POST", { ...input, reason: "Retiro confirmado", revokeRedeemedAuthorization: true }), fixture.context)).status).toBe(200);
    expect(fixture.services.invitations.revoke).toHaveBeenCalledWith({ tribeId: fixture.tribeId, requestId: "synthetic-management", invitationId: fixture.invitationId, ...input, internalReason: "Retiro confirmado", revokeRedeemedAuthorization: true });
  });

  it("should preserve a stale conflict and original operation reference without converting the action", async () => {
    const fixture = setup();
    vi.mocked(fixture.services.invitations.revoke).mockResolvedValueOnce({ ok: false, failure: admissionFailure("invitation_conflict", { operation: { operationId: fixture.operationId, state: "completed" } }) });
    const response = await fixture.handlers.revoke(fixture.request("POST", { operationId: fixture.operationId, confirmed: true, expectedVersion: 1, reason: "Revocar" }), fixture.context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "invitation_conflict", operation: { operationId: fixture.operationId, state: "completed" } });
    expect(fixture.services.invitations.revoke).toHaveBeenCalledTimes(1);
  });

  it("should reject an origin violation before any private composition", async () => {
    const fixture = setup();
    expect((await fixture.handlers.create(fixture.request("POST", fixture.creation, "", "https://other.example.test"), { params: Promise.resolve({ slug: "synthetic" }) })).status).toBe(403);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should close another original operation or mismatched resource before returning a public outcome", async () => {
    const fixture = setup();
    vi.mocked(fixture.services.invitations.create).mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: randomUUID(), replayed: true, result: fixture.snapshot } });
    expect((await fixture.handlers.create(fixture.request("POST", fixture.creation), { params: Promise.resolve({ slug: "synthetic" }) })).status).toBe(500);
    vi.mocked(fixture.services.invitations.read).mockResolvedValueOnce({ ok: true, value: { ...fixture.metadata, id: randomUUID() } });
    expect((await fixture.handlers.read(fixture.request(), fixture.context)).status).toBe(500);
  });
});
