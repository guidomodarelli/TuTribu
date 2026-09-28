import { notFound, redirect } from "next/navigation";

import { AcademyHome } from "@/components/academy/academy-home";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { ROUTES } from "@/src/constants/routes";
import {
  toAcademyAccessStatusDto,
  toAcademyOfferDto,
} from "@/src/modules/product-access/application/results/academy-dto-mappers";
import {
  academyAccessStatusDtoSchema,
  academyOfferDtoSchema,
  type AcademyAccessStatusDto,
  type AcademyOfferDto,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { resolveTribePageAccess } from "../tribe-page-access";

const ACADEMY_PAGE = {
  failureMessage: "Failed to resolve academy page",
  operation: "tribe-academy-page",
  preapprovalQueryParam: "preapproval_id",
} as const;

type RequestModules = Awaited<ReturnType<typeof resolveTribePageAccess>>["modules"];

type AcademyPageData = {
  access: AcademyAccessStatusDto | null;
  canManage: boolean;
  offer: AcademyOfferDto | null;
};

/**
 * Loads the offer and, for members, the own status and management role.
 * Returns null when the page must not be shown (legacy tribe for a
 * non-leader, or no academy offer for a visitor).
 */
async function loadAcademyPageData(
  modules: RequestModules,
  slug: string,
  isMember: boolean,
  readsOwnStatus: boolean
): Promise<AcademyPageData | null> {
  const [offer, ownAccess, memberTribes] = await Promise.all([
    modules.productAccess.useCases.getAcademyPublicOffer({ tribeSlug: slug }),
    readsOwnStatus
      ? modules.productAccess.useCases.getOwnAcademyAccess({ tribeSlug: slug })
      : Promise.resolve(null),
    isMember ? modules.tribes.useCases.getMemberTribes() : Promise.resolve([]),
  ]);
  const membership = memberTribes.find((tribe) => tribe.slug === slug);
  const isActive = membership?.membershipStatus === TRIBE_MEMBERSHIP_STATUS.active;
  const isActiveLeader = isActive && membership?.role === TRIBE_MEMBER_ROLE.leader;
  const canManage =
    isActive &&
    (membership?.role === TRIBE_MEMBER_ROLE.leader || membership?.role === TRIBE_MEMBER_ROLE.guardian);

  // Legacy tribes (no academy offer): only the active leader sees the setup hint.
  if (!offer && !isActiveLeader) {
    return null;
  }

  return {
    access:
      ownAccess && ownAccess.status === "ok"
        ? academyAccessStatusDtoSchema.parse(
            toAcademyAccessStatusDto(ownAccess.access, ownAccess.accessModel)
          )
        : null,
    canManage,
    offer: offer ? academyOfferDtoSchema.parse(toAcademyOfferDto(offer)) : null,
  };
}

/**
 * Academy home: offer and personal steps for members (including basic ones
 * without community access), and the public offer for signed-in visitors of
 * an academy-mode tribe. The private tribe row is never exposed to visitors.
 */
export default async function TribeAcademyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const access = await resolveTribePageAccess({
    allowWithoutCommunityAccess: true,
    operation: ACADEMY_PAGE.operation,
    slug,
  }).catch(() => notFound());
  const { authenticatedMember, logger, modules, result } = access;

  if (!authenticatedMember) {
    redirect(buildSignInRedirectUrl(ROUTES.tribes.academy(slug)));
  }

  const isMember = result.status === TRIBE_PAGE_ACCESS_STATUS.visible;
  // Blocked or removed members never consume content, but they must still be
  // able to see and cancel their own academy renewal (billing stays reachable).
  const isBlockedMember =
    !isMember && result.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden;

  if (
    !isMember &&
    !isBlockedMember &&
    result.reason !== TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible
  ) {
    notFound();
  }

  const data = await loadAcademyPageData(
    modules,
    slug,
    isMember,
    isMember || isBlockedMember
  ).catch((error: unknown) => {
    logger.error({
      error,
      message: ACADEMY_PAGE.failureMessage,
      metadata: { slug, viewerId: authenticatedMember.id },
    });

    return null;
  });

  if (!data) {
    notFound();
  }

  return (
    <AcademyHome
      access={data.access}
      canManage={data.canManage}
      isCheckoutReturn={Boolean(resolvedSearchParams[ACADEMY_PAGE.preapprovalQueryParam])}
      offer={data.offer}
      tribeSlug={slug}
    />
  );
}
