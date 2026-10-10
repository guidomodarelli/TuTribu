/** Exercises owned import transport contracts with native Request/Response and real DTO guards. @module allowlist-import-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAllowlistImportApiClient } from "@/lib/academy-admissions/allowlist-import-api-client";
import { readAllowlistImport, writeAllowlistImport, type StoredAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import { createAllowlistImportDraftStoreFixture } from "@/tests/support/allowlist-import-draft-store-fixture";

describe("import browser contracts", () => {
  it("should classify a lost write as uncertain and preserve a known original denial when the native response is received", async () => {
    const operationId = randomUUID(), intent = { type: "preview_allowlist_import" as const, operationId, expectedPolicyVersion: 1, contactType: "email" as const }, draft = { fileName: "synthetic.csv", csvText: "identity,display_name\nsynthetic@example.test,Nombre" };
    const lost = createAllowlistImportApiClient({ fetch: vi.fn(async () => { throw new TypeError("Private transport detail"); }) });
    expect(await lost.write("synthetic", intent, draft, new AbortController().signal)).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: true });
    const denied = createAllowlistImportApiClient({ fetch: vi.fn(async () => Response.json({ code: "policy_conflict", message: "La configuración cambió. Revisala y volvé a confirmar.", requestId: randomUUID(), operation: { operationId, state: "completed" } }, { status: 409 })) });
    expect(await denied.write("synthetic", intent, draft, new AbortController().signal)).toMatchObject({ status: "failed", code: "policy_conflict", uncertain: false });
  });
  it("should bind the original import and operation ids before consuming a success", async () => {
    const importId = randomUUID(), operationId = randomUUID(), intent = { type: "confirm_allowlist_import" as const, operationId, importId, expectedVersion: 1, selectedRows: [1] };
    const client = createAllowlistImportApiClient({ fetch: vi.fn(async () => Response.json({ state: "completed", operationId, replayed: false, result: { importId: randomUUID(), sourceVersion: 2, state: "completed", counts: { selected: 1, added: 1, unchanged: 0, conflict: 0, skipped: 0 } } })) });
    expect(await client.write("synthetic", intent, null, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
  });
  it("should download only an authorized private CSV and reject a raw public HTML response", async () => {
    const client = createAllowlistImportApiClient({ fetch: vi.fn(async () => new Response("<script>private()</script>", { headers: { "content-type": "text/html" } })) });
    expect(await client.file("synthetic", "template", null, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable" });
  });
  it("should persist one file copy and exact pending rows without restoring consent or accepted results", async () => {
    const storage = new Map<string, string>(), port = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } }, viewerId = randomUUID(), importId = randomUUID();
    const files = createAllowlistImportDraftStoreFixture(), draft = await files.save(viewerId, "synthetic", { fileName: "synthetic.csv", csvText: "identity,display_name\nsynthetic@example.test,Nombre" }, new AbortController().signal);
    const proposal: StoredAllowlistImport = { viewerId, slug: "synthetic", draft, importId, selection: [2], pending: { type: "confirm_allowlist_import", operationId: randomUUID(), importId, expectedVersion: 3, selectedRows: [2] }, unresolved: [] };
    writeAllowlistImport(proposal, port);
    expect(await readAllowlistImport(viewerId, "synthetic", port, files)).toEqual(proposal);
    expect(await readAllowlistImport(randomUUID(), "synthetic", port, files)).toBeNull();
    expect([...storage.values()][0]).not.toContain("synthetic@example.test");
    expect(() => writeAllowlistImport({ ...proposal, confirmed: true } as StoredAllowlistImport, port)).toThrow();
    expect(() => writeAllowlistImport({ ...proposal, pending: { ...proposal.pending!, importId: randomUUID() } } as StoredAllowlistImport, port)).toThrow();
  });
});
