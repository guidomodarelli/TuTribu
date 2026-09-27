/**
 * Renders the tribe subscription price management page.
 *
 * @module tribe-prices-page
 */

import { notFound } from "next/navigation";

import { TribeSubscriptionPriceManagement } from "@/components/subscriptions/tribe-subscription-price-management";
import {
  MERCADO_PAGO_CONNECTION_STATUS,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { ROUTES } from "@/src/constants/routes";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const PRICE_MANAGEMENT_PAGE_LOG = {
  resolveDiagnosticsFailureMessage:
    "Failed to resolve tribe subscriber diagnostics",
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
 * Resolves whether a query status is stale for the loaded integration.
 *
 * @param status - Raw status query value.
 * @param isMercadoPagoConnected - Whether the tribe has a refreshed provider integration.
 * @param statusOrigin - Raw status origin query value.
 * @returns Whether the query status should be hidden.
 */
function shouldHideQueryStatus(
  status: string | null,
  isMercadoPagoConnected: boolean,
  statusOrigin: string | null
): boolean {
  if (
    status === TRIBE_SUBSCRIPTION_PRICE_STATUS.connected &&
    !isMercadoPagoConnected
  ) {
    return true;
  }

  return (
    status === TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired &&
    isMercadoPagoConnected &&
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
      callbackPath: ROUTES.tribes.prices(slug),
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
        availableMercadoPagoAccounts: [],
        freeJoinIsCurrent: false,
        openFreeJoinEnabled: false,
        hasMercadoPagoIntegration: false,
        mercadoPagoConnectionStatus:
          MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection,
        prices: [],
        shouldAutoConnectMercadoPago: false,
        viewerPermissions: {
          canManagePrices: currentMembership.role === PRICE_ADMIN_ROLE.leader,
          canViewPrices: true,
        },
      };
    });
  const isMercadoPagoConnected =
    priceList.mercadoPagoConnectionStatus ===
    MERCADO_PAGO_CONNECTION_STATUS.connected;
  const subscriberDiagnostics = priceList.viewerPermissions.canManagePrices
    ? await modules.subscriptions.useCases
        .getTribeSubscriberDiagnostics({
          tribeSlug: tribe.slug,
        })
        .catch((error: unknown) => {
          logger.error({
            message:
              PRICE_MANAGEMENT_PAGE_LOG.resolveDiagnosticsFailureMessage,
            error,
            metadata: {
              slug,
              viewerId: authenticatedMember.id,
            },
          });

          return null;
        })
    : null;
  const statusMessage = shouldHideQueryStatus(
    status,
    isMercadoPagoConnected,
    statusOrigin
  )
    ? null
    : queryStatusMessage;

  return (
    <main>
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={priceList.availableMercadoPagoAccounts}
        canManagePrices={priceList.viewerPermissions.canManagePrices}
        freeJoinIsCurrent={priceList.freeJoinIsCurrent}
        isMercadoPagoConnected={isMercadoPagoConnected}
        openFreeJoinEnabled={priceList.openFreeJoinEnabled}
        prices={priceList.prices}
        shouldAutoConnectMercadoPago={priceList.shouldAutoConnectMercadoPago}
        subscriberDiagnostics={subscriberDiagnostics}
        statusMessage={statusMessage}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
