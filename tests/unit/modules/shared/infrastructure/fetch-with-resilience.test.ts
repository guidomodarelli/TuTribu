import {
  fetchWithResilience,
  type HttpFetcher,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

describe("fetchWithResilience", () => {
  it("retries once for retryable 5xx response", async () => {
    const fetcher: HttpFetcher = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const response = await fetchWithResilience(
      fetcher,
      "https://api.academia.test/v1/courses",
      { method: "GET" },
      { maxRetries: 1, retryDelayMs: 0, timeoutMs: 50 }
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(true);
  });

  it.each([400, 401, 403, 404])(
    "does not retry for non-retryable %i response",
    async (statusCode) => {
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
