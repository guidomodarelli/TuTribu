import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TribeCreationBlocked } from "@/components/tribes/tribe-creation-blocked";
import { CreateTribeForm } from "@/components/tribes/create-tribe-form";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import {
  CREATE_TRIBE_ERROR_CODE,
  CREATE_TRIBE_ERROR_MESSAGE,
  CREATE_TRIBE_STATUS,
} from "@/src/modules/tribes/application/results/create-tribe-result";
import { getContactEmail } from "@/src/modules/tribes/infrastructure/config/tribe-creation-contact-email";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import styles from "./page.module.scss";

const AUTH_CALLBACK_URL_SEARCH_PARAM = new URLSearchParams({
  [QUERY_PARAMS.auth.callbackUrl]: ROUTES.tribes.create,
});
const CREATE_TRIBE_PAGE_LOG = {
  feature: "tribes",
  operation: "create-tribe-page",
  resolveEligibilityFailureMessage: "Failed to resolve tribe creation eligibility",
  resolveSessionFailureMessage: "Failed to resolve session for tribe creation page",
} as const;
const URL_QUERY_SEPARATOR = "?";

type CreateTribeSearchParams = {
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
    case CREATE_TRIBE_STATUS.invalidName:
      return CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.invalidName];
    case CREATE_TRIBE_STATUS.invalidSlug:
      return CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.invalidSlug];
    case CREATE_TRIBE_STATUS.slugConflict:
      return CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.slugConflict];
    case CREATE_TRIBE_STATUS.notAllowed:
      return CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.notAllowed];
    case CREATE_TRIBE_ERROR_CODE.unexpected:
      return CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_ERROR_CODE.unexpected];
    default:
      return null;
  }
}

export default async function CreateTribePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<CreateTribeSearchParams>;
}) {
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const logger = createServerLogger({
    feature: CREATE_TRIBE_PAGE_LOG.feature,
    operation: CREATE_TRIBE_PAGE_LOG.operation,
    requestId,
  });
  const logSessionResolutionFailure = (error: unknown) => {
    logger.error({
      message: CREATE_TRIBE_PAGE_LOG.resolveSessionFailureMessage,
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

  const [eligibility, resolvedSearchParams] = await Promise.all([
    modules.tribes.useCases
      .getTribeCreationEligibility({
        creatorEmail: authenticatedMember.email,
      })
      .catch((error: unknown) => {
        logger.error({
          message: CREATE_TRIBE_PAGE_LOG.resolveEligibilityFailureMessage,
          error,
          metadata: {
            creatorId: authenticatedMember.id,
          },
        });

        throw error;
      }),
    searchParams,
  ]);
  const contactEmail = getContactEmail();

  if (!eligibility.canCreate) {
    return (
      <main className={styles.CreateTribePage}>
        <TribeCreationBlocked contactEmail={contactEmail} />
      </main>
    );
  }

  return (
    <main className={styles.CreateTribePage}>
      <section className={styles.CreateTribePage__panel}>
        <header className={styles.CreateTribePage__header}>
          <p className={styles.CreateTribePage__eyebrow}>Nueva tribu</p>
          <h1 className={styles.CreateTribePage__title}>Crear una tribu</h1>
          <p className={styles.CreateTribePage__description}>
            Define el nombre y el slug inicial. La tribu se creara como privada
            y tu cuenta quedara como líder desde el primer momento.
          </p>
        </header>
        <div className={styles.CreateTribePage__content}>
          <CreateTribeForm
            errorMessage={resolveErrorMessage(
              readFirstSearchParamValue(
                resolvedSearchParams[QUERY_PARAMS.tribes.error]
              )
            )}
            initialName={
              readFirstSearchParamValue(resolvedSearchParams[QUERY_PARAMS.tribes.name]) ??
              ""
            }
            initialSlug={
              readFirstSearchParamValue(resolvedSearchParams[QUERY_PARAMS.tribes.slug]) ??
              ""
            }
            submitPath={ROUTES.api.tribes}
            suggestedSlug={readFirstSearchParamValue(
              resolvedSearchParams[QUERY_PARAMS.tribes.suggestedSlug]
            )}
          />
        </div>
      </section>
    </main>
  );
}
