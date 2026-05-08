/**
 * Handles Mercado Pago OAuth callbacks for tribe payment integrations.
 *
 * @module mercado-pago-oauth-callback-route
 */

import { redirect } from "next/navigation";

import { ROUTES } from "@/src/constants/routes";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { verifyMercadoPagoOAuthState } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-oauth-state";
import { exchangeMercadoPagoAuthorizationCode } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const OAUTH_CALLBACK_QUERY = {
  code: "code",
  state: "state",
  status: "status",
  statusOrigin: "statusOrigin",
} as const;

const OAUTH_REDIRECT = {
  querySeparator: "?",
  statusOriginValue: "mercado_pago_oauth",
} as const;

const OAUTH_CALLBACK_LOG = {
  exchangeFailureMessage: "Mercado Pago OAuth callback token exchange failed",
  feature: "subscriptions",
  operation: "mercado-pago-oauth-callback",
} as const;

/**
 * Builds the redirect URL back to the prices page with a status query.
 *
 * @param tribeSlug - Tribe slug.
 * @param status - Connection status.
 * @param statusOrigin - Optional source of the redirected status.
 * @returns Prices page route.
 */
function buildPricesRedirect(
  tribeSlug: string,
  status: string,
  statusOrigin?: string
): string {
  const pricesPath = ROUTES.tribes.prices(tribeSlug);
  const searchParams = new URLSearchParams({
    [OAUTH_CALLBACK_QUERY.status]: status,
  });

  if (statusOrigin) {
    searchParams.set(OAUTH_CALLBACK_QUERY.statusOrigin, statusOrigin);
  }

  return [
    pricesPath,
    OAUTH_REDIRECT.querySeparator,
    searchParams.toString(),
  ].join("");
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: OAUTH_CALLBACK_LOG.feature,
    operation: OAUTH_CALLBACK_LOG.operation,
    requestId,
  });
  const code = requestUrl.searchParams.get(OAUTH_CALLBACK_QUERY.code);
  const verifiedState = verifyMercadoPagoOAuthState(
    requestUrl.searchParams.get(OAUTH_CALLBACK_QUERY.state)
  );
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (
    !code ||
    !verifiedState ||
    !authenticatedMember ||
    authenticatedMember.id !== verifiedState.memberId
  ) {
    redirect(ROUTES.home);
  }

  let result: Awaited<
    ReturnType<typeof modules.subscriptions.useCases.connectTribePaymentIntegration>
  >;

  try {
    const tokenResult = await exchangeMercadoPagoAuthorizationCode(code);

    result = await modules.subscriptions.useCases.connectTribePaymentIntegration({
      accessToken: tokenResult.accessToken,
      expiresIn: tokenResult.expiresIn,
      providerAccountId: tokenResult.providerAccountId,
      refreshToken: tokenResult.refreshToken,
      tribeSlug: verifiedState.tribeSlug,
    });
  } catch (error) {
    logger.error({
      message: OAUTH_CALLBACK_LOG.exchangeFailureMessage,
      error,
      metadata: {
        requestId,
        tribeSlug: verifiedState.tribeSlug,
        viewerId: authenticatedMember.id,
      },
    });

    redirect(
      buildPricesRedirect(
        verifiedState.tribeSlug,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired,
        OAUTH_REDIRECT.statusOriginValue
      )
    );
  }

  redirect(
    buildPricesRedirect(
      verifiedState.tribeSlug,
      result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
        ? TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
        : result.status
    )
  );
}
