import { notFound } from "next/navigation";

import { TribeWelcomeManagement } from "@/components/tribes/tribe-welcome-management";
import { TribeWelcomeSelectionModal } from "@/components/tribes/tribe-welcome-selection-modal";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { ROUTES } from "@/src/constants/routes";
import { resolveVisibleTribePageAccess, type TribeSlugPageProps } from "../tribe-page-access";
import { findCurrentTribeMembership } from "../tribe-manager-page-access";
import styles from "./page.module.scss";

const TRIBE_WELCOME_PAGE = {
  operation: "tribe-welcome-page",
  resolveWelcomeFailureMessage: "Failed to resolve tribe welcome",
  resolveWelcomeSelectionsFailureMessage:
    "Failed to resolve tribe welcome selections",
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

type TribeWelcomePageAccess = Awaited<ReturnType<typeof resolveVisibleTribePageAccess>>;

/**
 * Welcome links the viewer already chose; `null` when they could not be read,
 * so the selection modal stays closed.
 */
async function loadViewerSelections(
  { authenticatedMember, logger, modules, tribe }: Pick<
    TribeWelcomePageAccess,
    "authenticatedMember" | "logger" | "modules" | "tribe"
  >,
  slug: string
) {
  return modules.tribes.useCases
    .listCurrentMemberTribeWelcomeSelections({
      tribeSlug: tribe.slug,
    })
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_WELCOME_PAGE.resolveWelcomeSelectionsFailureMessage,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });

      return null;
    })
    .then((selections) => selections ?? null);
}

export default async function TribeWelcomePage({ params }: TribeSlugPageProps) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      // Onboarding (welcome rules and the external WhatsApp group) is part of
      // the academy free allowlist.
      allowWithoutCommunityAccess: true,
      callbackPath: ROUTES.tribes.welcome(slug),
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

  const currentMembership = await findCurrentTribeMembership(modules, tribe.slug);
  const canEdit =
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active &&
    currentMembership?.role === TRIBE_WELCOME_EDITOR_ROLE.leader;
  const canRecordWelcomeSelection =
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active;
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
  const hasActiveWelcomeLinks = welcome.links.some((link) => link.isActive);
  const shouldResolveViewerSelections =
    canRecordWelcomeSelection && !canEdit && hasActiveWelcomeLinks;
  const viewerSelections = shouldResolveViewerSelections
    ? await loadViewerSelections({ authenticatedMember, logger, modules, tribe }, slug)
    : null;
  const viewerSelectionsAreUnavailable = viewerSelections === null;
  const shouldOpenSelectionModal =
    shouldResolveViewerSelections &&
    !viewerSelectionsAreUnavailable;

  return (
    <main className={styles.TribeWelcomePage}>
      <TribeWelcomeManagement
        canEdit={canEdit}
        canRecordSelections={canRecordWelcomeSelection}
        tribeSlug={tribe.slug}
        welcome={welcome}
      />
      <TribeWelcomeSelectionModal
        benefit={welcome.selectionModalBenefit}
        description={welcome.selectionModalDescription}
        links={welcome.links}
        open={shouldOpenSelectionModal}
        title={welcome.selectionModalTitle}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
