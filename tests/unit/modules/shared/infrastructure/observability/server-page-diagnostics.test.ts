/** @vitest-environment node */

/** Covers what an SSR page loader logs for each failure: native correlation, cause chains and contract issues, never values. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createServerPageDiagnostics, loadServerPageState } from "@/src/modules/shared/infrastructure/observability/server-page-diagnostics";
import { CLOSED_FAILURE_CAUSE } from "@/src/modules/shared/constants/error-cause-summary";

const MESSAGES = { readFailed: "Synthetic page read failed", contractRejected: "Synthetic page contract rejected", loadFailed: "Synthetic page could not load" } as const;
const CODES = { contractUnusable: "public_contract_unusable", unexpectedFailure: "unexpected_failure" } as const;
const stateSchema = z.strictObject({ kind: z.literal("ready"), count: z.int() });
type Code = "public_contract_unusable" | "unexpected_failure" | "permission_denied" | "dependency_unavailable";

/** @param headers - Incoming request headers. @returns Diagnostics where only `unexpected_failure`, `public_contract_unusable` and `dependency_unavailable` are server failures. */
function diagnostics(headers: Record<string, string> = {}) {
  return createServerPageDiagnostics({ feature: "synthetic", operation: "load_synthetic_page", requestHeaders: new Headers(headers), metadata: { pageId: "page-1" }, isServerFailure: (code) => code !== "permission_denied" });
}

/** @param read - The page read. @param headers - Incoming request headers. @returns The loaded state. */
function load(read: () => Promise<{ ok: true; value: unknown } | { ok: false; failure: { code: Code; cause?: unknown } }>, headers?: Record<string, string>) {
  return loadServerPageState<Code, z.infer<typeof stateSchema>, { kind: "unavailable"; code: Code }>({ diagnostics: diagnostics(headers), read, stateSchema, unavailable: (code) => ({ kind: "unavailable", code }), codes: CODES, messages: MESSAGES });
}

/** @param spy - Console spy. @returns Every JSON entry it received. */
function entries(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as { level: string; message: string; requestId: string; traceId: string; metadata: Record<string, unknown> });
}

afterEach(() => { vi.restoreAllMocks(); });

describe("SSR page diagnostics", () => {
  it("should log a failed read with the incoming correlation and its cause chain, without messages", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = Object.assign(new Error("relation does not exist: private detail"), { code: "42883" });
    const state = await load(async () => ({ ok: false, failure: { code: "unexpected_failure", cause: new Error("wrapped", { cause }) } }), { "x-request-id": "edge-request-1", "x-trace-id": "edge-trace-1" });
    expect(state).toEqual({ kind: "unavailable", code: "unexpected_failure" });
    const [entry] = entries(error);
    expect(entry).toMatchObject({ level: "error", message: MESSAGES.readFailed, requestId: "edge-request-1", traceId: "edge-trace-1", metadata: { code: "unexpected_failure", pageId: "page-1", causes: [{ name: "Error" }, { name: "Error", code: "42883" }] } });
    expect(JSON.stringify(entry)).not.toContain("private detail");
  });

  it("should log a deterministic refusal at warn level and follow a plain failure into its cause", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await load(async () => ({ ok: false, failure: { code: "permission_denied", cause: { code: "permission_denied", cause: Object.assign(new Error("x"), { name: "AdmissionOperationError", code: "permission_denied" }) } } }));
    expect(entries(warn)[0]).toMatchObject({ level: "warn", metadata: { code: "permission_denied", causes: [{ name: CLOSED_FAILURE_CAUSE, code: "permission_denied" }, { name: "AdmissionOperationError", code: "permission_denied" }] } });
  });

  it("should log the issue paths of a rejected own state and of a contract rejection kept as cause, never the values", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await load(async () => ({ ok: true, value: { kind: "ready", count: "secret-value" } }))).toEqual({ kind: "unavailable", code: "public_contract_unusable" });
    const rejection = stateSchema.safeParse({ kind: "ready", count: 1, extra: "private-extra" });
    await load(async () => ({ ok: false, failure: { code: "public_contract_unusable", cause: new Error("snapshot", { cause: rejection.error }) } }));
    const [rejected, wrapped] = entries(error);
    expect(rejected).toMatchObject({ message: MESSAGES.contractRejected, metadata: { code: "public_contract_unusable", issues: [{ code: "invalid_type", path: "count" }] } });
    expect(wrapped).toMatchObject({ message: MESSAGES.readFailed, metadata: { issues: [{ code: "unrecognized_keys", path: "" }] } });
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/secret-value|private-extra/);
  });

  it("should close a thrown composition as an unexpected failure with its class and code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = await load(async () => { throw Object.assign(new Error("pool exhausted at host"), { name: "PoolTimeoutError", code: "ETIMEDOUT" }); });
    expect(state).toEqual({ kind: "unavailable", code: "unexpected_failure" });
    expect(entries(error)[0]).toMatchObject({ message: MESSAGES.loadFailed, metadata: { code: "unexpected_failure", causes: [{ name: "PoolTimeoutError", code: "ETIMEDOUT" }] } });
    expect(JSON.stringify(error.mock.calls)).not.toContain("pool exhausted");
  });

  it("should return the own ready state without logging", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined), warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await load(async () => ({ ok: true, value: { kind: "ready", count: 2 } }))).toEqual({ kind: "ready", count: 2 });
    expect(error).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });
});
