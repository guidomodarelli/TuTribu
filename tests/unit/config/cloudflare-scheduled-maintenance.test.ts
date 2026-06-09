/** @jest-environment node */

import {
  IMAGE_CLEANUP_MAINTENANCE_PATH,
  buildImageCleanupCronRequest,
  runScheduledImageCleanup,
} from "@/config/cloudflare-scheduled-maintenance";

const CRON_SECRET = "cron-secret-value";

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

describe("runScheduledImageCleanup", () => {
  it("invokes the worker fetch handler with an authorized cron request", async () => {
    const env = { CRON_SECRET };
    const context = createExecutionContextStub();
    let captured: CapturedRequest | undefined;
    let receivedEnv: typeof env | undefined;
    let receivedContext: typeof context | undefined;

    const fetchHandler = jest.fn(
      (request: Request, handlerEnv: typeof env, handlerContext: typeof context) => {
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
    const fetchHandler = jest.fn(() => new Response(null, { status: 200 }));

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
    const fetchHandler = jest.fn(() => new Response(null, { status: 401 }));

    await expect(
      runScheduledImageCleanup({
        fetchHandler,
        env: { CRON_SECRET },
        context: createExecutionContextStub(),
      })
    ).rejects.toThrow(/401/);
  });

  it("surfaces a server failure status from the maintenance request", async () => {
    const fetchHandler = jest.fn(() => new Response(null, { status: 500 }));

    await expect(
      runScheduledImageCleanup({
        fetchHandler,
        env: { CRON_SECRET },
        context: createExecutionContextStub(),
      })
    ).rejects.toThrow(/500/);
  });
});
