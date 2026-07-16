import { notFound } from "next/navigation";

import { TribeStoryAbout } from "@/components/tribes/tribe-story-about";
import { TribeStoryManagement } from "@/components/tribes/tribe-story-management";
import { ROUTES } from "@/src/constants/routes";
import { TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveTribePageAccess } from "../tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_STORY_PAGE = {
  operation: "tribe-story-page",
  resolveOfferFailureMessage: "Failed to resolve tribe story join offer",
  resolveStoryFailureMessage: "Failed to resolve tribe story",
} as const;

/**
 * Blocked reasons that still allow the visitor offer view, mirroring the
 * open-join recovery rules of the tribe home page: payment-related blocks can
 * re-subscribe, conduct blocks stay hidden.
 */
const STORY_OFFER_BLOCKED_REASONS = new Set<string>([
  TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked,
  TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive,
]);

function canReadTribeStory(membershipStatus: string | null): boolean {
  return (
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active ||
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.muted
  );
}

export default async function TribeHistoryPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const access = await resolveTribePageAccess({
    operation: TRIBE_STORY_PAGE.operation,
    slug,
  }).catch(() => {
    notFound();
  });

  if (!access) {
    notFound();
  }

  const { authenticatedMember, logger, modules, result } = access;

  if (!authenticatedMember) {
    notFound();
  }

  if (result.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
    const canRecoverViaOpenJoin =
      result.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden &&
      STORY_OFFER_BLOCKED_REASONS.has(result.blockedReason);
    const isOfferCandidate =
      result.reason === TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible ||
      canRecoverViaOpenJoin;

    if (!isOfferCandidate) {
      notFound();
    }

    const offer = await modules.subscriptions.useCases
      .getTribeCurrentSubscriptionOffer({ tribeSlug: slug })
      .catch((error: unknown) => {
        logger.error({
          error,
          message: TRIBE_STORY_PAGE.resolveOfferFailureMessage,
          metadata: {
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return null;
      });

    if (
      !offer ||
      offer.status !== TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.available
    ) {
      notFound();
    }

    const [story, stats] = await Promise.all([
      modules.tribes.useCases.getTribeStory({ tribeSlug: slug }),
      modules.tribes.useCases.getTribeStoryStats({ tribeSlug: slug }),
    ]).catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_STORY_PAGE.resolveStoryFailureMessage,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });
      notFound();
    });

    if (!stats) {
      notFound();
    }

    return (
      <main className={styles.TribeStoryPage}>
        <TribeStoryAbout
          joinHref={ROUTES.tribes.bySlug(slug)}
          offerPrice={{
            amountCents: offer.price.amountCents,
            currency: offer.price.currency,
          }}
          stats={stats}
          story={story}
          tribeName={stats.name}
        />
      </main>
    );
  }

  const tribe = result.tribe;
  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(tribe.slug);

  if (!canReadTribeStory(membershipStatus)) {
    notFound();
  }

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);
  const canEdit =
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active &&
    currentMembership?.role === TRIBE_MEMBER_ROLE.leader;
  const [story, stats] = await Promise.all([
    modules.tribes.useCases.getTribeStory({ tribeSlug: tribe.slug }),
    modules.tribes.useCases.getTribeStoryStats({ tribeSlug: tribe.slug }),
  ]).catch((error: unknown) => {
    logger.error({
      error,
      message: TRIBE_STORY_PAGE.resolveStoryFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });
    notFound();
  });

  return (
    <main className={styles.TribeStoryPage}>
      {canEdit ? (
        <TribeStoryManagement story={story} tribeSlug={tribe.slug} />
      ) : (
        <TribeStoryAbout
          offerPrice={null}
          stats={stats}
          story={story}
          tribeName={tribe.name}
        />
      )}
    </main>
  );
}
