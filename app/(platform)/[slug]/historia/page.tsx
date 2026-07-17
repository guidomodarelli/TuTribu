import { notFound, redirect } from "next/navigation";

import { TribeStoryAbout } from "@/components/tribes/tribe-story-about";
import { TribeStoryManagement } from "@/components/tribes/tribe-story-management";
import { buildStoryPlainTextExcerpt } from "@/lib/rich-text/story-markdown";
import { createRequestModules } from "@/src/modules/setup";
import { getCachedPublicTribeStoryAbout } from "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_FREE_JOIN_STATUS } from "@/src/modules/tribes/constants/tribe-story";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/constants/tribe-page-access";
import type { Metadata } from "next";
import { resolveTribePageAccess } from "../tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_STORY_PAGE = {
  metadataDescriptionMaxLength: 160,
  metadataTitleSuffix: "Historia",
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

function buildStorySignInRedirect(slug: string): string {
  const signInSearchParams = new URLSearchParams({
    [QUERY_PARAMS.auth.callbackUrl]: ROUTES.tribes.history(slug),
  });

  return `${ROUTES.auth.signIn}?${signInSearchParams.toString()}`;
}

/**
 * SEO metadata for the public tribe about page. The RLS-backed definer reads
 * only return data when the viewer (including an anonymous visitor) is allowed
 * to see the about, so a hidden tribe falls back to the generic title.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    // Crawlers and shares are anonymous: the cached anonymous snapshot answers
    // them without per-request queries, and it is exactly the public RLS view.
    const { stats, story } = await getCachedPublicTribeStoryAbout(slug);

    if (!stats) {
      return { title: TRIBE_STORY_PAGE.metadataTitleSuffix };
    }

    const title = `${stats.name} — ${TRIBE_STORY_PAGE.metadataTitleSuffix}`;
    const description = story
      ? buildStoryPlainTextExcerpt(
          story.content,
          TRIBE_STORY_PAGE.metadataDescriptionMaxLength
        )
      : undefined;
    const openGraphImage =
      story?.coverUrl ??
      story?.logoUrl ??
      story?.media.find((mediaItem) => mediaItem.url)?.url ??
      undefined;

    return {
      description,
      openGraph: {
        description,
        images: openGraphImage ? [{ url: openGraphImage }] : undefined,
        title,
      },
      title,
    };
  } catch {
    // Metadata is best-effort: a data failure must not break the page render.
    return { title: TRIBE_STORY_PAGE.metadataTitleSuffix };
  }
}

async function joinTribeFreeAction({ slug }: { slug: string }) {
  "use server";

  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    redirect(buildStorySignInRedirect(slug));
  }

  const result = await modules.tribes.useCases
    .joinTribeFree({ tribeSlug: slug })
    .catch(() => ({ status: TRIBE_FREE_JOIN_STATUS.forbidden }));

  if (
    result.status === TRIBE_FREE_JOIN_STATUS.joined ||
    result.status === TRIBE_FREE_JOIN_STATUS.alreadyMember
  ) {
    redirect(ROUTES.tribes.bySlug(slug));
  }

  redirect(ROUTES.tribes.history(slug));
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

  if (result.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
    const canRecoverViaOpenJoin =
      result.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden &&
      STORY_OFFER_BLOCKED_REASONS.has(result.blockedReason);
    const isOfferCandidate =
      result.reason === TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible ||
      result.reason === TRIBE_PAGE_ACCESS_REASON.unauthenticatedHidden ||
      canRecoverViaOpenJoin;

    if (!isOfferCandidate) {
      notFound();
    }

    const isAnonymousVisitor = !authenticatedMember;
    const [story, stats] = await (isAnonymousVisitor
      ? getCachedPublicTribeStoryAbout(slug).then(
          (snapshot) => [snapshot.story, snapshot.stats] as const
        )
      : Promise.all([
          modules.tribes.useCases.getTribeStory({ tribeSlug: slug }),
          modules.tribes.useCases.getTribeStoryStats({ tribeSlug: slug }),
        ])
    ).catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_STORY_PAGE.resolveStoryFailureMessage,
        metadata: {
          slug,
          viewerId: authenticatedMember?.id ?? null,
        },
      });
      notFound();
    });

    // The definer reads only return rows when the visitor may see the about
    // (member, live paid offer, or free open join). No stats means hidden.
    if (!stats) {
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
            viewerId: authenticatedMember?.id ?? null,
          },
        });

        return null;
      });
    const offerPrice =
      offer &&
      offer.status === TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.available
        ? {
            amountCents: offer.price.amountCents,
            currency: offer.price.currency,
          }
        : null;

    if (!offerPrice && !stats.openFreeJoinAvailable) {
      notFound();
    }

    const freeJoinAction =
      !isAnonymousVisitor && stats.openFreeJoinAvailable
        ? joinTribeFreeAction.bind(null, { slug })
        : undefined;
    const joinHref = isAnonymousVisitor
      ? buildStorySignInRedirect(slug)
      : ROUTES.tribes.bySlug(slug);

    return (
      <main className={styles.TribeStoryPage}>
        <TribeStoryAbout
          freeJoinAction={freeJoinAction}
          joinHref={freeJoinAction ? undefined : joinHref}
          offerPrice={offerPrice}
          stats={stats}
          story={story}
          tribeName={stats.name}
        />
      </main>
    );
  }

  if (!authenticatedMember) {
    notFound();
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
  const [story, stats, onlineMembers] = await Promise.all([
    modules.tribes.useCases.getTribeStory({ tribeSlug: tribe.slug }),
    modules.tribes.useCases.getTribeStoryStats({ tribeSlug: tribe.slug }),
    modules.tribes.useCases.getTribeStoryOnlineMembers({
      tribeSlug: tribe.slug,
    }),
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
        <TribeStoryManagement
          openFreeJoinEnabled={stats?.openFreeJoinEnabled ?? false}
          story={story}
          tribeSlug={tribe.slug}
        />
      ) : (
        <TribeStoryAbout
          offerPrice={null}
          onlineMembers={onlineMembers}
          stats={stats}
          story={story}
          tribeName={tribe.name}
        />
      )}
    </main>
  );
}
