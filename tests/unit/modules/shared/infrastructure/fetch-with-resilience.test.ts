import {
  fetchWithResilience,
  type HttpFetcher,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

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
        "https://api.academia.test/v1/courses",
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
        "https://api.academia.test/v1/courses",
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
        "https://api.academia.test/v1/courses",
        { method: "GET" },
        { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5 }
      )
    ).rejects.toThrow("Request timed out");
  });
});
