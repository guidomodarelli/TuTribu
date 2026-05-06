import { notFound } from "next/navigation";

import { TribeMemberList } from "@/components/tribes/tribe-member-list";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_TRIBE_PAGE = {
  resolveMembersFailureMessage: "Failed to resolve tribe members",
  operation: "tribe-tribe-page",
} as const;

const TRIBE_TRIBE_PAGE_LOG_REASON = {
  unexpectedMembersRepositoryError: "unexpected_members_repository_error",
} as const;

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

  const members = await modules.tribes.useCases.listVisibleTribeMembers({
    tribeSlug: tribe.slug,
  }).catch((error: unknown) => {
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

  return (
    <main className={styles.TribeTribePage}>
      <TribeMemberList members={members} />
    </main>
  );
}
