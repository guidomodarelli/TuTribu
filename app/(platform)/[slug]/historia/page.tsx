import { notFound } from "next/navigation";

import { TribeStoryManagement } from "@/components/tribes/tribe-story-management";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_STORY_PAGE = {
  operation: "tribe-story-page",
  resolveStoryFailureMessage: "Failed to resolve tribe story",
} as const;

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
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_STORY_PAGE.operation,
      slug,
    });
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
  const story = await modules.tribes.useCases
    .getTribeStory({
      tribeSlug: tribe.slug,
    })
    .catch((error: unknown) => {
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
      <TribeStoryManagement
        canEdit={canEdit}
        story={story}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
