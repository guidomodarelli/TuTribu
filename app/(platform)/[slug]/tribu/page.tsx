import { notFound } from "next/navigation";

import { TribeMemberDirectory } from "@/components/tribes/tribe-member-directory";
import type { TribeMemberSelectionBadge } from "@/components/tribes/tribe-member-list";
import {
  DEFAULT_TRIBE_WELCOME_LINKS_HEADING,
  DEFAULT_TRIBE_WELCOME_MESSAGE,
  DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_DESCRIPTION,
  DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_TITLE,
} from "@/src/modules/tribes/constants/tribe-welcome";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import {
  TRIBE_MEMBER_ROLE,
  isPrivilegedTribeMemberRole,
} from "@/src/modules/tribes/constants/tribe-member-role";
import { ROUTES } from "@/src/constants/routes";
import { resolveVisibleTribePageAccess, type TribeSlugPageProps } from "../tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_TRIBE_PAGE = {
  resolveMemberTribesFailureMessage: "Failed to resolve viewer tribe role",
  resolveMembersFailureMessage: "Failed to resolve tribe members",
  resolveWelcomeFailureMessage: "Failed to resolve tribe welcome",
  resolveWelcomeSelectionsFailureMessage:
    "Failed to resolve tribe welcome selections",
  operation: "tribe-tribe-page",
} as const;

const TRIBE_TRIBE_PAGE_LOG_REASON = {
  unexpectedMemberTribesRepositoryError:
    "unexpected_member_tribes_repository_error",
  unexpectedMembersRepositoryError: "unexpected_members_repository_error",
  unexpectedWelcomeRepositoryError: "unexpected_welcome_repository_error",
  unexpectedWelcomeSelectionsRepositoryError:
    "unexpected_welcome_selections_repository_error",
} as const;

const EMPTY_TRIBE_WELCOME = {
  linksHeading: DEFAULT_TRIBE_WELCOME_LINKS_HEADING,
  links: [],
  rules: [],
  selectionModalBenefit: null,
  selectionModalDescription: DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_DESCRIPTION,
  selectionModalTitle: DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_TITLE,
  welcomeMessage: DEFAULT_TRIBE_WELCOME_MESSAGE,
};

type TribeTribePageAccess = Awaited<ReturnType<typeof resolveVisibleTribePageAccess>>;
type TribeUseCases = TribeTribePageAccess["modules"]["tribes"]["useCases"];
type TribeWelcomeLinks = Pick<Awaited<ReturnType<TribeUseCases["getTribeWelcome"]>>, "links">;
type TribeWelcomeSelections = Awaited<ReturnType<TribeUseCases["listTribeWelcomeSelections"]>>;

type WelcomeBadges = {
  filterOptions: { id: string; label: string }[];
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>;
};

const EMPTY_WELCOME_BADGES: WelcomeBadges = {
  filterOptions: [],
  selectionsByMemberId: {},
};

/**
 * Filter options and per-member badges from the active welcome links: each
 * visible member gets how many times they chose each active link.
 */
function buildWelcomeBadges(
  welcome: TribeWelcomeLinks,
  selections: TribeWelcomeSelections,
  members: readonly { id: string }[]
): WelcomeBadges {
  const activeLinkLabelById = new Map<string, string>();
  welcome.links
    .filter((link) => link.isActive)
    .forEach((link) => {
      activeLinkLabelById.set(link.id, link.badgeLabel);
    });

  const filterOptions = welcome.links
    .filter((link) => link.isActive)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((link) => ({ id: link.id, label: link.badgeLabel }));

  const visibleMemberIds = new Set(members.map((member) => member.id));
  const selectionCountsByMember = new Map<string, Map<string, number>>();
  selections.forEach((selection) => {
    if (!visibleMemberIds.has(selection.userId)) {
      return;
    }

    if (!activeLinkLabelById.has(selection.welcomeLinkId)) {
      return;
    }

    const linkCounts =
      selectionCountsByMember.get(selection.userId) ??
      new Map<string, number>();
    const previousCount = linkCounts.get(selection.welcomeLinkId) ?? 0;

    linkCounts.set(selection.welcomeLinkId, previousCount + 1);
    selectionCountsByMember.set(selection.userId, linkCounts);
  });

  const selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]> = {};
  selectionCountsByMember.forEach((linkCounts, memberId) => {
    selectionsByMemberId[memberId] = Array.from(linkCounts.entries()).map(
      ([welcomeLinkId, count]) => ({
        count,
        id: welcomeLinkId,
        label: activeLinkLabelById.get(welcomeLinkId) ?? "",
      })
    );
  });

  return { filterOptions, selectionsByMemberId };
}

