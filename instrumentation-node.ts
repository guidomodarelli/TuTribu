/**
 * Node.js-only server instrumentation.
 *
 * Composes the development-only external provider mocks: with
 * `MOCK_EXTERNAL_APIS=1` on `next dev`, Mercado Pago calls are answered by an
 * in-memory API instead of the real provider. MSW's `msw/node` interceptor
 * only exists for Node.js, so `instrumentation.ts` loads this file only in the
 * `nodejs` runtime and the edge instrumentation bundle never resolves it.
 *
 * @module instrumentation-node
 */

import { EXTERNAL_API_MOCKS_ACTIVATION } from "@/src/modules/shared/constants/external-api-mocks";

/** Next.js phase of `next build`, which has no runtime secrets to check. */
const PRODUCTION_BUILD_PHASE = "phase-production-build";

/**
 * Reports missing or unusable environment variables per feature once the server starts, so a misconfiguration
 * shows up at startup instead of as a 500 in the middle of a flow. Local development stops on blocking ones.
 *
 * @returns Promise resolved once the check is logged.
 */
async function checkStartupEnvironment(): Promise<void> {
  if (process.env.NEXT_PHASE === PRODUCTION_BUILD_PHASE) {
    return;
  }

  const [{ checkServerEnvironment }, { SERVER_ENVIRONMENT_REQUIREMENTS }] = await Promise.all([
    import("@/src/modules/shared/infrastructure/config/server-environment-check"),
    import("@/src/modules/server-environment-requirements"),
  ]);

  await checkServerEnvironment(process.env, SERVER_ENVIRONMENT_REQUIREMENTS, {
    failOnBlocking: process.env.NODE_ENV === "development",
  });
}

/**
 * Starts the Node.js instrumentation for one server instance.
 *
 * The literal `NODE_ENV` check lets production builds drop the mock imports.
 *
 * @returns Promise resolved once startup work is done.
 */
export async function registerNodeInstrumentation(): Promise<void> {
  await checkStartupEnvironment();

  const { reportIgnoredExternalApiMocksFlag, resolveExternalApiMocksActivation } =
    await import(
      "@/src/modules/shared/infrastructure/dev-mocks/external-api-mocks-activation"
    );
  const activation = resolveExternalApiMocksActivation(process.env);

  if (activation === EXTERNAL_API_MOCKS_ACTIVATION.ignoredOutsideDevelopment) {
    reportIgnoredExternalApiMocksFlag();
    return;
  }

  if (
    process.env.NODE_ENV !== "development" ||
    activation !== EXTERNAL_API_MOCKS_ACTIVATION.enabled
  ) {
    return;
  }

  const [{ startExternalApiMocks }, mercadoPagoMocks] = await Promise.all([
    import("@/src/modules/shared/infrastructure/dev-mocks/start-external-api-mocks"),
    import(
      "@/src/modules/subscriptions/infrastructure/mercado-pago/dev-mocks/mercado-pago-mock-handlers"
    ),
  ]);

  startExternalApiMocks([
    {
      handlers: mercadoPagoMocks.createMercadoPagoMockHandlers(
        mercadoPagoMocks.resolveMercadoPagoMockOptions(process.env)
      ),
      name: "mercado-pago",
    },
  ]);
}
