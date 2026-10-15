/**
 * Next.js server instrumentation entrypoint.
 *
 * Composes the development-only external provider mocks: with
 * `MOCK_EXTERNAL_APIS=1` on `next dev`, Mercado Pago calls are answered by an
 * in-memory API instead of the real provider.
 *
 * @module instrumentation
 */

import { EXTERNAL_API_MOCKS_ACTIVATION } from "@/src/modules/shared/constants/external-api-mocks";

/**
 * Runs once when a Next.js server instance starts.
 *
 * The literal `NODE_ENV` check lets production builds drop the mock imports.
 *
 * @returns Promise resolved once startup work is done.
 */
export async function register(): Promise<void> {
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
