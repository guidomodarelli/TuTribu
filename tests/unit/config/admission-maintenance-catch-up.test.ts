/** @vitest-environment node */
/** Exercises the native Node entrypoint and actual loopback HTTP without platform or SDK doubles. @module admission-maintenance-catch-up-tests */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runAdmissionMaintenanceCatchUp } from "@/scripts/run-admission-maintenance.mjs";

/** Runs only the real Node process; rejected exits preserve sanitized stdout/stderr for assertions. */
const executeNode = promisify(execFile);

/** @param handle - Owned native HTTP server behavior. @param run - Actual origin consumer. @returns The consumer result after all owned sockets close. */
async function withEndpoint<Result>(handle: (request: IncomingMessage, response: ServerResponse) => void, run: (origin: string) => Promise<Result>): Promise<Result> {
  const server = createServer(handle);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Native maintenance endpoint did not expose a loopback port");
  try { return await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed())); }
}

/** @param origin - Owned actual loopback endpoint. @param secret - Per-test generated bearer. @returns Only the exact environment consumed by the real trigger. */
function configuration(origin: string, secret: string): Record<string, string> {
  return { ADMISSION_MESSAGING_MAINTENANCE_ENABLED: "true", ADMISSION_MESSAGING_MAINTENANCE_BASE_URL: origin, CRON_SECRET: secret };
}

describe("native admission maintenance catch-up", () => {
  it("should run one actual authorized request through the Node CLI and discard the private response body", async () => {
    const secret = randomUUID(), privateBody = randomUUID(); let requests = 0;
    await withEndpoint((request, response) => {
      requests += 1;
      expect(request.method).toBe("GET"); expect(request.url).toBe("/api/maintenance/admission-messaging"); expect(request.headers.authorization).toBe(`Bearer ${secret}`);
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ privateBody }));
    }, async (origin) => {
      const output = await executeNode(process.execPath, [resolve("scripts/run-admission-maintenance.mjs")], { env: { ...configuration(origin, secret), NODE_ENV: "test", SystemRoot: process.env.SystemRoot }, windowsHide: true });
      expect(JSON.parse(output.stdout)).toEqual({ operation: "admission_maintenance_catch_up", state: "completed", status: 200 });
      expect(output.stderr).toBe(""); expect(output.stdout).not.toContain(secret); expect(output.stdout).not.toContain(privateBody);
    });
    expect(requests).toBe(1);
  });

  it.each([202, 401, 503])("should fail the native CLI visibly after HTTP %s without a second request or private output", async (status) => {
    const secret = randomUUID(), privateBody = randomUUID(); let requests = 0;
    await withEndpoint((_request, response) => { requests += 1; response.writeHead(status); response.end(privateBody); }, async (origin) => {
      const outcome = await executeNode(process.execPath, [resolve("scripts/run-admission-maintenance.mjs")], { env: { ...configuration(origin, secret), NODE_ENV: "test", SystemRoot: process.env.SystemRoot }, windowsHide: true }).then((value) => ({ code: 0, ...value }), (error: unknown) => error as { code: number; stdout: string; stderr: string });
      expect(outcome.code).toBe(1);
      expect(JSON.parse(outcome.stderr)).toEqual({ operation: "admission_maintenance_catch_up", code: status === 202 ? "request_unconfirmed" : "request_failed", status });
      expect(outcome.stdout).toBe(""); expect(outcome.stderr).not.toContain(secret); expect(outcome.stderr).not.toContain(privateBody);
    });
    expect(requests).toBe(1);
  });

  it.each([undefined, "false", "TRUE", "1"])("should keep a disabled native trigger %s from contacting its prepared endpoint", async (enabled) => {
    let requests = 0;
    await withEndpoint((_request, response) => { requests += 1; response.end(); }, async (origin) => {
      await expect(runAdmissionMaintenanceCatchUp({ ...configuration(origin, randomUUID()), ADMISSION_MESSAGING_MAINTENANCE_ENABLED: enabled })).rejects.toMatchObject({ code: "disabled" });
    });
    expect(requests).toBe(0);
  });

  it.each(["", "http://example.test", "https://example.test/path", "https://example.test/?query=private", "https://example.test/#fragment", "https://user:password@example.test"])("should reject an untrusted origin configuration %s before attaching the bearer", async (origin) => {
    await expect(runAdmissionMaintenanceCatchUp(configuration(origin, randomUUID()))).rejects.toMatchObject({ code: "invalid_origin" });
  });

  it("should require a secret without contacting the enabled local endpoint", async () => {
    let requests = 0;
    await withEndpoint((_request, response) => { requests += 1; response.end(); }, async (origin) => {
      await expect(runAdmissionMaintenanceCatchUp({ ...configuration(origin, randomUUID()), CRON_SECRET: "" })).rejects.toMatchObject({ code: "missing_secret" });
    });
    expect(requests).toBe(0);
  });

  it("should refuse an actual redirect without forwarding the bearer to its destination", async () => {
    let requests = 0, forwarded = 0;
    await withEndpoint((_request, response) => { forwarded += 1; response.end(); }, async (target) => {
      await withEndpoint((_request, response) => { requests += 1; response.writeHead(302, { location: target }); response.end(); }, async (origin) => {
        await expect(runAdmissionMaintenanceCatchUp(configuration(origin, randomUUID()))).rejects.toMatchObject({ code: "request_unconfirmed" });
      });
    });
    expect(requests).toBe(1); expect(forwarded).toBe(0);
  });

  it("should preserve cancellation as unconfirmed after the original request began without retrying it", async () => {
    let requests = 0; const began = Promise.withResolvers<void>(), controller = new AbortController();
    await withEndpoint(() => { requests += 1; began.resolve(); }, async (origin) => {
      const original = runAdmissionMaintenanceCatchUp(configuration(origin, randomUUID()), { signal: controller.signal });
      await began.promise; controller.abort();
      await expect(original).rejects.toMatchObject({ code: "request_unconfirmed" });
    });
    expect(requests).toBe(1);
  });
});
