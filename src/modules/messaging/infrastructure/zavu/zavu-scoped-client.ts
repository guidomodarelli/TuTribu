/** Scoped Zavu SDK client shared by the delivery transport and the status lookup. @module zavu-scoped-client */
import "server-only";
import Zavu from "@zavudev/sdk";
import { ZAVU_DELIVERY_ENDPOINT, ZAVU_DELIVERY_HEADER, ZAVU_DELIVERY_TRANSPORT } from "../../constants/zavu-delivery";

/** Credential, transport bound and request scope of one SDK client. */
type ZavuScopedClientInput = {
  credential: string;
  timeoutMs: number;
  /** Owner transport that actually sends each request. */
  send: typeof globalThis.fetch;
  /** Throws for any SDK request outside the exact own scope. */
  admit: (request: Request) => void;
  /** Own headers sent after the authorization header; inherited SDK headers are never forwarded. */
  headers: Record<string, string>;
};

/**
 * @param input - Credential, bound, transport, request scope and own headers.
 * @returns One SDK client without retries or SDK logs whose every admitted request is re-sent with only own headers, no redirects and the original deadline.
 */
export function createScopedZavuClient({ credential, timeoutMs, send, admit, headers }: ZavuScopedClientInput): Zavu {
  const scopedFetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    admit(request);
    const ownHeaders = new Headers({ [ZAVU_DELIVERY_HEADER.authorization]: `${ZAVU_DELIVERY_TRANSPORT.authorizationPrefix}${credential}`, ...headers });
    // Preserve the original deadline when SDK intermediate Request signals are collected.
    return send(new Request(request, { headers: ownHeaders, redirect: ZAVU_DELIVERY_TRANSPORT.redirect }), { signal: init?.signal ?? request.signal });
  };
  return new Zavu({ apiKey: credential, baseURL: ZAVU_DELIVERY_ENDPOINT.origin, fetch: scopedFetch, timeout: timeoutMs, maxRetries: ZAVU_DELIVERY_TRANSPORT.maximumRetries, logLevel: ZAVU_DELIVERY_TRANSPORT.logLevel });
}
