/** Exercises real browser metadata persistence without restoring consent or mocking platform libraries. @module notification-recovery-intent-store-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createNotificationRecoveryIntentStore } from "@/lib/messaging/notification-recovery-intent-store";

describe("notification recovery local references", () => {
  it("should preserve only one original under its actual viewer and route without consent or recency", () => {
    const viewerId = randomUUID(), slug = `synthetic-${randomUUID()}`, reference = { operationId: randomUUID(), deliveryId: randomUUID(), expectedVersion: 3, targetConnectionId: randomUUID(), expectedTargetVersion: 8 };
    const draft = { deliveryId: reference.deliveryId, targetConnectionId: reference.targetConnectionId }, store = createNotificationRecoveryIntentStore();
    expect(store.save(viewerId, slug, { draft, reference })).toBe(true);
    expect(store.read(viewerId, slug)).toEqual({ state: "ready", value: { draft, reference, history: [] } });
    expect(store.read(randomUUID(), slug)).toEqual({ state: "ready", value: { draft: null, reference: null, history: [] } });
    expect(store.read(viewerId, `other-${slug}`)).toEqual({ state: "ready", value: { draft: null, reference: null, history: [] } });
    sessionStorage.removeItem(`tutribu.notification-recovery.v1:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`);
  });
  it.each(["consent", "recipient", "wrong_viewer", "invalid_original"] as const)("should block unusable stored %s metadata rather than discard the attempted original", (scenario) => {
    const viewerId = randomUUID(), slug = `synthetic-${randomUUID()}`, key = `tutribu.notification-recovery.v1:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`;
    const value = { viewerId: scenario === "wrong_viewer" ? randomUUID() : viewerId, slug, draft: null, reference: scenario === "invalid_original" ? { operationId: "invalid" } : null, ...(scenario === "consent" ? { confirmed: true } : scenario === "recipient" ? { recipient: "synthetic-private" } : {}) };
    sessionStorage.setItem(key, JSON.stringify(value));
    expect(createNotificationRecoveryIntentStore().read(viewerId, slug)).toEqual({ state: "unavailable" });
    sessionStorage.removeItem(key);
  });
  it("should report owned storage failure before a recovery can begin", () => {
    const store = createNotificationRecoveryIntentStore({ storage: { getItem: () => { throw new Error("Synthetic unavailable persistence"); }, setItem: () => { throw new Error("Synthetic unavailable persistence"); } } });
    expect(store.read(randomUUID(), "synthetic")).toEqual({ state: "unavailable" });
    expect(store.save(randomUUID(), "synthetic", { draft: null, reference: null })).toBe(false);
  });
  it("should preserve an explicitly archived original without silently duplicating or dropping it", () => {
    const viewerId = randomUUID(), slug = `synthetic-${randomUUID()}`, original = { operationId: randomUUID(), deliveryId: randomUUID(), expectedVersion: 3, targetConnectionId: randomUUID(), expectedTargetVersion: 8 }, store = createNotificationRecoveryIntentStore();
    expect(store.save(viewerId, slug, { draft: null, reference: null, history: [original] })).toBe(true);
    expect(store.read(viewerId, slug)).toEqual({ state: "ready", value: { draft: null, reference: null, history: [original] } });
    expect(store.save(viewerId, slug, { draft: null, reference: original, history: [original] })).toBe(false);
    expect(store.save(viewerId, slug, { draft: null, reference: null, history: [original, original] })).toBe(false);
    expect(store.read(viewerId, slug)).toEqual({ state: "ready", value: { draft: null, reference: null, history: [original] } });
    sessionStorage.removeItem(`tutribu.notification-recovery.v1:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`);
  });
});
