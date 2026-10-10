/** Exercises scoped local original intentions without replacing browser/platform libraries. @module messaging-usage-intent-tests */
import { describe, expect, it } from "vitest";
import { readMessagingUsageIntent, writeMessagingUsageIntent } from "@/lib/messaging/messaging-usage-intent";

describe("usage local intention storage", () => {
  it("should retain the exact observed version and only restore the matching native account and tribe", () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
    const intent = { type: "update_messaging_usage" as const, input: { operationId: "297d47c2-5419-4c3d-a339-e8b7970275ca", confirmed: true as const, expectedVersion: 4, allowedCountries: ["AR"], verificationDailyLimit: 0, notificationDailyLimit: 200 } };
    writeMessagingUsageIntent("synthetic-leader", "synthetic-academy", intent, storage);
    expect(readMessagingUsageIntent("synthetic-leader", "synthetic-academy", storage)).toEqual(intent);
    expect(readMessagingUsageIntent("another-leader", "synthetic-academy", storage)).toBeNull();
    expect(readMessagingUsageIntent("synthetic-leader", "another-academy", storage)).toBeNull();
    const [key] = [...entries.keys()];
    entries.set(key, JSON.stringify({ viewerId: "another-leader", slug: "synthetic-academy", pending: intent }));
    expect(readMessagingUsageIntent("synthetic-leader", "synthetic-academy", storage)).toBeNull();
    expect(entries.size).toBe(0);
  });
  it("should reject imported browser authority and propagate persistence failure before the caller can send", () => {
    const entries = new Map<string, string>(), storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
    const intent = { type: "initialize_messaging_usage" as const, input: { operationId: "297d47c2-5419-4c3d-a339-e8b7970275ca", confirmed: true as const, expectedVersion: 1, allowedCountries: ["AR"] } };
    expect(() => writeMessagingUsageIntent("synthetic-leader", "synthetic-academy", intent, storage)).toThrow();
    expect(entries.size).toBe(0);
    const unavailable = { ...storage, setItem: () => { throw new DOMException("Synthetic storage unavailable", "SecurityError"); } };
    expect(() => writeMessagingUsageIntent("synthetic-leader", "synthetic-academy", { type: "initialize_messaging_usage", input: { operationId: "297d47c2-5419-4c3d-a339-e8b7970275ca", confirmed: true } }, unavailable)).toThrow();
  });
});
