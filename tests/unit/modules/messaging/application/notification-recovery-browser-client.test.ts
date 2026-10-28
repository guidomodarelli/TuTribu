/** Exercises explicit recovery HTTP and original-result binding through own transport boundaries. @module notification-recovery-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createNotificationRecoveryBrowserClient } from "@/lib/messaging/notification-recovery-api-client";

/** @returns A synthetic original delivery and replacement intent with deliberately distinct version domains. */
function originalRecovery() {
  const scope = { slug: "synthetic", deliveryId: randomUUID() };
  const input = { operationId: randomUUID(), expectedVersion: 3, targetConnectionId: randomUUID(), expectedTargetVersion: 8, confirmed: true as const, reason: "authorized_connection_replacement" as const };
  const result = { originalDeliveryId: scope.deliveryId, recoveryDeliveryId: randomUUID(), originalVersion: 4, targetConnectionId: input.targetConnectionId, targetConnectionVersion: 2 };
  return { scope, input, result };
}

describe("notification recovery browser transport", () => {
  it("should read a guarded notification page with its stable cursor without posting or exposing recipient data", async () => {
    const id = randomUUID(), connectionId = randomUUID(), createdAt = "2026-10-11T12:00:00Z";
    const value = { items: [{ id, version: 3, state: "unknown", connectionId, createdAt, deadlineAt: "2026-10-11T13:00:00Z", recoveryDeliveryId: null }], nextCursor: { deliveryId: id, createdAt } };
    const transport = vi.fn<typeof fetch>(async () => Response.json(value));
    const outcome = await createNotificationRecoveryBrowserClient({ fetch: transport }).catalog({ slug: "synthetic", cursor: { deliveryId: id, createdAt } }, new AbortController().signal);
    expect(outcome).toEqual({ status: "ready", value });
    const path = new URL(String(transport.mock.calls[0]?.[0]), "https://synthetic.example");
    expect(path.pathname).toBe("/api/tribes/synthetic/messaging/notification-deliveries");
    expect(path.searchParams.get("cursorId")).toBe(id); expect(path.searchParams.get("cursorCreatedAt")).toBe(createdAt);
    expect(transport.mock.calls[0]?.[1]?.method).toBe("GET"); expect(transport).toHaveBeenCalledTimes(1);
  });
  it("should reject a private notification page without inventing another send", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ items: [], nextCursor: null, recipient: "synthetic-private" }));
    expect(await createNotificationRecoveryBrowserClient({ fetch: transport }).catalog({ slug: "synthetic", cursor: null }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
    expect(transport).toHaveBeenCalledTimes(1); expect(transport.mock.calls[0]?.[1]?.body).toBeUndefined();
  });
  it("should submit one explicit original intent without equating lifecycle CAS with frozen sending version", async () => {
    const { scope, input, result } = originalRecovery();
    const transport = vi.fn<typeof fetch>(async () => Response.json({ state: "completed", operationId: input.operationId, replayed: false, result }));
    const outcome = await createNotificationRecoveryBrowserClient({ fetch: transport }).recover(scope, input, new AbortController().signal);
    expect(outcome).toEqual({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toBe(`/api/tribes/${scope.slug}/messaging/deliveries/${scope.deliveryId}/recover`);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual(input);
  });

  it.each(["operation", "original", "replacement", "version", "same_delivery", "private_field"] as const)("should retain uncertainty for a crossed %s result and never retry the write", async (scenario) => {
    const { scope, input, result } = originalRecovery();
    /** @returns The original result crossed only in this scenario's field. */
    const crossResult = () => {
      if (scenario === "original") return { ...result, originalDeliveryId: randomUUID() };
      if (scenario === "replacement") return { ...result, targetConnectionId: randomUUID() };
      if (scenario === "version") return { ...result, originalVersion: 5 };
      if (scenario === "same_delivery") return { ...result, recoveryDeliveryId: result.originalDeliveryId };
      if (scenario === "private_field") return { ...result, secretRef: randomUUID() };
      return result;
    };
    const crossed = crossResult();
    const transport = vi.fn<typeof fetch>(async () => Response.json({ state: "completed", operationId: scenario === "operation" ? randomUUID() : input.operationId, replayed: false, result: crossed }));
    expect(await createNotificationRecoveryBrowserClient({ fetch: transport }).recover(scope, input, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("should preserve a registered started original without treating it as completed", async () => {
    const { scope, input } = originalRecovery();
    const transport = vi.fn<typeof fetch>(async () => Response.json({ state: "started", operationId: input.operationId }, { status: 202 }));
    expect(await createNotificationRecoveryBrowserClient({ fetch: transport }).recover(scope, input, new AbortController().signal)).toEqual({ status: "ready", value: { state: "started", operationId: input.operationId } });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("should consult only the exact original namespace after a lost reply without posting again", async () => {
    const { scope, input, result } = originalRecovery();
    const recovered = { type: "recover_notification_delivery", state: "completed", operationId: input.operationId, replayed: true, result };
    const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("Synthetic reply unavailable")).mockResolvedValueOnce(Response.json(recovered));
    const client = createNotificationRecoveryBrowserClient({ fetch: transport });
    expect(await client.recover(scope, input, new AbortController().signal)).toMatchObject({ status: "failed", uncertain: true, code: "dependency_unavailable" });
    expect(await client.operation({ slug: scope.slug, operationId: input.operationId }, new AbortController().signal)).toEqual({ status: "ready", value: recovered });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]?.[0]).toBe(`/api/tribes/${scope.slug}/messaging/notification-recovery-operations/${input.operationId}`);
    expect(transport.mock.calls[1]?.[1]).toMatchObject({ method: "GET", cache: "no-store" });
    expect(transport.mock.calls[1]?.[1]?.body).toBeUndefined();
  });

  it.each(["operation", "namespace", "private_field", "same_delivery"] as const)("should reject an original lookup with crossed %s metadata without inventing a write", async (scenario) => {
    const { scope, input, result } = originalRecovery();
    const crossed = scenario === "same_delivery" ? { ...result, recoveryDeliveryId: result.originalDeliveryId.toUpperCase() } : result;
    const transport = vi.fn<typeof fetch>(async () => Response.json({ type: scenario === "namespace" ? "disconnect_messaging_connection" : "recover_notification_delivery", state: "completed", operationId: scenario === "operation" ? randomUUID() : input.operationId, replayed: true, result: crossed, ...(scenario === "private_field" ? { intent: "private" } : {}) }));
    expect(await createNotificationRecoveryBrowserClient({ fetch: transport }).operation({ slug: scope.slug, operationId: input.operationId }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("should stop observing an aborted request without claiming rollback or dispatching a retry", async () => {
    const { scope, input } = originalRecovery();
    const controller = new AbortController();
    const transport = vi.fn<typeof fetch>(async (_url, options) => {
      // The request's signal follows the caller's cancellation (it also carries the shared deadline).
      expect(options?.signal?.aborted).toBe(false);
      controller.abort();
      expect(options?.signal?.aborted).toBe(true);
      throw new DOMException("Synthetic cancelled observation", "AbortError");
    });
    expect(await createNotificationRecoveryBrowserClient({ fetch: transport }).recover(scope, input, controller.signal)).toEqual({ status: "aborted" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("should make no request when observation was already cancelled", async () => {
    const { scope, input } = originalRecovery();
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn<typeof fetch>();
    expect(await createNotificationRecoveryBrowserClient({ fetch: transport }).recover(scope, input, controller.signal)).toEqual({ status: "aborted" });
    expect(transport).not.toHaveBeenCalled();
  });
});
