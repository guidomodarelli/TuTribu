import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CommunityCreationBlocked } from "@/components/communities/community-creation-blocked";
import { CreateCommunityForm } from "@/components/communities/create-community-form";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import {
  CREATE_COMMUNITY_ERROR_CODE,
  CREATE_COMMUNITY_ERROR_MESSAGE,
  CREATE_COMMUNITY_STATUS,
} from "@/src/modules/communities/application/results/create-community-result";
import { getContactEmail } from "@/src/modules/communities/infrastructure/config/community-creation-contact-email";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import styles from "./page.module.scss";

const AUTH_CALLBACK_URL_SEARCH_PARAM = new URLSearchParams({
  [QUERY_PARAMS.auth.callbackUrl]: ROUTES.communities.create,
});
const CREATE_COMMUNITY_PAGE_LOG = {
  feature: "communities",
  operation: "create-community-page",
  resolveEligibilityFailureMessage: "Failed to resolve community creation eligibility",
  resolveSessionFailureMessage: "Failed to resolve session for community creation page",
} as const;
const URL_QUERY_SEPARATOR = "?";

type CreateCommunitySearchParams = {
  [key: string]: string | string[] | undefined;
};

function readFirstSearchParamValue(
  searchParamValue: string | string[] | undefined
): string | null {
  if (typeof searchParamValue === "string") {
    return searchParamValue;
  }

  if (Array.isArray(searchParamValue)) {
    const firstStringValue = searchParamValue.find((value) => value.trim().length > 0);

    return firstStringValue ?? null;
  }

  return null;
}

function resolveErrorMessage(errorCode: string | null): string | null {
  switch (errorCode) {
    case CREATE_COMMUNITY_STATUS.invalidName:
      return CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.invalidName];
    case CREATE_COMMUNITY_STATUS.invalidSlug:
      return CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.invalidSlug];
    case CREATE_COMMUNITY_STATUS.slugConflict:
      return CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.slugConflict];
    case CREATE_COMMUNITY_STATUS.notAllowed:
      return CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.notAllowed];
    case CREATE_COMMUNITY_ERROR_CODE.unexpected:
      return CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_ERROR_CODE.unexpected];
    default:
      return null;
  }
}

export default async function CreateCommunityPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<CreateCommunitySearchParams>;
}) {
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: CREATE_COMMUNITY_PAGE_LOG.feature,
    operation: CREATE_COMMUNITY_PAGE_LOG.operation,
    requestId,
  });
  const logSessionResolutionFailure = (error: unknown) => {
    logger.error({
      message: CREATE_COMMUNITY_PAGE_LOG.resolveSessionFailureMessage,
      error,
    });

    throw error;
  };
  const modules = await createRequestModules().catch(logSessionResolutionFailure);
  const authenticatedMember = await modules.auth.useCases
    .getAuthenticatedMember()
    .catch(logSessionResolutionFailure);

  if (!authenticatedMember) {
    redirect(
      ROUTES.auth.signIn +
        URL_QUERY_SEPARATOR +
        AUTH_CALLBACK_URL_SEARCH_PARAM.toString()
    );
  }

  const eligibility = await modules.communities.useCases
    .getCommunityCreationEligibility({
      creatorEmail: authenticatedMember.email,
    })
    .catch((error: unknown) => {
      logger.error({
        message: CREATE_COMMUNITY_PAGE_LOG.resolveEligibilityFailureMessage,
        error,
        metadata: {
          creatorId: authenticatedMember.id,
        },
      });

      throw error;
    });
  const resolvedSearchParams = await searchParams;
  const contactEmail = getContactEmail();

  if (!eligibility.canCreate) {
    return (
      <main className={styles.CreateCommunityPage}>
        <CommunityCreationBlocked contactEmail={contactEmail} />
      </main>
    );
  }

  return (
    <main className={styles.CreateCommunityPage}>
      <section className={styles.CreateCommunityPage__panel}>
        <header className={styles.CreateCommunityPage__header}>
          <p className={styles.CreateCommunityPage__eyebrow}>Nueva tribu</p>
          <h1 className={styles.CreateCommunityPage__title}>Crear una tribu</h1>
          <p className={styles.CreateCommunityPage__description}>
            Define el nombre y el slug inicial. La tribu se creara como privada
            y tu cuenta quedara como owner desde el primer momento.
          </p>
        </header>
        <div className={styles.CreateCommunityPage__content}>
          <CreateCommunityForm
            errorMessage={resolveErrorMessage(
              readFirstSearchParamValue(
                resolvedSearchParams[QUERY_PARAMS.communities.error]
              )
            )}
            initialName={
              readFirstSearchParamValue(resolvedSearchParams[QUERY_PARAMS.communities.name]) ??
              ""
            }
            initialSlug={
              readFirstSearchParamValue(resolvedSearchParams[QUERY_PARAMS.communities.slug]) ??
              ""
            }
            submitPath={ROUTES.api.communities}
            suggestedSlug={readFirstSearchParamValue(
              resolvedSearchParams[QUERY_PARAMS.communities.suggestedSlug]
            )}
          />
        </div>
      </section>
    </main>
  );
}
