import { notFound } from "next/navigation";

import { TribeMemberDirectory } from "@/components/tribes/tribe-member-directory";
import type { TribeMemberSelectionBadge } from "@/components/tribes/tribe-member-list";
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

const TRIBE_INVITE_MANAGER_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const TRIBE_INVITE_MANAGER_ROLES = new Set<string>([
  TRIBE_INVITE_MANAGER_ROLE.guardian,
  TRIBE_INVITE_MANAGER_ROLE.leader,
]);

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

  const [members, welcome, selections, memberTribes] = await Promise.all([
    modules.tribes.useCases
      .listVisibleTribeMembers({ tribeSlug: tribe.slug })
      .catch((error: unknown) => {
        logger.error({
          error,
          message: TRIBE_TRIBE_PAGE.resolveMembersFailureMessage,
          metadata: {
            reason:
              TRIBE_TRIBE_PAGE_LOG_REASON.unexpectedMembersRepositoryError,
            slug,
            viewerId: authenticatedMember.id,
          },
        });
        notFound();
      }),
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

        return { links: [], rules: [], welcomeMessage: "" };
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
    modules.tribes.useCases.getMemberTribes().catch((error: unknown) => {
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
    }),
  ]);

  const viewerMembership = memberTribes.find(
    (tribeListItem) => tribeListItem.slug === tribe.slug
  );
  const canInviteMembers = viewerMembership
    ? TRIBE_INVITE_MANAGER_ROLES.has(viewerMembership.role)
    : false;

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
      selectionCountsByMember.get(selection.userId) ?? new Map<string, number>();
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

  return (
    <main className={styles.TribeTribePage}>
      <TribeMemberDirectory
        canInviteMembers={canInviteMembers}
        filterOptions={filterOptions}
        members={members}
        selectionsByMemberId={selectionsByMemberId}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
