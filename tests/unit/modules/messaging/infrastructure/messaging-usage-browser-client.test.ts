/** Exercises owned usage transport without platform, SDK or schema mocks. @module messaging-usage-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMessagingUsageBrowserClient } from "@/lib/messaging/messaging-usage-api-client";

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
    transport.mockResolvedValueOnce(Response.json({ state: "configured", policy: { version: 0 } }));
    expect(await client.read("synthetic-academy", signal)).toMatchObject({ status: "failed", uncertain: false });
    const cancelled = new AbortController(); cancelled.abort();
    expect(await client.initialize("synthetic-academy", { operationId, confirmed: true }, cancelled.signal)).toEqual({ status: "aborted" });
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
