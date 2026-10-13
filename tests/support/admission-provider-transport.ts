/**
 * Provides a closed HTTP boundary for real admission provider and JWKS tests.
 *
 * @module admission-provider-transport
 */

/** Defines one explicitly allowed synthetic HTTP endpoint. */
export type AdmissionProviderTestRoute = {
  origin: string;
  pathname: string;
  method: string;
  respond: (request: Request) => Response | Promise<Response>;
};

/** Records transport outcomes without bodies, headers, tokens, or query values. */
export type AdmissionProviderTransportReceipt = {
  origin: string;
  pathname: string;
  method: string;
  outcome: "responded" | "response_lost" | "aborted";
  status: number | null;
};

/** Exposes a fetch-compatible boundary and copies of its safe observation log. */
export type AdmissionProviderTestTransport = {
  fetch: typeof globalThis.fetch;
  readonly receipts: readonly AdmissionProviderTransportReceipt[];
  readonly deniedRequests: number;
};

/** Prevents overlapping global scopes from restoring another test's transport. */
let isGlobalTransportInstalled = false;

/**
 * Waits for a controlled response while honoring native request cancellation.
 *
 * @param request - Request whose signal bounds the controlled provider work.
 * @param route - Registered endpoint that supplies the synthetic response.
 * @param signal - Exact original transport cancellation signal, retained across Request construction and GC.
 * @returns The response produced before cancellation.
 * @throws The caller's abort reason or the registered handler's real error.
 */
async function respondToControlledRequest(
  request: Request,
  route: AdmissionProviderTestRoute,
  signal: AbortSignal,
): Promise<Response> {
  signal.throwIfAborted();
  let onAbort = () => undefined as void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => route.respond(request)),
      aborted,
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Creates a transport that never falls back to the real network.
 *
 * @param routes - Exact origin, pathname, and method allowlist for this test.
 * @returns A fetch boundary with safe, detached receipts and a denied count.
 * @throws An unregistered_route error before invoking any unregistered endpoint.
 */
export function createAdmissionProviderTransport(
  routes: readonly AdmissionProviderTestRoute[],
): AdmissionProviderTestTransport {
  const registeredRoutes = routes.map((route) => ({ ...route }));
  const receipts: AdmissionProviderTransportReceipt[] = [];
  let deniedRequests = 0;

  return {
    async fetch(input, init) {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const route = registeredRoutes.find((candidate) =>
        candidate.origin === url.origin
        && candidate.pathname === url.pathname
        && candidate.method.toUpperCase() === request.method,
      );

      if (!route || url.username || url.password) {
        deniedRequests += 1;
        throw new Error("AdmissionProviderTransport.fetch failed: unregistered_route");
      }

      const receipt: AdmissionProviderTransportReceipt = {
        origin: route.origin,
        pathname: route.pathname,
        method: request.method,
        outcome: "response_lost",
        status: null,
      };
      receipts.push(receipt);

      try {
        const response = await respondToControlledRequest(request, route, init?.signal ?? request.signal);
        receipt.outcome = "responded";
        receipt.status = response.status;
        return response;
      } catch (error) {
        receipt.outcome = request.signal.aborted ? "aborted" : "response_lost";
        throw error;
      }
    },
    get receipts() {
      return receipts.map((receipt) => ({ ...receipt }));
    },
    get deniedRequests() {
      return deniedRequests;
    },
  };
}

/**
 * Installs the closed boundary for consumers such as Better Auth's JWKS fetch.
 *
 * Tests using this global scope must run sequentially within their worker.
 * The original fetch is restored on both success and failure.
 *
 * @typeParam Result - Value returned by the cryptographic or provider workflow.
 * @param transport - Closed boundary that rejects all unregistered traffic.
 * @param run - Workflow that consumes the real SDK or verifier.
 * @returns The workflow's result after restoring the original transport.
 * @throws A scope_overlap error if another global transport scope is active.
 */
export async function withAdmissionProviderTransport<Result>(
  transport: AdmissionProviderTestTransport,
  run: () => Promise<Result>,
): Promise<Result> {
  if (isGlobalTransportInstalled) {
    throw new Error("AdmissionProviderTransport.install failed: scope_overlap");
  }

  const originalFetch = globalThis.fetch;
  isGlobalTransportInstalled = true;
  globalThis.fetch = transport.fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    isGlobalTransportInstalled = false;
  }
}
