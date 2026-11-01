/** Exercises owned usage transport without platform, SDK or schema mocks. @module messaging-usage-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMessagingUsageBrowserClient, createSessionViewer } from "@/lib/messaging/messaging-usage-api-client";
import { BROWSER_REQUEST_TIMEOUT_MS } from "@/src/constants/browser-request";
import { MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";

describe("usage browser transport", () => {
  it("should keep exact PUT identity/version and the safe original read separate from today's policy", async () => {
    const operationId = randomUUID(), result = { version: 4, allowedCountries: ["AR"], verificationDailyLimit: 0, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 3, notificationToday: 0 } };
    const transport = vi.fn<typeof fetch>(async () => Response.json({ state: "completed", operationId, replayed: false, result }));
    const client = createMessagingUsageBrowserClient({ fetch: transport, viewer: async () => ({ status: "ready", value: { id: "synthetic-leader" } }) }), signal = new AbortController().signal;
    const input = { operationId, expectedVersion: 3, confirmed: true as const, allowedCountries: ["AR"], verificationDailyLimit: 0, notificationDailyLimit: 200 };
    expect(await client.update("synthetic-academy", input, signal)).toMatchObject({ status: "ready", value: { operationId, result: { version: 4 } } });
    expect(transport.mock.calls[0][0]).toBe("/api/tribes/synthetic-academy/messaging/usage-policy");
    expect(transport.mock.calls[0][1]).toMatchObject({ method: "PUT", credentials: "same-origin", cache: "no-store", signal });
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual(input);
    transport.mockResolvedValueOnce(Response.json({ type: "update_messaging_usage", state: "completed", operationId, replayed: true, result }));
    expect(await client.operation("synthetic-academy", operationId, signal)).toMatchObject({ status: "ready", value: { type: "update_messaging_usage", result: { version: 4 } } });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("should reject a positive incoherent write counter and retain registered progress without resending", async () => {
    const operationId = randomUUID(), input = { operationId, expectedVersion: 1, confirmed: true as const, allowedCountries: [], verificationDailyLimit: 0, notificationDailyLimit: 0 };
    const transport = vi.fn<typeof fetch>(async () => Response.json({ state: "completed", operationId, replayed: false, result: { version: 9, allowedCountries: [], verificationDailyLimit: 0, notificationDailyLimit: 0, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 0, notificationToday: 0 } } }));
    const client = createMessagingUsageBrowserClient({ fetch: transport, viewer: async () => ({ status: "ready", value: null }) }), signal = new AbortController().signal;
    expect(await client.update("synthetic-academy", input, signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    transport.mockResolvedValueOnce(Response.json({ code: "operation_unresolved", message: "La operación está registrada y su resultado todavía no se confirmó. Consultá su estado.", requestId: "synthetic-request", operation: { operationId, state: "started" } }, { status: 202 }));
    expect(await client.update("synthetic-academy", input, signal)).toMatchObject({ status: "failed", code: "operation_unresolved", uncertain: true });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("should retain uncertainty for response loss or incoherent counters without retrying and distinguish invalid reads", async () => {
    const operationId = randomUUID(), transport = vi.fn<typeof fetch>(async () => { throw new TypeError("Synthetic response loss"); });
    const client = createMessagingUsageBrowserClient({ fetch: transport, viewer: async () => ({ status: "ready", value: null }) }), signal = new AbortController().signal;
    expect(await client.initialize("synthetic-academy", { operationId, confirmed: true }, signal)).toMatchObject({ status: "failed", uncertain: true });
    transport.mockResolvedValueOnce(Response.json({ usage: { state: "configured", policy: { version: 0 } }, platformRequirement: null }));
    expect(await client.read("synthetic-academy", signal)).toMatchObject({ status: "failed", uncertain: false });
    const cancelled = new AbortController(); cancelled.abort();
    expect(await client.initialize("synthetic-academy", { operationId, confirmed: true }, cancelled.signal)).toEqual({ status: "aborted" });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("should report a write the platform could not protect as definitive, with its own copy and no retry", async () => {
    const operationId = randomUUID(), body = { code: "platform_security_unavailable", message: "La mensajería depende del equipo de TuTribu: la plataforma todavía no puede proteger esta operación. No se registró ningún cambio.", requestId: "synthetic-request" };
    const transport = vi.fn<typeof fetch>(async () => Response.json(body, { status: 409 }));
    const client = createMessagingUsageBrowserClient({ fetch: transport, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.update("synthetic", { operationId, confirmed: true, expectedVersion: 3, allowedCountries: ["AR"], verificationDailyLimit: 1, notificationDailyLimit: 1 }, new AbortController().signal)).toEqual({ status: "failed", code: "platform_security_unavailable", message: body.message, uncertain: false });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("should read the current configuration with the platform requirement of its saves as one own DTO", async () => {
    const policy = { version: 2, allowedCountries: ["AR"], verificationDailyLimit: 10, notificationDailyLimit: 20, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 0, notificationToday: 0 } };
    const transport = vi.fn<typeof fetch>(async () => Response.json({ usage: { state: "configured", policy }, platformRequirement: "security_unconfigured" }));
    const client = createMessagingUsageBrowserClient({ fetch: transport, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.read("synthetic-academy", new AbortController().signal)).toEqual({ status: "ready", value: { usage: { state: "configured", policy }, platformRequirement: "security_unconfigured" } });
    expect(transport.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store" });
    transport.mockResolvedValueOnce(Response.json({ usage: { state: "configured", policy }, platformRequirement: "unknown_requirement" }));
    expect(await client.read("synthetic-academy", new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
  });
});

describe("messaging session viewer", () => {
  it("should end a hung session check at the browser deadline as a timeout instead of checking forever", async () => {
    vi.useFakeTimers();
    try {
      const getSession = vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => { signal.addEventListener("abort", () => reject(new DOMException("synthetic abort", "AbortError")), { once: true }); }));
      const checking = createSessionViewer(getSession)(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS);
      expect(await checking).toEqual({ status: "failed", code: "transport_timeout", message: MESSAGING_ERROR_MESSAGE.transport_timeout, uncertain: false });
      expect(getSession).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("should keep the caller's own cancellation an abort and read the account id of a ready session", async () => {
    const controller = new AbortController(), viewer = createSessionViewer(async () => ({ data: { user: { id: "synthetic-leader" } }, error: null }));
    expect(await viewer(controller.signal)).toEqual({ status: "ready", value: { id: "synthetic-leader" } });
    controller.abort();
    expect(await viewer(controller.signal)).toEqual({ status: "aborted" });
  });
});
