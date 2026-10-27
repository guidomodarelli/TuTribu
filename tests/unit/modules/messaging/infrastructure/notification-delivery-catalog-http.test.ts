/** Exercises once-only query validation and owned DTO guarding through the real catalog handler. @module notification-delivery-catalog-http-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createNotificationDeliveryCatalogHandler } from "@/src/modules/messaging/infrastructure/api/notification-delivery-catalog-handler";

/** @returns Only the owned local metadata fixture, never provider or recipient data. */
function catalogResult() { return { items: [{ id: randomUUID(), version: 2, state: "suppressed" as const, connectionId: randomUUID(), createdAt: "2026-10-11T12:00:00Z", deadlineAt: "2026-10-11T13:00:00Z", recoveryDeliveryId: null }], nextCursor: null }; }

describe("notification catalog HTTP", () => {
  it("should return guarded no-store metadata and pass a complete cursor to the owned use case", async () => {
    const value = catalogResult(), tribeId = randomUUID(), cursorId = randomUUID(), cursorCreatedAt = "2026-10-11T11:00:00Z";
    const execute = vi.fn(async () => ({ ok: true as const, value }));
    const handler = createNotificationDeliveryCatalogHandler(async () => ({ catalog: { execute }, resolveTribe: { execute: async () => ({ ok: true, value: { tribeId } }) } }));
    const response = await handler(new Request(`https://synthetic.example/api/tribes/synthetic/messaging/notification-deliveries?cursorId=${cursorId}&cursorCreatedAt=${encodeURIComponent(cursorCreatedAt)}`), { params: Promise.resolve({ slug: "synthetic" }) });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.json()).toEqual(value);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ tribeId, cursor: { deliveryId: cursorId, createdAt: cursorCreatedAt } }));
  });
  it.each(["actorUserId=synthetic", "force=true", `cursorId=${randomUUID()}`, "cursorCreatedAt=2026-10-11T12%3A00%3A00Z", "cursorId=invalid&cursorCreatedAt=invalid"])("should reject unusable query %s before opening current services", async (query) => {
    const open = vi.fn();
    const response = await createNotificationDeliveryCatalogHandler(open)(new Request(`https://synthetic.example/api/tribes/synthetic/messaging/notification-deliveries?${query}`), { params: Promise.resolve({ slug: "synthetic" }) });
    expect(response.status).toBe(400); expect(open).not.toHaveBeenCalled();
  });
  it("should reject private own DTO fields without exposing their contents", async () => {
    const value = catalogResult(), execute = vi.fn(async () => ({ ok: true as const, value: { ...value, items: [{ ...value.items[0], recipient: "synthetic-private-recipient" }] } }));
    const handler = createNotificationDeliveryCatalogHandler(async () => ({ catalog: { execute }, resolveTribe: { execute: async () => ({ ok: true, value: { tribeId: randomUUID() } }) } }));
    const response = await handler(new Request("https://synthetic.example/api/tribes/synthetic/messaging/notification-deliveries"), { params: Promise.resolve({ slug: "synthetic" }) });
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("synthetic-private-recipient");
  });
});
