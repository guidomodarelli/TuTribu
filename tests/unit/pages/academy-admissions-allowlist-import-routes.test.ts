/** @vitest-environment node */
/** Exercises actual import HTTP boundaries using only project-owned use case ports as doubles. @module allowlist-import-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAllowlistImportHandlers, type AllowlistImportServices } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-import-handlers";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

/** @returns Canonical own use case results and real Request/Response validation. */
function fixture() {
  const tribeId = randomUUID(), importId = randomUUID(), operationId = randomUUID();
  const preview = { importId, state: "preview" as const, sourceVersion: 1, expiresAt: "2026-10-10T08:00:00Z", counts: { selected: 0, added: 0, unchanged: 0, skipped: 0, conflict: 0 }, rows: [{ rowNumber: 1, identity: "synthetic@example.test", displayName: "=1+1", selected: false, errors: [] }] };
  const services: AllowlistImportServices = { resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) }, imports: { preview: vi.fn(async () => ({ ok: true as const, value: { state: "completed" as const, operationId, replayed: false, result: { importId, sourceVersion: 1, expiresAt: preview.expiresAt } } })), read: vi.fn(async () => ({ ok: true as const, value: preview })), confirm: vi.fn(async () => ({ ok: true as const, value: { state: "completed" as const, operationId, replayed: false, result: { importId, sourceVersion: 4, state: "completed" as const, counts: { selected: 1, added: 1, unchanged: 0, skipped: 0, conflict: 0 } } } })), templateAccess: vi.fn(async () => ({ ok: true as const, value: true as const })) } };
  const open = vi.fn(async () => services), handlers = createAllowlistImportHandlers(open), context = { params: Promise.resolve({ slug: "synthetic" }) }, importContext = { params: Promise.resolve({ slug: "synthetic", importId }) };
  /** @param method - Explicit native operation. @param body - Own validated input only. @param query - Read filters/foreign authority. @returns Same-origin Request without identity claims. */
  const request = (method = "GET", body?: unknown, query = "") => new Request(`https://tutribu.example.test/api/tribes/synthetic/admissions/allowlist/imports${query}`, { method, headers: { origin: "https://tutribu.example.test", "content-type": "application/json", "x-request-id": "import-route-test" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { tribeId, importId, operationId, preview, services, open, handlers, context, importContext, request };
}

describe("import HTTP contracts", () => {
  it("should validate body limits, explicit selection and caller authority before composing storage", async () => {
    const data = fixture(), common = { operationId: data.operationId, confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText: "identity,display_name\n" };
    expect((await data.handlers.preview(data.request("POST", { ...common, actorUserId: "foreign" }), data.context)).status).toBe(400);
    expect((await data.handlers.preview(data.request("POST", { ...common, csvText: "a".repeat(ADMISSION_LIMIT.csvByteCount + 1) }), data.context)).status).toBe(400);
    expect((await data.handlers.confirm(data.request("POST", { operationId: data.operationId, confirmed: true, expectedVersion: 0, selectedRows: [1] }), data.importContext)).status).toBe(400);
    expect((await data.handlers.confirm(data.request("POST", { operationId: data.operationId, confirmed: true, expectedVersion: 1, selectedRows: [1, 1] }), data.importContext)).status).toBe(400);
    expect((await data.handlers.read(data.request("GET", undefined, "?role=leader"), data.importContext)).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should canonicalize original ids and bind preview/confirm metadata to the requested operation/import", async () => {
    const data = fixture();
    const response = await data.handlers.preview(data.request("POST", { operationId: data.operationId.toUpperCase(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText: "identity,display_name\n" }), data.context);
    expect(response.status).toBe(201); expect((await response.json()).operationId).toBe(data.operationId);
    expect(data.services.imports.preview).toHaveBeenCalledWith(expect.objectContaining({ operationId: data.operationId, tribeId: data.tribeId }));
    const confirmation = await data.handlers.confirm(data.request("POST", { operationId: data.operationId, confirmed: true, expectedVersion: 1, selectedRows: [1] }), { params: Promise.resolve({ slug: "synthetic", importId: data.importId.toUpperCase() }) });
    expect(confirmation.status).toBe(200); expect(data.services.imports.confirm).toHaveBeenCalledWith(expect.objectContaining({ importId: data.importId, expectedVersion: 1, selectedRows: [1] }));
    vi.mocked(data.services.imports.confirm).mockResolvedValue({ ok: true, value: { state: "completed", operationId: data.operationId, replayed: false, result: { importId: randomUUID(), sourceVersion: 4, state: "completed", counts: { selected: 1, added: 1, unchanged: 0, skipped: 0, conflict: 0 } } } });
    expect((await data.handlers.confirm(data.request("POST", { operationId: data.operationId, confirmed: true, expectedVersion: 1, selectedRows: [1] }), data.importContext)).status).toBe(500);
  });

  it("should keep current reads and CSV downloads private, without invoking any mutation", async () => {
    const data = fixture(), read = await data.handlers.read(data.request(), data.importContext);
    expect(await read.json()).toEqual(data.preview); expect(read.headers.get("cache-control")).toContain("no-store");
    const report = await data.handlers.report(data.request(), data.importContext), text = await report.text();
    expect(report.status).toBe(200); expect(report.headers.get("content-type")).toBe("text/csv; charset=utf-8"); expect(report.headers.get("content-disposition")).toContain("attachment"); expect(report.headers.get("x-content-type-options")).toBe("nosniff");
    expect(report.headers.get("x-request-id")).toBe("import-route-test"); expect(text).toContain('"\'\t=1+1"');
    const template = await data.handlers.template(data.request(), data.context); expect(await template.text()).toBe("identity,display_name\r\n");
    expect(data.services.imports.preview).not.toHaveBeenCalled(); expect(data.services.imports.confirm).not.toHaveBeenCalled();
  });

  it("should preserve current denial without returning contacts or preparing a report", async () => {
    const data = fixture(); vi.mocked(data.services.imports.read).mockResolvedValue({ ok: false, failure: { code: "permission_denied" } });
    const report = await data.handlers.report(data.request(), data.importContext);
    expect(report.status).toBe(403); expect(await report.json()).toMatchObject({ code: "permission_denied" });
    expect(report.headers.get("content-disposition")).toBeNull();
  });

  it("should reject a foreign browser origin before composing services or generating a template", async () => {
    const data = fixture(), foreign = new Request(data.request().url, { headers: { origin: "https://foreign.example.test" } });
    expect((await data.handlers.template(foreign, data.context)).status).toBe(403);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should represent only genuine started/replayed preview outcomes and close a foreign read snapshot", async () => {
    const data = fixture(), body = { operationId: data.operationId, confirmed: true as const, expectedPolicyVersion: 1, contactType: "email", csvText: "identity,display_name\n" };
    vi.mocked(data.services.imports.preview).mockResolvedValue({ ok: true, value: { state: "started", operationId: data.operationId } });
    expect((await data.handlers.preview(data.request("POST", body), data.context)).status).toBe(202);
    vi.mocked(data.services.imports.preview).mockResolvedValue({ ok: true, value: { state: "completed", operationId: data.operationId, replayed: true, result: { importId: data.importId, sourceVersion: 1, expiresAt: data.preview.expiresAt } } });
    expect((await data.handlers.preview(data.request("POST", body), data.context)).status).toBe(200);
    vi.mocked(data.services.imports.read).mockResolvedValue({ ok: true, value: { ...data.preview, importId: randomUUID() } });
    expect((await data.handlers.report(data.request(), data.importContext)).status).toBe(500);
  });
});
