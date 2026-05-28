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
import type { TribeMemberRole } from "@/src/modules/tribes/application/results/tribe-member-result";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";
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

export default async function TribeTribePage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
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
  const viewerRole = (viewerMembership?.role ?? null) as TribeMemberRole | null;
  const isViewerActive =
    viewerMembership?.membershipStatus === TRIBE_MEMBERSHIP_STATUS.active;
  const canManageTribeMembers =
    isViewerActive && isPrivilegedTribeMemberRole(viewerRole);
  const canExportTribeMembers =
    isViewerActive && viewerRole === TRIBE_MEMBER_ROLE.leader;
  const members = await modules.tribes.useCases
    .listVisibleTribeMembers({
      tribeSlug: tribe.slug,
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

  let filterOptions: { id: string; label: string }[] = [];
  let selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]> = {};

  if (canManageTribeMembers) {
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
    const activeLinkLabelById = new Map<string, string>();
    welcome.links
      .filter((link) => link.isActive)
      .forEach((link) => {
        activeLinkLabelById.set(link.id, link.badgeLabel);
      });

    filterOptions = welcome.links
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

    selectionsByMemberId = {};
    selectionCountsByMember.forEach((linkCounts, memberId) => {
      selectionsByMemberId[memberId] = Array.from(linkCounts.entries()).map(
        ([welcomeLinkId, count]) => ({
          count,
          id: welcomeLinkId,
          label: activeLinkLabelById.get(welcomeLinkId) ?? "",
        })
      );
    });
  }

  return (
    <main className={styles.TribeTribePage}>
      <TribeMemberDirectory
        canExportMembers={canExportTribeMembers}
        canInviteMembers={canManageTribeMembers}
        filterOptions={filterOptions}
        members={members}
        selectionsByMemberId={selectionsByMemberId}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
