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

/**
 * Starts the Node.js instrumentation for one server instance.
 *
 * The literal `NODE_ENV` check lets production builds drop the mock imports.
 *
 * @returns Promise resolved once startup work is done.
 */
export async function registerNodeInstrumentation(): Promise<void> {
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
