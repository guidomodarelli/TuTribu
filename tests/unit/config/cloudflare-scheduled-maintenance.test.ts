/** @vitest-environment node */

import { vi, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  EVENT_REMINDERS_MAINTENANCE_PATH,
  FILE_CLEANUP_MAINTENANCE_PATH,
  IMAGE_CLEANUP_MAINTENANCE_PATH,
  MAINTENANCE_CRON_SCHEDULE,
  buildImageCleanupCronRequest,
  resolveMaintenancePathForCron,
  runScheduledImageCleanup,
  runScheduledMaintenanceCleanup,
} from "@/config/cloudflare-scheduled-maintenance";

const CRON_SECRET = randomUUID();

interface CapturedRequest {
  authorization: string | null;
  method: string;
  pathname: string;
}

function captureRequest(request: Request): CapturedRequest {
  return {
    authorization: request.headers.get("authorization"),
    method: request.method,
    pathname: new URL(request.url).pathname,
  };
}

function createExecutionContextStub() {
  const settled: Promise<unknown>[] = [];

  return {
    settled,
    waitUntil(promise: Promise<unknown>): void {
      settled.push(promise);
    },
  };
}

describe("buildImageCleanupCronRequest", () => {
  it("targets the maintenance route with the cron bearer token", () => {
    const request = buildImageCleanupCronRequest(CRON_SECRET);
    const captured = captureRequest(request);

    expect(captured.pathname).toBe(IMAGE_CLEANUP_MAINTENANCE_PATH);
    expect(captured.method).toBe("GET");
    expect(captured.authorization).toBe(`Bearer ${CRON_SECRET}`);
  });
});

describe("resolveMaintenancePathForCron", () => {
  it("maps each installed cron expression to its maintenance route", () => {
    expect(
      resolveMaintenancePathForCron(MAINTENANCE_CRON_SCHEDULE.imageCleanup)
    ).toBe(IMAGE_CLEANUP_MAINTENANCE_PATH);
    expect(
      resolveMaintenancePathForCron(MAINTENANCE_CRON_SCHEDULE.fileCleanup)
    ).toBe(FILE_CLEANUP_MAINTENANCE_PATH);
    expect(
      resolveMaintenancePathForCron(MAINTENANCE_CRON_SCHEDULE.eventReminders)
    ).toBe(EVENT_REMINDERS_MAINTENANCE_PATH);
  });

  it("falls back to the image cleanup route for unknown expressions", () => {
    expect(resolveMaintenancePathForCron("15 7 * * *")).toBe(
      IMAGE_CLEANUP_MAINTENANCE_PATH
    );
  });
});

