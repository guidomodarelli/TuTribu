import { notFound } from "next/navigation";

import { TribeRound } from "@/components/tribe-round/tribe-round";
import { resolveVisibleTribePageAccess } from "./tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_PAGE_LOG_REASON = {
  unexpectedRoundRepositoryError: "unexpected_round_repository_error",
} as const;

const TRIBE_PAGE_LOG = {
  operation: "tribe-page",
  resolveRoundFailureMessage: "Failed to resolve tribe round",
} as const;

export default async function TribePage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_PAGE_LOG.operation,
      slug,
    });

  const round = await modules.messages.useCases.listTribeRound({
    tribeSlug: tribe.slug,
    viewerId: authenticatedMember.id,
  }).catch((error: unknown) => {
    logger.error({
      message: TRIBE_PAGE_LOG.resolveRoundFailureMessage,
      error,
      metadata: {
        reason: TRIBE_PAGE_LOG_REASON.unexpectedRoundRepositoryError,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });
    notFound();
  });

  return (
    <main className={styles.TribePage}>
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug={tribe.slug}
        round={round}
      />
    </main>
  );
}
