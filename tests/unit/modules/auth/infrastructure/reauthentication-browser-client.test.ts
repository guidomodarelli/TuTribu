/** @vitest-environment node */
/** Exercises the real Better Auth browser SDK through the application's controlled HTTP transport. */
import { describe, expect, it, vi } from "vitest";
import { createReauthenticationBrowserClient } from "@/src/modules/auth/infrastructure/reauthentication-browser-client";

const intentId = "20ca5bf6-8517-4e0d-a7d7-24144fcb0ea8";
const intent = { intentId, state: "created", outcome: "pending", safeMessage: "Confirmá tu autenticación con Google para continuar.", returnPath: "/synthetic-tribe" };

describe("reauthentication browser client", () => {
  it("should start the real native OAuth endpoint with only an opaque intent reference", async () => {
    let observedBody: unknown;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      expect(String(input)).toMatch(/\/api\/auth\/sign-in\/social$/);
      expect(init?.method).toBe("POST");
      observedBody = JSON.parse(String(init?.body));
      // Node has no browser redirect; the real SDK consumes the native HTTP result.
      return Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth", redirect: true });
    });
    const controller = new AbortController();
    expect(await createReauthenticationBrowserClient(fetcher).start(intentId, controller.signal)).toEqual({ status: "started" });
    expect(observedBody).toEqual({ provider: "google", callbackURL: `/auth/reauthenticate?intentId=${intentId}`, errorCallbackURL: `/auth/reauthenticate?intentId=${intentId}`, additionalData: { reauthenticationIntentId: intentId } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("should prioritize native rejection status without returning the provider message", async () => {
    const fetcher: typeof fetch = async () => Response.json({ code: "FORBIDDEN", message: "private-provider-message" }, { status: 403 });
    const result = await createReauthenticationBrowserClient(fetcher).start(intentId, new AbortController().signal);
    expect(result).toEqual({ status: "failed", code: "context_unavailable" });
    expect(JSON.stringify(result)).not.toContain("private-provider-message");
  });

  it("should read the own DTO with cancellation and no route refresh or new intent", async () => {
    const controller = new AbortController();
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      expect(input).toBe(`/api/auth/reauthentication/intents/${intentId}`);
      expect(init).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal });
      return Response.json(intent);
    });
    expect(await createReauthenticationBrowserClient(fetcher).read(intentId, controller.signal)).toEqual({ status: "ready", intent });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([null, "provider-value", { ...intent, nonce: "private-value" }, { ...intent, intentId: "cbbf7df7-7b0c-4a23-9fb6-cbbca39df5f3" }, { ...intent, returnPath: "//outside.example.test" }, { ...intent, state: "consumed", outcome: "verified" }, { ...intent, outcome: "verified", validUntil: new Date(Date.now() + 60_000).toISOString() }])("should reject an unusable or crossed public read DTO", async (body) => {
    const result = await createReauthenticationBrowserClient(async () => Response.json(body)).read(intentId, new AbortController().signal);
    expect(result).toEqual({ status: "failed", code: "public_contract_unusable" });
  });

  it.each([[401, "not_authenticated"], [403, "context_unavailable"], [404, "intent_not_found"], [500, "unexpected_failure"]])("should classify HTTP %s before any raw body", async (status, code) => {
    const result = await createReauthenticationBrowserClient(async () => new Response("private-server-value", { status: Number(status) })).read(intentId, new AbortController().signal);
    expect(result).toEqual({ status: "failed", code });
  });

  it("should return cancellation without an actionable error when the request is aborted", async () => {
    const controller = new AbortController();
    const fetcher: typeof fetch = async (_input, init) => {
      controller.abort();
      init?.signal?.throwIfAborted();
      throw new Error("Unexpected continuation");
    };
    expect(await createReauthenticationBrowserClient(fetcher).read(intentId, controller.signal)).toEqual({ status: "aborted" });
  });
});
