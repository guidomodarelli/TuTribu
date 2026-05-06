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

const OAUTH_CALLBACK_QUERY = {
  code: "code",
  state: "state",
  status: "status",
} as const;

const OAUTH_REDIRECT = {
  querySeparator: "?",
  valueSeparator: "=",
} as const;

/**
 * Builds the redirect URL back to the prices page with a status query.
 *
 * @param tribeSlug - Tribe slug.
 * @param status - Connection status.
 * @returns Prices page route.
 */
function buildPricesRedirect(tribeSlug: string, status: string): string {
  const pricesPath = ROUTES.tribes.prices(tribeSlug);

  return [
    pricesPath,
    OAUTH_REDIRECT.querySeparator,
    OAUTH_CALLBACK_QUERY.status,
    OAUTH_REDIRECT.valueSeparator,
    status,
  ].join("");
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
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

  const tokenResult = await exchangeMercadoPagoAuthorizationCode(code);
  const result =
    await modules.subscriptions.useCases.connectTribePaymentIntegration({
      accessToken: tokenResult.accessToken,
      expiresIn: tokenResult.expiresIn,
      providerAccountId: tokenResult.providerAccountId,
      refreshToken: tokenResult.refreshToken,
      tribeSlug: verifiedState.tribeSlug,
    });

  redirect(
    buildPricesRedirect(
      verifiedState.tribeSlug,
      result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
        ? TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
        : result.status
    )
  );
}