describe("runScheduledMaintenanceCleanup", () => {
  it.each([undefined, "false", "0", "1", "TRUE"])("should refuse admission cron activation %s without entering any route", async (enabled) => {
    const fetchHandler = vi.fn(() => new Response(null, { status: 200 }));
    await expect(runScheduledMaintenanceCleanup({ context: createExecutionContextStub(), cron: "* * * * *", env: { CRON_SECRET, ADMISSION_MESSAGING_MAINTENANCE_ENABLED: enabled }, fetchHandler })).rejects.toMatchObject({ code: "disabled" });
    expect(fetchHandler).not.toHaveBeenCalled();
  });

  it("should enter the exact authorized admission route once for an explicitly enabled minute event", async () => {
    const fetchHandler = vi.fn((request: Request) => {
      expect(captureRequest(request)).toEqual({ authorization: `Bearer ${CRON_SECRET}`, method: "GET", pathname: "/api/maintenance/admission-messaging" });
      return new Response(null, { status: 200 });
    });
    expect(resolveMaintenancePathForCron("* * * * *")).toBe("/api/maintenance/admission-messaging");
    await runScheduledMaintenanceCleanup({ context: createExecutionContextStub(), cron: "* * * * *", env: { CRON_SECRET, ADMISSION_MESSAGING_MAINTENANCE_ENABLED: "true" }, fetchHandler });
    expect(fetchHandler).toHaveBeenCalledOnce();
  });

  it("should require the native secret after explicit activation without constructing an unauthorized request", async () => {
    const fetchHandler = vi.fn(() => new Response(null, { status: 200 }));
    await expect(runScheduledMaintenanceCleanup({ context: createExecutionContextStub(), cron: "* * * * *", env: { ADMISSION_MESSAGING_MAINTENANCE_ENABLED: "true" }, fetchHandler })).rejects.toMatchObject({ code: "missing_secret" });
    expect(fetchHandler).not.toHaveBeenCalled();
  });

  it.each([202, 401, 503])("should expose an incomplete admission invocation with HTTP %s without retrying", async (status) => {
    const fetchHandler = vi.fn(() => new Response("Private response body", { status }));
    await expect(runScheduledMaintenanceCleanup({ context: createExecutionContextStub(), cron: "* * * * *", env: { CRON_SECRET, ADMISSION_MESSAGING_MAINTENANCE_ENABLED: "true" }, fetchHandler })).rejects.toMatchObject({ code: status === 202 ? "request_unconfirmed" : "request_failed", status });
    expect(fetchHandler).toHaveBeenCalledOnce();
  });

  it("should retain an original transport cause without claiming rollback or retrying the minute event", async () => {
    const original = new Error("Synthetic original transport failure");
    const fetchHandler = vi.fn(async (): Promise<Response> => { throw original; });
    await expect(runScheduledMaintenanceCleanup({ context: createExecutionContextStub(), cron: "* * * * *", env: { CRON_SECRET, ADMISSION_MESSAGING_MAINTENANCE_ENABLED: "true" }, fetchHandler })).rejects.toMatchObject({ code: "request_unconfirmed", cause: original });
    expect(fetchHandler).toHaveBeenCalledOnce();
  });

  it("re-enters the file cleanup route when the file cron fires", async () => {
    const env: { CRON_SECRET?: string } = { CRON_SECRET };
    let captured: CapturedRequest | undefined;
    const fetchHandler = vi.fn((request: Request) => {
      captured = captureRequest(request);
      return new Response(null, { status: 200 });
    });

    await runScheduledMaintenanceCleanup({
      context: createExecutionContextStub(),
      cron: MAINTENANCE_CRON_SCHEDULE.fileCleanup,
      env,
      fetchHandler,
    });

    expect(captured).toEqual({
      authorization: `Bearer ${CRON_SECRET}`,
      method: "GET",
      pathname: FILE_CLEANUP_MAINTENANCE_PATH,
    });
  });

  it("re-enters the event reminders route every time the 5-minute cron fires", async () => {
    let captured: CapturedRequest | undefined;
    const fetchHandler = vi.fn((request: Request) => {
      captured = captureRequest(request);
      return new Response(null, { status: 200 });
    });

    await runScheduledMaintenanceCleanup({
      context: createExecutionContextStub(),
      cron: MAINTENANCE_CRON_SCHEDULE.eventReminders,
      env: { CRON_SECRET },
      fetchHandler,
    });

    expect(captured).toEqual({
      authorization: `Bearer ${CRON_SECRET}`,
      method: "GET",
      pathname: EVENT_REMINDERS_MAINTENANCE_PATH,
    });
  });

  it("re-enters the image cleanup route when the image cron fires", async () => {
    let captured: CapturedRequest | undefined;
    const fetchHandler = vi.fn((request: Request) => {
      captured = captureRequest(request);
      return new Response(null, { status: 200 });
    });

    await runScheduledMaintenanceCleanup({
      context: createExecutionContextStub(),
      cron: MAINTENANCE_CRON_SCHEDULE.imageCleanup,
      env: { CRON_SECRET },
      fetchHandler,
    });

    expect(captured?.pathname).toBe(IMAGE_CLEANUP_MAINTENANCE_PATH);
  });
});

describe("runScheduledImageCleanup", () => {
  it("invokes the worker fetch handler with an authorized cron request", async () => {
    const env = { CRON_SECRET };
    const context = createExecutionContextStub();
    let captured: CapturedRequest | undefined;
    let receivedEnv: { CRON_SECRET?: string } | undefined;
    let receivedContext: { waitUntil(promise: Promise<unknown>): void } | undefined;

    const fetchHandler = vi.fn(
      (request: Request, handlerEnv: { CRON_SECRET?: string }, handlerContext: { waitUntil(promise: Promise<unknown>): void }) => {
        captured = captureRequest(request);
        receivedEnv = handlerEnv;
        receivedContext = handlerContext;
        return new Response(null, { status: 200 });
      }
    );

    await runScheduledImageCleanup({ fetchHandler, env, context });

    expect(fetchHandler).toHaveBeenCalledTimes(1);
    expect(captured).toEqual({
      authorization: `Bearer ${CRON_SECRET}`,
      method: "GET",
      pathname: IMAGE_CLEANUP_MAINTENANCE_PATH,
    });
    expect(receivedEnv).toBe(env);
    expect(receivedContext).toBe(context);
  });

  it("throws without calling the handler when the cron secret is missing", async () => {
    const fetchHandler = vi.fn(() => new Response(null, { status: 200 }));

    await expect(
      runScheduledImageCleanup({
        fetchHandler,
        env: {},
        context: createExecutionContextStub(),
      })
    ).rejects.toThrow(/CRON_SECRET/);

    expect(fetchHandler).not.toHaveBeenCalled();
  });

  it("surfaces the status when the maintenance request is rejected", async () => {
    const fetchHandler = vi.fn(() => new Response(null, { status: 401 }));

    await expect(
      runScheduledImageCleanup({
        fetchHandler,
        env: { CRON_SECRET },
        context: createExecutionContextStub(),
      })
    ).rejects.toThrow(/401/);
  });

  it("surfaces a server failure status from the maintenance request", async () => {
    const fetchHandler = vi.fn(() => new Response(null, { status: 500 }));

    await expect(
      runScheduledImageCleanup({
        fetchHandler,
        env: { CRON_SECRET },
        context: createExecutionContextStub(),
      })
    ).rejects.toThrow(/500/);
  });
});
