import { notFound } from "next/navigation";

import { TribeWelcomeManagement } from "@/components/tribes/tribe-welcome-management";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_WELCOME_PAGE = {
  operation: "tribe-welcome-page",
  resolveWelcomeFailureMessage: "Failed to resolve tribe welcome",
} as const;

const TRIBE_WELCOME_EDITOR_ROLE = {
  leader: "leader",
} as const;

function canReadTribeWelcome(membershipStatus: string | null): boolean {
  return (
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active ||
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.muted
  );
}

export default async function TribeWelcomePage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_WELCOME_PAGE.operation,
      slug,
    });
  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(
      tribe.slug
    );

  if (!canReadTribeWelcome(membershipStatus)) {
    notFound();
  }

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);
  const canEdit =
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active &&
    currentMembership?.role === TRIBE_WELCOME_EDITOR_ROLE.leader;
  const welcomeUseCase = canEdit
    ? modules.tribes.useCases.getEditableTribeWelcome
    : modules.tribes.useCases.getTribeWelcome;
  const welcome = await welcomeUseCase({
      tribeSlug: tribe.slug,
    })
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_WELCOME_PAGE.resolveWelcomeFailureMessage,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });
      notFound();
    });

  return (
    <main className={styles.TribeWelcomePage}>
      <TribeWelcomeManagement
        canEdit={canEdit}
        tribeSlug={tribe.slug}
        welcome={welcome}
      />
    </main>
  );
}
