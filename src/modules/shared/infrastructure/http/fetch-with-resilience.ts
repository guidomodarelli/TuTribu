export type HttpResponse = {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
};

export type HttpFetcher = (input: string, init?: RequestInit) => Promise<HttpResponse>;

export type FetchResilienceOptions = {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
};

const defaultOptions: FetchResilienceOptions = {
  maxRetries: 1,
  retryDelayMs: 100,
  timeoutMs: 3000,
};

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function shouldRetryResponse(response: HttpResponse, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) {
    return false;
  }

  const status = response.status;
  return typeof status === "number" && status >= 500 && status < 600;
}

function buildRequestInit(init: RequestInit, timeoutMs: number): {
  requestInit: RequestInit;
  cleanup: () => void;
} {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  const sourceSignal = init.signal;
  const forwardAbort = () => {
    timeoutController.abort();
  };

  if (sourceSignal) {
    if (sourceSignal.aborted) {
      timeoutController.abort();
    } else {
      sourceSignal.addEventListener("abort", forwardAbort);
    }
  }

  return {
    requestInit: {
      ...init,
      signal: timeoutController.signal,
    },
    cleanup: () => {
      clearTimeout(timeoutId);
      if (sourceSignal) {
        sourceSignal.removeEventListener("abort", forwardAbort);
      }
    },
  };
}

export async function fetchWithResilience(
  fetcher: HttpFetcher,
  input: string,
  init: RequestInit = {},
  options: Partial<FetchResilienceOptions> = {}
): Promise<HttpResponse> {
  const config: FetchResilienceOptions = {
    ...defaultOptions,
    ...options,
  };

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const { requestInit, cleanup } = buildRequestInit(init, config.timeoutMs);

    try {
      const response = await fetcher(input, requestInit);
      cleanup();

      if (shouldRetryResponse(response, attempt, config.maxRetries)) {
        await delay(config.retryDelayMs);
        continue;
      }

      return response;
    } catch (error) {
      cleanup();

      if (isAbortError(error) && attempt >= config.maxRetries) {
        throw new Error("Request timed out");
      }

      if (attempt >= config.maxRetries) {
        throw error;
      }

      await delay(config.retryDelayMs);
    }
  }

  throw new Error("Request failed");
}
