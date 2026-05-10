export type HttpResponse = {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
};

export type HttpFetcher = (input: string, init?: RequestInit) => Promise<HttpResponse>;

export type FetchResilienceOptions = {
  lifecycleLogger?: FetchLifecycleLogger;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
};

type FetchLifecycleEvent = {
  attempt: number;
  event:
    | "request-attempted"
    | "retry-scheduled"
    | "timeout-abort"
    | "request-failed";
  input: string;
  method: string;
  status?: number;
  reason?: "timeout" | "caller-abort" | "request-error";
};

export type FetchLifecycleLogger = (event: FetchLifecycleEvent) => void;

const FETCH_DEFAULT_METHOD = "GET";
const FETCH_LIFECYCLE_EVENT = {
  requestAttempted: "request-attempted",
  requestFailed: "request-failed",
  retryScheduled: "retry-scheduled",
  timeoutAbort: "timeout-abort",
} as const;

const FETCH_FAILURE_REASON = {
  callerAbort: "caller-abort",
  requestError: "request-error",
  timeout: "timeout",
} as const;

type FetchAbortReason =
  | (typeof FETCH_FAILURE_REASON)[keyof typeof FETCH_FAILURE_REASON]
  | null;

const defaultOptions: FetchResilienceOptions = {
  lifecycleLogger: undefined,
  maxRetries: 1,
  retryDelayMs: 100,
  timeoutMs: 3000,
};

const FETCH_RESILIENCE_ABORT_ERROR_NAME = "AbortError";
const FETCH_RESILIENCE_ABORT_EVENT_NAME = "abort";
const FETCH_RESILIENCE_ERROR_MESSAGE = {
  requestAborted: "Request aborted",
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
  getAbortReason: () => FetchAbortReason;
} {
  const timeoutController = new AbortController();
  let abortReason: FetchAbortReason = null;
  const timeoutId = setTimeout(() => {
    abortReason = FETCH_FAILURE_REASON.timeout;
    timeoutController.abort();
  }, timeoutMs);

  const sourceSignal = init.signal;
  const forwardAbort = () => {
    if (!abortReason) {
      abortReason = FETCH_FAILURE_REASON.callerAbort;
    }

    timeoutController.abort();
  };

  if (sourceSignal) {
    if (sourceSignal.aborted) {
      abortReason = FETCH_FAILURE_REASON.callerAbort;
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
    getAbortReason: () => abortReason,
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
  const method = init.method ?? FETCH_DEFAULT_METHOD;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const attemptNumber = attempt + 1;
    const { requestInit, cleanup, getAbortReason } = buildRequestInit(init, config.timeoutMs);

    config.lifecycleLogger?.({
      attempt: attemptNumber,
      event: FETCH_LIFECYCLE_EVENT.requestAttempted,
      input,
      method,
    });

    try {
      const response = await fetcher(input, requestInit);
      cleanup();

      if (shouldRetryResponse(response, attempt, config.maxRetries)) {
        config.lifecycleLogger?.({
          attempt: attemptNumber,
          event: FETCH_LIFECYCLE_EVENT.retryScheduled,
          input,
          method,
          status: response.status,
        });
        await delay(config.retryDelayMs);
        continue;
      }

      return response;
    } catch (error) {
      cleanup();
      const abortReason = getAbortReason();

      if (abortReason === FETCH_FAILURE_REASON.timeout) {
        config.lifecycleLogger?.({
          attempt: attemptNumber,
          event: FETCH_LIFECYCLE_EVENT.timeoutAbort,
          input,
          method,
        });
      }

      if (abortReason === FETCH_FAILURE_REASON.callerAbort) {
        config.lifecycleLogger?.({
          attempt: attemptNumber,
          event: FETCH_LIFECYCLE_EVENT.requestFailed,
          input,
          method,
          reason: FETCH_FAILURE_REASON.callerAbort,
        });

        throw new Error(FETCH_RESILIENCE_ERROR_MESSAGE.requestAborted);
      }

      if (
        isAbortError(error) &&
        abortReason === FETCH_FAILURE_REASON.timeout &&
        attempt >= config.maxRetries
      ) {
        config.lifecycleLogger?.({
          attempt: attemptNumber,
          event: FETCH_LIFECYCLE_EVENT.requestFailed,
          input,
          method,
          reason: FETCH_FAILURE_REASON.timeout,
        });
        throw new Error(FETCH_RESILIENCE_ERROR_MESSAGE.requestTimedOut);
      }

      if (attempt >= config.maxRetries) {
        config.lifecycleLogger?.({
          attempt: attemptNumber,
          event: FETCH_LIFECYCLE_EVENT.requestFailed,
          input,
          method,
          reason: abortReason ?? FETCH_FAILURE_REASON.requestError,
        });
        throw error;
      }

      if (isAbortError(error) && abortReason === FETCH_FAILURE_REASON.timeout) {
        config.lifecycleLogger?.({
          attempt: attemptNumber,
          event: FETCH_LIFECYCLE_EVENT.retryScheduled,
          input,
          method,
          reason: FETCH_FAILURE_REASON.timeout,
        });
      }

      await delay(config.retryDelayMs);
    }
  }

  throw new Error(FETCH_RESILIENCE_ERROR_MESSAGE.requestFailed);
}
