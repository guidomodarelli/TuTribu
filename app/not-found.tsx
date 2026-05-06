import { headers } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";
import { ROUTES } from "@/src/constants/routes";
import { createRequestAuthModule } from "@/src/modules/auth/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import styles from "./not-found.module.scss";

const NOT_FOUND_UI = {
  ariaHidden: "true",
  buttonSize: "lg",
  outlineVariant: "outline",
  backdropTestId: "not-found-backdrop",
} as const;
const NOT_FOUND_PAGE_LOG = {
  feature: "app",
  operation: "not-found-page",
  resolveSessionFailureMessage: "Failed to resolve session for not found page",
} as const;

async function resolveAuthenticatedMemberForNotFoundPage(
  logger: ReturnType<typeof createServerLogger>
) {
  try {
    return await createRequestAuthModule().useCases.getAuthenticatedMember();
  } catch (error) {
    logger.error({
      message: NOT_FOUND_PAGE_LOG.resolveSessionFailureMessage,
      error,
    });

    return null;
  }
}

export default async function NotFoundPage() {
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: NOT_FOUND_PAGE_LOG.feature,
    operation: NOT_FOUND_PAGE_LOG.operation,
    requestId,
  });
  const authenticatedMember =
    await resolveAuthenticatedMemberForNotFoundPage(logger);

  return (
    <main className={styles.NotFoundPage}>
      <div
        className={styles.NotFoundPage__backdrop}
        data-testid={NOT_FOUND_UI.backdropTestId}
        aria-hidden={NOT_FOUND_UI.ariaHidden}
      />
      <p className={styles.NotFoundPage__eyebrow}>Error 404</p>
      <h1 className={styles.NotFoundPage__title}>
        Esta pagina no existe o ya no esta disponible
      </h1>
      <p className={styles.NotFoundPage__description}>
        Revisa la URL o vuelve a un punto conocido para seguir navegando dentro
        de {siteConfig.name}.
      </p>
      <div className={styles.NotFoundPage__actions}>
        <Button asChild size={NOT_FOUND_UI.buttonSize}>
          <Link href={ROUTES.home}>Volver al inicio</Link>
        </Button>
        {!authenticatedMember ? (
          <Button
            asChild
            size={NOT_FOUND_UI.buttonSize}
            variant={NOT_FOUND_UI.outlineVariant}
          >
            <Link href={ROUTES.auth.signIn}>Iniciar sesion</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
