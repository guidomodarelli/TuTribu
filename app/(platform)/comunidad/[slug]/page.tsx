import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { COMMUNITY_PAGE_ACCESS_STATUS } from "@/src/modules/communities/application/results/community-page-access-result";
import { createRequestModules } from "@/src/modules/setup";
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

const COMMUNITY_HOME_COPY = {
  accessLabel: "Acceso",
  actions: [
    {
      description:
        "Prepara recursos, clases y materiales para cuando el espacio de contenido esté disponible.",
      label: "Contenido",
    },
    {
      description:
        "Organiza la conversación y las novedades sin abrir canales hasta tener las reglas listas.",
      label: "Conversación",
    },
    {
      description:
        "Revisa el crecimiento y la participación cuando el módulo de miembros se active.",
      label: "Miembros",
    },
  ],
  communityStatusLabel: "Estado",
  communityStatusValue: "Activa",
  emptyActivity:
    "Todavía no hay actividad para mostrar. Este inicio queda listo para conectar publicaciones, miembros y recursos cuando esos módulos estén disponibles.",
  pathLabel: "Ruta",
  privateVisibilityLabel: "Comunidad privada",
  sections: {
    shortcuts: "Atajos",
    status: "Estado de la comunidad",
    upcomingSpaces: "Próximos espacios",
  },
  shortcuts: [
    "Definir los primeros contenidos",
    "Preparar una bienvenida para nuevos miembros",
    "Revisar permisos antes de publicar",
  ],
  subtitle:
    "Un punto de partida claro para coordinar contenido, miembros y próximas actividades de la comunidad.",
  upcomingSpaces: [
    "Publicaciones y novedades",
    "Recursos compartidos",
    "Gestión de miembros",
  ],
  visibilityDescription:
    "Solo miembros habilitados pueden acceder a este espacio. Los accesos ocultos siguen resolviéndose como página no encontrada.",
  welcomeEyebrow: "Inicio de comunidad",
  welcomeTitle: "Todo listo para empezar a trabajar en este espacio.",
} as const;

const COMMUNITY_HOME_ATTRIBUTES = {
  actionListLabel: "Acciones futuras",
  communityTitleId: "community-title",
  shortcutsTitleId: "shortcuts-title",
  statusTitleId: "community-status-title",
  upcomingSpacesTitleId: "upcoming-spaces-title",
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
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  const accessResult = await modules.communities.useCases.getCommunityPageAccess({
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

  const community = accessResult.community;
  const communityPath = `/comunidad/${community.slug}`;

  return (
    <main className={styles.CommunityPage}>
      <section
        className={styles.CommunityPage__header}
        aria-labelledby={COMMUNITY_HOME_ATTRIBUTES.communityTitleId}
      >
        <div className={styles.CommunityPage__identity}>
          <p className={styles.CommunityPage__eyebrow}>
            {COMMUNITY_HOME_COPY.welcomeEyebrow}
          </p>
          <h1
            className={styles.CommunityPage__title}
            id={COMMUNITY_HOME_ATTRIBUTES.communityTitleId}
          >
            {community.name}
          </h1>
          <p className={styles.CommunityPage__subtitle}>
            {COMMUNITY_HOME_COPY.subtitle}
          </p>
        </div>

        <dl className={styles.CommunityPage__metadata}>
          <div className={styles.CommunityPage__metadataItem}>
            <dt className={styles.CommunityPage__metadataLabel}>
              {COMMUNITY_HOME_COPY.accessLabel}
            </dt>
            <dd className={styles.CommunityPage__metadataValue}>
              {COMMUNITY_HOME_COPY.privateVisibilityLabel}
            </dd>
          </div>
          <div className={styles.CommunityPage__metadataItem}>
            <dt className={styles.CommunityPage__metadataLabel}>
              {COMMUNITY_HOME_COPY.pathLabel}
            </dt>
            <dd className={styles.CommunityPage__metadataValue}>{communityPath}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.CommunityPage__welcome}>
        <div className={styles.CommunityPage__welcomeContent}>
          <p className={styles.CommunityPage__eyebrow}>
            {COMMUNITY_HOME_COPY.welcomeEyebrow}
          </p>
          <h2 className={styles.CommunityPage__sectionTitle}>
            {COMMUNITY_HOME_COPY.welcomeTitle}
          </h2>
          <p className={styles.CommunityPage__bodyText}>
            {COMMUNITY_HOME_COPY.emptyActivity}
          </p>
        </div>
        <ul
          className={styles.CommunityPage__actionList}
          aria-label={COMMUNITY_HOME_ATTRIBUTES.actionListLabel}
        >
          {COMMUNITY_HOME_COPY.actions.map((action) => (
            <li className={styles.CommunityPage__actionItem} key={action.label}>
              <span className={styles.CommunityPage__actionLabel}>{action.label}</span>
              <span className={styles.CommunityPage__actionDescription}>
                {action.description}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.CommunityPage__details}>
        <section
          className={styles.CommunityPage__detailSection}
          aria-labelledby={COMMUNITY_HOME_ATTRIBUTES.upcomingSpacesTitleId}
        >
          <h2
            className={styles.CommunityPage__sectionTitle}
            id={COMMUNITY_HOME_ATTRIBUTES.upcomingSpacesTitleId}
          >
            {COMMUNITY_HOME_COPY.sections.upcomingSpaces}
          </h2>
          <ul className={styles.CommunityPage__list}>
            {COMMUNITY_HOME_COPY.upcomingSpaces.map((space) => (
              <li className={styles.CommunityPage__listItem} key={space}>
                {space}
              </li>
            ))}
          </ul>
        </section>

        <section
          className={styles.CommunityPage__detailSection}
          aria-labelledby={COMMUNITY_HOME_ATTRIBUTES.statusTitleId}
        >
          <h2
            className={styles.CommunityPage__sectionTitle}
            id={COMMUNITY_HOME_ATTRIBUTES.statusTitleId}
          >
            {COMMUNITY_HOME_COPY.sections.status}
          </h2>
          <dl className={styles.CommunityPage__statusList}>
            <div className={styles.CommunityPage__statusItem}>
              <dt className={styles.CommunityPage__metadataLabel}>
                {COMMUNITY_HOME_COPY.communityStatusLabel}
              </dt>
              <dd className={styles.CommunityPage__metadataValue}>
                {COMMUNITY_HOME_COPY.communityStatusValue}
              </dd>
            </div>
            <div className={styles.CommunityPage__statusItem}>
              <dt className={styles.CommunityPage__metadataLabel}>
                {COMMUNITY_HOME_COPY.accessLabel}
              </dt>
              <dd className={styles.CommunityPage__metadataValue}>
                {COMMUNITY_HOME_COPY.privateVisibilityLabel}
              </dd>
            </div>
          </dl>
          <p className={styles.CommunityPage__bodyText}>
            {COMMUNITY_HOME_COPY.visibilityDescription}
          </p>
        </section>

        <section
          className={styles.CommunityPage__detailSection}
          aria-labelledby={COMMUNITY_HOME_ATTRIBUTES.shortcutsTitleId}
        >
          <h2
            className={styles.CommunityPage__sectionTitle}
            id={COMMUNITY_HOME_ATTRIBUTES.shortcutsTitleId}
          >
            {COMMUNITY_HOME_COPY.sections.shortcuts}
          </h2>
          <ul className={styles.CommunityPage__list}>
            {COMMUNITY_HOME_COPY.shortcuts.map((shortcut) => (
              <li className={styles.CommunityPage__listItem} key={shortcut}>
                {shortcut}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
