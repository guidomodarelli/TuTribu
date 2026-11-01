/** Exercises actual own browser DTO guards through an explicit project HTTP edge. @module allowlist-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAllowlistApiClient } from "@/lib/academy-admissions/allowlist-api-client";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_ERROR_HTTP_STATUS } from "@/src/modules/academy-admissions/infrastructure/api/admission-error-status";

describe("list browser adapter", () => {
  it("should read a page with the platform requirement of list writes and reject an unknown requirement", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ items: [], nextCursor: null, platformRequirement: "recovery_locked" }));
    const client = createAllowlistApiClient({ fetch: transport });
    expect(await client.list("synthetic", { limit: 25 }, new AbortController().signal)).toEqual({ status: "ready", value: { items: [], nextCursor: null, platformRequirement: "recovery_locked" } });
    transport.mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, platformRequirement: "unknown_requirement" }));
    expect(await client.list("synthetic", { limit: 25 }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
  });

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

  it("should treat a write the platform could not protect as definitive, since nothing was registered", async () => {
    const intent = { type: "create_allowlist_entry" as const, input: { operationId: randomUUID(), confirmed: true as const, contactType: "email" as const, identity: "entry@example.test", displayName: null } };
    const code = ADMISSION_ERROR_CODE.platformSecurityUnavailable;
    const client = createAllowlistApiClient({ fetch: vi.fn(async () => Response.json({ code, message: ADMISSION_ERROR_MESSAGE[code], requestId: randomUUID() }, { status: ADMISSION_ERROR_HTTP_STATUS[code] })) });
    expect(await client.write("synthetic", intent, new AbortController().signal)).toEqual({ status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain: false });
  });
});
