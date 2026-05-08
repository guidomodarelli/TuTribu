/**
 * Renders the tribe subscription price management page.
 *
 * @module tribe-prices-page
 */

import { notFound } from "next/navigation";

import { TribeSubscriptionPriceManagement } from "@/components/subscriptions/tribe-subscription-price-management";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const PRICE_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-subscription-price-management-page",
  resolvePricesFailureMessage: "Failed to resolve tribe subscription prices",
} as const;

const PRICE_ADMIN_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const PRICE_PAGE_QUERY = {
  status: "status",
  statusOrigin: "statusOrigin",
} as const;

const PRICE_PAGE_STATUS_ORIGIN = {
  mercadoPagoOAuth: "mercado_pago_oauth",
} as const;

const PRICE_PAGE_STATUS_MESSAGE = {
  connected: "Mercado Pago quedó conectado.",
  setupRequired:
    "Falta configurar la aplicación OAuth de Mercado Pago en el entorno.",
} as const;

type TribePricesPageSearchParams = {
  status?: string | string[];
  statusOrigin?: string | string[];
};

/**
 * Reads the first search param value from App Router input.
 *
 * @param searchParamValue - Search param value received by the page.
 * @returns First non-empty search param value.
 */
function readFirstSearchParamValue(
  searchParamValue: string | string[] | undefined
): string | null {
  if (typeof searchParamValue === "string") {
    return searchParamValue;
  }

  if (Array.isArray(searchParamValue)) {
    const firstSearchParamValue = searchParamValue.find(
      (value) => value.trim().length > 0
    );

    return firstSearchParamValue ?? null;
  }

  return null;
}

/**
 * Resolves a safe user-facing status message for the prices page.
 *
 * @param status - Raw status query value.
 * @returns Spanish status message, or null when no status is supported.
 */
function resolveStatusMessage(status: string | null): string | null {
  if (status === TRIBE_SUBSCRIPTION_PRICE_STATUS.connected) {
    return PRICE_PAGE_STATUS_MESSAGE.connected;
  }

  if (status === TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired) {
    return PRICE_PAGE_STATUS_MESSAGE.setupRequired;
  }

  return null;
}

/**
 * Resolves whether a setup query status is stale for the loaded integration.
 *
 * @param status - Raw status query value.
 * @param hasMercadoPagoIntegration - Whether the tribe currently has an integration.
 * @param statusOrigin - Raw status origin query value.
 * @returns Whether the setup status should be hidden.
 */
function shouldHideSetupStatus(
  status: string | null,
  hasMercadoPagoIntegration: boolean,
  statusOrigin: string | null
): boolean {
  return (
    status === TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired &&
    hasMercadoPagoIntegration &&
    statusOrigin !== PRICE_PAGE_STATUS_ORIGIN.mercadoPagoOAuth
  );
}

/**
 * Renders subscription price settings for tribe leaders and guardians.
 *
 * @param props - Route params with the tribe slug.
 * @returns Tribe subscription price page.
 */
export default async function TribePricesPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<TribePricesPageSearchParams>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const status = readFirstSearchParamValue(
    resolvedSearchParams[PRICE_PAGE_QUERY.status]
  );
  const statusOrigin = readFirstSearchParamValue(
    resolvedSearchParams[PRICE_PAGE_QUERY.statusOrigin]
  );
  const queryStatusMessage = resolveStatusMessage(status);
  const { authenticatedMember, tribe, logger, modules } =
    await resolveVisibleTribePageAccess({
      operation: PRICE_MANAGEMENT_PAGE_LOG.operation,
      slug,
    });
  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);

  if (
    currentMembership?.role !== PRICE_ADMIN_ROLE.leader &&
    currentMembership?.role !== PRICE_ADMIN_ROLE.guardian
  ) {
    notFound();
  }

  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(tribe.slug);

  if (membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active) {
    notFound();
  }

  const shouldAutoConnectMercadoPago =
    status !== TRIBE_SUBSCRIPTION_PRICE_STATUS.connected &&
    status !== TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired;
  const priceList = await modules.subscriptions.useCases
    .listTribeSubscriptionPrices({
      tribeSlug: tribe.slug,
    })
    .then((resolvedPriceList) => ({
      ...resolvedPriceList,
      shouldAutoConnectMercadoPago,
    }))
    .catch((error: unknown) => {
      logger.error({
        message: PRICE_MANAGEMENT_PAGE_LOG.resolvePricesFailureMessage,
        error,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });

      return {
        hasMercadoPagoIntegration: false,
        prices: [],
        shouldAutoConnectMercadoPago: false,
        viewerPermissions: {
          canManagePrices: currentMembership.role === PRICE_ADMIN_ROLE.leader,
          canViewPrices: true,
        },
      };
    });
  const statusMessage = shouldHideSetupStatus(
    status,
    priceList.hasMercadoPagoIntegration,
    statusOrigin
  )
    ? null
    : queryStatusMessage;

  return (
    <main>
      <TribeSubscriptionPriceManagement
        canManagePrices={priceList.viewerPermissions.canManagePrices}
        isMercadoPagoConnected={priceList.hasMercadoPagoIntegration}
        prices={priceList.prices}
        shouldAutoConnectMercadoPago={priceList.shouldAutoConnectMercadoPago}
        statusMessage={statusMessage}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
