import {
  fetchWithResilience,
  readJsonWithTimeout,
  type FetchLifecycleLogger,
  type HttpFetcher,
  type HttpResponse,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

const BODY_READ_TIMEOUT_MS = 5000;

const retryableServerErrorCases = [
  {
    statusCode: 500,
    explanation:
      "Internal Server Error is usually transient and can recover on a short retry",
  },
  {
    statusCode: 502,
    explanation:
      "Bad Gateway often reflects temporary upstream connectivity failures",
  },
  {
    statusCode: 503,
    explanation:
      "Service Unavailable indicates temporary saturation or maintenance windows",
  },
  {
    statusCode: 504,
    explanation:
      "Gateway Timeout can succeed after a short retry when upstream latency drops",
  },
] as const;

/**
 * Sí, en general está bien que 400, 401, 403 y 404 sean no retryables.
 *
 * Por qué:
 *
 * - 400: el request está mal formado; reintentar igual no lo arregla.
 * - 401: normalmente requiere renovar sesión/token o reautenticación, no retry
 *   ciego.
 * - 403: es falta de permisos; retry automático no cambia autorización.
 * - 404: usualmente el recurso no existe.
 */
const nonRetryableClientErrorCases = [
  {
    statusCode: 400,
    explanation:
      "Bad Request points to invalid client input and retrying the same payload will fail again",
  },
  {
    statusCode: 401,
    explanation:
      "Unauthorized requires authentication refresh, not blind transport retries",
  },
  {
    statusCode: 403,
    explanation:
      "Forbidden indicates permission denial that retries cannot resolve",
  },
  {
    statusCode: 404,
    explanation:
      "Not Found generally means the resource does not exist at that endpoint",
  },
] as const;

describe("fetchWithResilience", () => {
  it.each(retryableServerErrorCases)(
    "retries once for retryable $statusCode: $explanation",
    async ({ statusCode }) => {
      const fetcher: HttpFetcher = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: statusCode, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

      const response = await fetchWithResilience(
        fetcher,
        "https://api.tutribu.test/v1/resources",
        { method: "GET" },
        { maxRetries: 1, retryDelayMs: 0, timeoutMs: 50 }
      );

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(response.ok).toBe(true);
    }
  );

  it.each(nonRetryableClientErrorCases)(
    "does not retry for non-retryable $statusCode: $explanation",
    async ({ statusCode }) => {
      const fetcher: HttpFetcher = jest
        .fn()
        .mockResolvedValue({ ok: false, status: statusCode, json: async () => ({}) });

      const response = await fetchWithResilience(
        fetcher,
        "https://api.tutribu.test/v1/resources",
        { method: "GET" },
        { maxRetries: 3, retryDelayMs: 0, timeoutMs: 50 }
      );

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(statusCode);
    }
  );

  it("throws timeout error when request exceeds timeout", async () => {
    const fetcher: HttpFetcher = jest.fn((_, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    await expect(
      fetchWithResilience(
        fetcher,
        "https://api.tutribu.test/v1/resources",
        { method: "GET" },
        { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5 }
      )
    ).rejects.toThrow("Request timed out");
  });

  it("reports retry, timeout, and failure lifecycle events", async () => {
    const lifecycleLogger: FetchLifecycleLogger = jest.fn();
    const fetcher: HttpFetcher = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockImplementationOnce((_, init) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

    await expect(
      fetchWithResilience(
        fetcher,
        "https://api.tutribu.test/v1/resources",
        { method: "GET" },
        {
          lifecycleLogger,
          maxRetries: 1,
          retryDelayMs: 0,
          timeoutMs: 5,
        }
      )
    ).rejects.toThrow("Request timed out");

    expect(lifecycleLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        event: "retry-scheduled",
        status: 503,
      })
    );
    expect(lifecycleLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 2,
        event: "timeout-abort",
      })
    );
    expect(lifecycleLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 2,
        event: "request-failed",
        reason: "timeout",
      })
    );
  });

  it("distinguishes caller aborts from timeout aborts", async () => {
    const lifecycleLogger: FetchLifecycleLogger = jest.fn();
    const controller = new AbortController();
    const fetcher: HttpFetcher = jest.fn((_, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const requestPromise = fetchWithResilience(
      fetcher,
      "https://api.tutribu.test/v1/resources",
      {
        method: "GET",
        signal: controller.signal,
      },
      {
        lifecycleLogger,
        maxRetries: 0,
        retryDelayMs: 0,
        timeoutMs: 100,
      }
    );

    controller.abort();

    await expect(requestPromise).rejects.toThrow("Request aborted");
    expect(lifecycleLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        event: "request-failed",
        reason: "caller-abort",
      })
    );
  });
});

describe("readJsonWithTimeout", () => {
  it("resolves the parsed body when the read settles before the timeout", async () => {
    const response: HttpResponse = {
      json: async () => ({ success: true }),
      ok: true,
      status: 200,
    };

    await expect(readJsonWithTimeout(response, BODY_READ_TIMEOUT_MS)).resolves.toEqual({
      success: true,
    });
  });

  it("rejects when the body stream stalls past the timeout so the caller can fall back", async () => {
    jest.useFakeTimers();
    try {
      // Headers arrived but the body never streams: `json()` never settles.
      const response: HttpResponse = {
        json: () => new Promise<unknown>(() => {}),
        ok: true,
        status: 200,
      };

      const readPromise = readJsonWithTimeout(response, BODY_READ_TIMEOUT_MS);
      const assertion = expect(readPromise).rejects.toThrow("Response body read timed out");

      await jest.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS);

      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
