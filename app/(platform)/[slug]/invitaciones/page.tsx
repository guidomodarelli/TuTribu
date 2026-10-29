
import { TribeInvitationManagement } from "@/components/tribes/tribe-invitation-management";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { ROUTES } from "@/src/constants/routes";
import type { resolveVisibleTribePageAccess, TribeSlugPageProps } from "../tribe-page-access";
import { resolveTribeManagerPageAccess } from "../tribe-manager-page-access";

const INVITATION_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-invitation-management-page",
  resolveInvitationsFailureMessage: "Failed to resolve tribe invitations",
  resolvePricesFailureMessage: "Failed to resolve tribe subscription prices",
} as const;

const INVITATION_PRICE_STATUS = {
  active: "active",
} as const;

type TribeInvitationsPageAccess = Awaited<ReturnType<typeof resolveVisibleTribePageAccess>>;
type TribeSubscriptionPrices = Awaited<
  ReturnType<TribeInvitationsPageAccess["modules"]["subscriptions"]["useCases"]["listTribeSubscriptionPrices"]>
>["prices"];

/** Active prices an invitation can link, as the management view shows them. */
function toAvailablePrices(prices: TribeSubscriptionPrices) {
  return prices
    .filter((price) => price.status === INVITATION_PRICE_STATUS.active)
    .map((price) => ({
      amountCents: price.amountCents,
      currency: price.currency,
      id: price.id,
      isCurrent: price.isCurrent,
      mercadoPagoAccountEmail: price.mercadoPagoAccountEmail ?? null,
      mercadoPagoAccountLabel: price.mercadoPagoAccountLabel ?? null,
      name: price.name,
      trial: price.trial,
    }));
}

export default async function TribeInvitationsPage({ params }: TribeSlugPageProps) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveTribeManagerPageAccess({
      callbackPath: ROUTES.tribes.invitations(slug),
      operation: INVITATION_MANAGEMENT_PAGE_LOG.operation,
      slug,
    });

  const [invitations, pricesListing] = await Promise.all([
    modules.tribes.useCases
      .listTribeInvitations({
        baseUrl: resolvePublicAppBaseUrl(),
        tribeSlug: tribe.slug,
      })
      .catch((error: unknown) => {
        logger.error({
          message:
            INVITATION_MANAGEMENT_PAGE_LOG.resolveInvitationsFailureMessage,
          error,
          metadata: {
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return [];
      }),
    modules.subscriptions.useCases
      .listTribeSubscriptionPrices({
        tribeSlug: tribe.slug,
      })
      .catch((error: unknown) => {
        logger.error({
          message: INVITATION_MANAGEMENT_PAGE_LOG.resolvePricesFailureMessage,
          error,
          metadata: {
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return null;
      }),
  ]);

  const availablePrices = toAvailablePrices(pricesListing?.prices ?? []);
  const canManagePrices =
    pricesListing?.viewerPermissions.canManagePrices ?? false;

  return (
    <main>
      <TribeInvitationManagement
        availablePrices={availablePrices}
        canManagePrices={canManagePrices}
        invitations={invitations}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