type WelcomeBadgesInput = {
  access: Pick<TribeTribePageAccess, "authenticatedMember" | "logger" | "modules" | "tribe">;
  members: readonly { id: string }[];
  slug: string;
};

/**
 * Reads the welcome and its selections for a manager; a failure to read
 * either is logged and shown as no badges.
 */
async function loadWelcomeBadges({ access, members, slug }: WelcomeBadgesInput): Promise<WelcomeBadges> {
  const { authenticatedMember, logger, modules, tribe } = access;
  const [welcome, selections] = await Promise.all([
    modules.tribes.useCases
      .getTribeWelcome({ tribeSlug: tribe.slug })
      .catch((error: unknown) => {
        logger.error({
          error,
          message: TRIBE_TRIBE_PAGE.resolveWelcomeFailureMessage,
          metadata: {
            reason:
              TRIBE_TRIBE_PAGE_LOG_REASON.unexpectedWelcomeRepositoryError,
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return EMPTY_TRIBE_WELCOME;
      }),
    modules.tribes.useCases
      .listTribeWelcomeSelections({ tribeSlug: tribe.slug })
      .catch((error: unknown) => {
        logger.error({
          error,
          message: TRIBE_TRIBE_PAGE.resolveWelcomeSelectionsFailureMessage,
          metadata: {
            reason:
              TRIBE_TRIBE_PAGE_LOG_REASON.unexpectedWelcomeSelectionsRepositoryError,
            slug,
            viewerId: authenticatedMember.id,
          },
        });

        return [];
      }),
  ]);

  return buildWelcomeBadges(welcome, selections, members);
}

export default async function TribeTribePage({ params }: TribeSlugPageProps) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      callbackPath: ROUTES.tribes.tribe(slug),
      operation: TRIBE_TRIBE_PAGE.operation,
      slug,
    });

  const memberTribes = await modules.tribes.useCases
    .getMemberTribes()
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_TRIBE_PAGE.resolveMemberTribesFailureMessage,
        metadata: {
          reason:
            TRIBE_TRIBE_PAGE_LOG_REASON.unexpectedMemberTribesRepositoryError,
          slug,
          viewerId: authenticatedMember.id,
        },
      });

      return [];
    });

  const viewerMembership = memberTribes.find(
    (tribeListItem) => tribeListItem.slug === tribe.slug
  );
  const viewerRole = (viewerMembership?.role ?? null);
  const isViewerActive =
    viewerMembership?.membershipStatus === TRIBE_MEMBERSHIP_STATUS.active;
  const canManageTribeMembers =
    isViewerActive && isPrivilegedTribeMemberRole(viewerRole);
  const canExportTribeMembers =
    isViewerActive && viewerRole === TRIBE_MEMBER_ROLE.leader;
  const canViewFreeInvitations =
    isViewerActive && viewerRole === TRIBE_MEMBER_ROLE.leader;
  const members = await modules.tribes.useCases
    .listVisibleTribeMembers({
      tribeSlug: tribe.slug,
      viewerCanViewFreeInvitations: canViewFreeInvitations,
      viewerCanViewMemberEmails: canManageTribeMembers,
    })
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_TRIBE_PAGE.resolveMembersFailureMessage,
        metadata: {
          reason: TRIBE_TRIBE_PAGE_LOG_REASON.unexpectedMembersRepositoryError,
          slug,
          viewerId: authenticatedMember.id,
        },
      });
      notFound();
    });

  const { filterOptions, selectionsByMemberId } = canManageTribeMembers
    ? await loadWelcomeBadges({ access: { authenticatedMember, logger, modules, tribe }, members, slug })
    : EMPTY_WELCOME_BADGES;

  return (
    <main className={styles.TribeTribePage}>
      <TribeMemberDirectory
        canExportMembers={canExportTribeMembers}
        canInviteMembers={canManageTribeMembers}
        canViewFreeInvitations={canViewFreeInvitations}
        filterOptions={filterOptions}
        members={members}
        selectionsByMemberId={selectionsByMemberId}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
