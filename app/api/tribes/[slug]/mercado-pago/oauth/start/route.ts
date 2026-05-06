/**
 * Starts Mercado Pago OAuth for a tribe leader.
 *
 * @module mercado-pago-oauth-start-route
 */

import { redirect } from "next/navigation";

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { buildMercadoPagoAuthorizationUrl } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import { buildMercadoPagoOAuthState } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-oauth-state";
import { createRequestModules } from "@/src/modules/setup";
import { ROUTES } from "@/src/constants/routes";

const MERCADO_PAGO_OAUTH_ROLE = {
  leader: "leader",
} as const;

const OAUTH_REDIRECT = {
  querySeparator: "?",
  statusParam: "status",
  valueSeparator: "=",
} as const;

/**
 * Builds a prices page redirect with a status query.
 *
 * @param tribeSlug - Tribe slug used to build the prices page route.
 * @param status - Status value displayed by the prices page.
 * @returns Prices page route with a status query.
 */
function buildPricesStatusRedirect(tribeSlug: string, status: string): string {
  return [
    ROUTES.tribes.prices(tribeSlug),
    OAUTH_REDIRECT.querySeparator,
    OAUTH_REDIRECT.statusParam,
    OAUTH_REDIRECT.valueSeparator,
    status,
  ].join("");
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    redirect(ROUTES.auth.signIn);
  }

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === slug);

  if (currentMembership?.role !== MERCADO_PAGO_OAUTH_ROLE.leader) {
    redirect(ROUTES.tribes.prices(slug));
  }

  let authorizationUrl: string;

  try {
    authorizationUrl = buildMercadoPagoAuthorizationUrl(
      buildMercadoPagoOAuthState({
        memberId: authenticatedMember.id,
        tribeSlug: slug,
      })
    );
  } catch {
    redirect(
      buildPricesStatusRedirect(
        slug,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired
      )
    );
  }

  redirect(authorizationUrl);
}
