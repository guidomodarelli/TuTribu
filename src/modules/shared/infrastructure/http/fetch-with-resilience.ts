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

const FETCH_RESILIENCE_ABORT_ERROR_NAME = "AbortError";
const FETCH_RESILIENCE_ABORT_EVENT_NAME = "abort";
const FETCH_RESILIENCE_ERROR_MESSAGE = {
  requestFailed: "Request failed",
  requestTimedOut: "Request timed out",
} as const;
const HTTP_STATUS_BAD_GATEWAY = 502;
const HTTP_STATUS_GATEWAY_TIMEOUT = 504;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

/**
 * La allowlist 500/502/503/504 se usa porque esos códigos suelen representar
 * fallas transitorias, no definitivas.
 *
 * 500 Internal Server Error: Suele ser un error temporal en el servidor
 * (sobrecarga, estado intermedio, fallo momentáneo de dependencia). Un retry
 * corto puede entrar cuando el proceso ya se recuperó.
 *
 * 502 Bad Gateway: El gateway/proxy no pudo obtener respuesta válida del
 * upstream. Es muy típico de cortes breves entre servicios o instancias
 * reiniciando. Retry suele funcionar.
 *
 * 503 Service Unavailable: El servicio está temporalmente no disponible
 * (mantenimiento, saturación, autoscaling). Está diseñado justamente para
 * escenarios donde reintentar más tarde tiene sentido.
 *
 * 504 Gateway Timeout: Hubo timeout al esperar al upstream. Muchas veces es
 * latencia puntual o cola alta; un retry con backoff puede entrar en una
 * ventana más estable.
 */
const retryableStatusCodes = new Set([
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_BAD_GATEWAY,
  HTTP_STATUS_SERVICE_UNAVAILABLE,
  HTTP_STATUS_GATEWAY_TIMEOUT,
]);

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === FETCH_RESILIENCE_ABORT_ERROR_NAME;
}

function shouldRetryResponse(response: HttpResponse, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) {
    return false;
  }

  const status = response.status;
  return typeof status === "number" && retryableStatusCodes.has(status);
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
      sourceSignal.addEventListener(FETCH_RESILIENCE_ABORT_EVENT_NAME, forwardAbort);
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
        sourceSignal.removeEventListener(FETCH_RESILIENCE_ABORT_EVENT_NAME, forwardAbort);
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
        throw new Error(FETCH_RESILIENCE_ERROR_MESSAGE.requestTimedOut);
      }

      if (attempt >= config.maxRetries) {
        throw error;
      }

      await delay(config.retryDelayMs);
    }
  }

  throw new Error(FETCH_RESILIENCE_ERROR_MESSAGE.requestFailed);
}
