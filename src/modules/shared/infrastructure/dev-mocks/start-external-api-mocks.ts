/**
 * Starts the Node.js request interceptor that answers external provider calls
 * with in-memory mocks on the local development server.
 *
 * @module start-external-api-mocks
 */

import type { HttpHandler } from "msw/http";
import { setupServer } from "msw/node";

import { EXTERNAL_API_MOCKS_LOG_CONTEXT } from "@/src/modules/shared/constants/external-api-mocks";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Feature module that contributes handlers, used only for the startup log. */
export type ExternalApiMockSource = {
  handlers: HttpHandler[];
  name: string;
};

type GlobalExternalApiMocks = typeof globalThis & {
  __tuTribuExternalApiMocksServer?: ReturnType<typeof setupServer>;
};

const STARTED_LOG = {
  message: "External provider mocks intercept outgoing requests",
  operation: "start-external-api-mocks",
} as const;

/**
 * Starts intercepting outgoing requests with the given handlers.
 *
 * Unhandled requests (database, Better Auth, other providers) reach the real
 * network. The interceptor is kept on `globalThis` so a repeated `register()`
 * in the same process does not stack interceptors.
 *
 * @param sources - Handlers grouped by the module that owns them.
 * @returns Nothing.
 */
export function startExternalApiMocks(sources: ExternalApiMockSource[]): void {
  const globalScope = globalThis as GlobalExternalApiMocks;

  if (globalScope.__tuTribuExternalApiMocksServer) {
    return;
  }

  const server = setupServer(...sources.flatMap((source) => source.handlers));

  server.listen({ onUnhandledFrame: "bypass" });
  globalScope.__tuTribuExternalApiMocksServer = server;

  createServerLogger({
    ...EXTERNAL_API_MOCKS_LOG_CONTEXT,
    operation: STARTED_LOG.operation,
  }).warn({
    message: STARTED_LOG.message,
    metadata: { mockedProviders: sources.map((source) => source.name) },
  });
}
