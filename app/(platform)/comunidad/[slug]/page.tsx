import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createAuthModule } from "@/src/modules/auth/setup";
import { COMMUNITY_PAGE_ACCESS_STATUS } from "@/src/modules/communities/application/results/community-page-access-result";
import { createGetCommunityPageAccessUseCase } from "@/src/modules/communities/infrastructure/composition/create-get-community-page-access-use-case";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import styles from "./page.module.scss";

const COMMUNITY_PAGE_LOG_REASON = {
  unexpectedRepositoryError: "unexpected_repository_error",
} as const;

const COMMUNITY_PAGE_LOG = {
  feature: "communities",
  hiddenAccessMessage: "Community access hidden",
  operation: "community-page",
  resolveAccessFailureMessage: "Failed to resolve community access",
} as const;

export default async function CommunityPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: COMMUNITY_PAGE_LOG.feature,
    operation: COMMUNITY_PAGE_LOG.operation,
    requestId,
  });
  const authenticatedMember = await createAuthModule().useCases.getAuthenticatedMember();

  const accessResult = await createGetCommunityPageAccessUseCase()
    .execute({
      isAuthenticated: Boolean(authenticatedMember),
      slug,
    })
    .catch((error: unknown) => {
      logger.error({
        message: COMMUNITY_PAGE_LOG.resolveAccessFailureMessage,
        error,
        metadata: {
          reason: COMMUNITY_PAGE_LOG_REASON.unexpectedRepositoryError,
          slug,
          viewerId: authenticatedMember?.id ?? null,
        },
      });
      notFound();
    });

  if (accessResult.status === COMMUNITY_PAGE_ACCESS_STATUS.hidden) {
    logger.info({
      message: COMMUNITY_PAGE_LOG.hiddenAccessMessage,
      metadata: {
        reason: accessResult.reason,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });

    notFound();
  }

  const { community } = accessResult;

  return (
    <main className={styles.CommunityPage}>
      <Card className={styles.CommunityPage__card}>
        <CardHeader className={styles.CommunityPage__header}>
          <p className={styles.CommunityPage__eyebrow}>Tu comunidad</p>
          <h1 className={styles.CommunityPage__title}>{community.name}</h1>
        </CardHeader>
        <CardContent className={styles.CommunityPage__content}>
          <p className={styles.CommunityPage__badge}>Comunidad privada</p>
          <p className={styles.CommunityPage__description}>
            La comunidad ya existe y este espacio sera la base para sumar
            configuracion, miembros y contenido.
          </p>
          <p className={styles.CommunityPage__path}>
            /comunidad/{community.slug}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
