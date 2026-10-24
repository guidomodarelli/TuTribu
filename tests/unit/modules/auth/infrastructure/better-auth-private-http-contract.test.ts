/** @vitest-environment node */
/** Verifies private auth HTTP mapping and real SDK diagnostics at their public boundaries. @module better-auth-private-http-contract-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import { createScopedAuthEvidenceHandler } from "@/src/modules/auth/infrastructure/better-auth/scoped-auth-evidence-handler";
import { createBetterAuthLogger, runWithBetterAuthLoggingContext, resolveBetterAuthLoggingContext } from "@/src/modules/auth/infrastructure/better-auth/better-auth-logger";
import { projectPublicAuthResponse } from "@/src/modules/auth/infrastructure/better-auth/public-auth-session-response";
import { resolvePrivateRequestContext } from "@/src/modules/shared/infrastructure/observability/private-request-context";
import { BETTER_AUTH_PRIVACY_TEST } from "@/tests/support/constants/better-auth-privacy";

describe("private native authentication boundaries", () => {
  it.each(["/get-session", "/get-session/", "/get%2Dsession"]) ("should select own session fields and preserve cookies at %s", async (path) => {
    const token = randomUUID(), context = { requestId: randomUUID(), traceId: randomUUID() };
    const instant = new Date().toISOString(), userId = randomUUID();
    const native = Response.json({ session: { id: randomUUID(), userId, token, expiresAt: instant, createdAt: instant, updatedAt: instant, privateProviderField: token }, user: { id: userId, name: "Synthetic member", email: `${randomUUID()}@example.test`, emailVerified: true, createdAt: instant, updatedAt: instant, privateProviderField: token } }, { headers: { "set-cookie": "synthetic=value; HttpOnly; Secure", etag: "stale-representation", "content-length": "1", "cache-control": "public" } });
    const response = await projectPublicAuthResponse(new Request(`${BETTER_AUTH_PRIVACY_TEST.baseUrl}/api/auth${path}`), native, context);
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json()).includes(token)).toBe(false);
    expect(response.headers.getSetCookie()).toEqual(native.headers.getSetCookie());
    expect(response.headers.get("etag")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-trace-id")).toBe(context.traceId);
  });

  it("should reject an unusable own DTO without changing a native failure into anonymous success", async () => {
    const token = randomUUID(), context = { requestId: randomUUID(), traceId: randomUUID() };
    const capture = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const malformed = await projectPublicAuthResponse(new Request(`${BETTER_AUTH_PRIVACY_TEST.baseUrl}/api/auth/get-session`), Response.json({ session: { token }, user: null }, { headers: { "set-cookie": "synthetic=value; HttpOnly" } }), context);
      expect(malformed.status).toBe(500);
      const body = await malformed.json();
      expect(body).toMatchObject({ code: "public_contract_unusable", requestId: context.requestId });
      expect(JSON.stringify(body).includes(token)).toBe(false);
      expect(capture.mock.calls.some((argumentsList) => JSON.stringify(argumentsList).includes(token))).toBe(false);
      expect(malformed.headers.getSetCookie()).toHaveLength(1);
      const native = Response.json({ code: "INTERNAL_SERVER_ERROR", message: "Synthetic safe native failure" }, { status: 500, headers: { "set-cookie": "synthetic=; Max-Age=0; HttpOnly" } });
      const expected = await native.clone().json();
      const failed = await projectPublicAuthResponse(new Request(`${BETTER_AUTH_PRIVACY_TEST.baseUrl}/api/auth/get-session`), native, context);
      expect(failed.status).toBe(native.status);
      expect(await failed.json()).toEqual(expected);
      expect(failed.headers.getSetCookie()).toEqual(native.headers.getSetCookie());
    } finally { capture.mockRestore(); }
  });

  it.each(["https://private.example.test/?token=private", "first,second", "a".repeat(129)])("should reject unsafe correlation without reflecting the input", (unsafe) => {
    const context = resolvePrivateRequestContext(new Headers({ "x-request-id": unsafe, "x-trace-id": unsafe }));
    expect(context.requestId === unsafe || context.traceId === unsafe).toBe(false);
    expect(context.requestId).toMatch(/^[a-z0-9-]+$/i);
    expect(context.traceId).toBe(context.requestId);
  });

  it("should preserve native severity filtering and isolate simultaneous diagnostics without inspecting SDK arguments", async () => {
    const instance = betterAuth({ baseURL: BETTER_AUTH_PRIVACY_TEST.baseUrl, secret: randomBytes(BETTER_AUTH_PRIVACY_TEST.secretBytes).toString("hex"), database: memoryAdapter({ user: [], account: [], session: [], verification: [] }), logger: createBetterAuthLogger() });
    const logger = (await instance.$context).logger;
    const entries: { level: string; requestId: string; traceId: string; metadata: { code: string } }[] = [];
    const capture = (value: unknown) => entries.push(JSON.parse(String(value)));
    const errorCapture = vi.spyOn(console, "error").mockImplementation(capture);
    const warnCapture = vi.spyOn(console, "warn").mockImplementation(capture);
    const infoCapture = vi.spyOn(console, "info").mockImplementation(capture);
    const first = { requestId: randomUUID(), traceId: randomUUID() }, second = { requestId: randomUUID(), traceId: randomUUID() };
    const poison = { toJSON() { throw new Error("Private provider arguments must not be inspected"); } };
    let releaseFirst: () => void = () => undefined;
    const resumed = new Promise<void>((resolve) => { releaseFirst = resolve; });
    try {
      const firstWork = runWithBetterAuthLoggingContext(first, async () => {
        await resumed;
        logger.info("Filtered native information", poison);
        logger.debug("Filtered native debug", poison);
        logger.error("INTERNAL_SERVER_ERROR", poison);
      });
      const originalFirst = { ...first };
      first.requestId = randomUUID();
      const handler = createScopedAuthEvidenceHandler(async () => { logger.warn("Synthetic provider detail", poison); releaseFirst(); return Response.redirect(`${BETTER_AUTH_PRIVACY_TEST.baseUrl}/tribes`); }, { persist: async () => ({ status: "stored" }), reportFailure: () => { throw new Error("Unexpected evidence failure"); } });
      const response = await handler(new Request(`${BETTER_AUTH_PRIVACY_TEST.baseUrl}/api/auth/callback/google`, { headers: { "x-request-id": second.requestId, "x-trace-id": second.traceId } }));
      await firstWork;
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(expect.objectContaining({ level: "error", ...originalFirst, metadata: expect.objectContaining({ code: "provider_internal_error" }) }));
      expect(entries).toContainEqual(expect.objectContaining({ level: "warn", ...second, metadata: expect.objectContaining({ code: "provider_diagnostic" }) }));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`${BETTER_AUTH_PRIVACY_TEST.baseUrl}/tribes`);
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect([first.requestId, originalFirst.requestId, second.requestId]).not.toContain(resolveBetterAuthLoggingContext().requestId);
    } finally { releaseFirst(); errorCapture.mockRestore(); warnCapture.mockRestore(); infoCapture.mockRestore(); }
  });
});
