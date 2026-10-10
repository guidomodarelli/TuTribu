/** Exercises actual own browser DTO guards through an explicit project HTTP edge. @module allowlist-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAllowlistApiClient } from "@/lib/academy-admissions/allowlist-api-client";

describe("list browser adapter", () => {
  it("should reject current metadata for a different entry rather than replacing the selected draft", async () => {
    const entryId = randomUUID(), response = { id: randomUUID(), version: 2, contactType: "email", identity: "another@example.test", displayName: null, status: "enabled", source: "manual", createdAt: "2026-10-09T05:00:00Z", updatedAt: "2026-10-09T05:00:00Z" };
    const client = createAllowlistApiClient({ fetch: vi.fn(async () => Response.json(response)) });
    expect(await client.read("synthetic", entryId, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
  });

  it("should retain unknown writes but classify an actual completed stale rejection as known", async () => {
    const operationId = randomUUID(), entryId = randomUUID(), intent = { type: "update_allowlist_entry" as const, entryId, input: { operationId, confirmed: true as const, expectedVersion: 1, displayName: null, status: "disabled" as const } };
    const lost = createAllowlistApiClient({ fetch: vi.fn(async () => { throw new TypeError("Private network loss"); }) });
    expect(await lost.write("synthetic", intent, new AbortController().signal)).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: true });
    const known = createAllowlistApiClient({ fetch: vi.fn(async () => Response.json({ code: "allowlist_conflict", message: "La entrada cambió. Revisala y volvé a confirmar.", requestId: randomUUID(), operation: { operationId, state: "completed" } }, { status: 409 })) });
    expect(await known.write("synthetic", intent, new AbortController().signal)).toMatchObject({ status: "failed", code: "allowlist_conflict", uncertain: false });
  });
});
