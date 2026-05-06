import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import {
  CREATE_TRIBE_ERROR_CODE,
  CREATE_TRIBE_STATUS,
} from "@/src/modules/tribes/application/results/create-tribe-result";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createRedirectResponse } from "@/src/modules/shared/infrastructure/observability/route-response";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const TRIBE_FORM_FIELD = {
  name: "name",
  slug: "slug",
} as const;

const TRIBE_CREATE_ROUTE_LOG = {
  createFailureMessage: "Tribe creation failed",
  feature: "tribes",
  operation: "create-tribe",
} as const;

function readStringFormValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildRedirectUrl(
  requestUrl: string,
  pathname: string,
  params?: Record<string, string | null | undefined>
): URL {
  const redirectUrl = new URL(pathname, requestUrl);

  if (!params) {
    return redirectUrl;
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  });

  return redirectUrl;
}

export async function POST(request: Request) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: TRIBE_CREATE_ROUTE_LOG.feature,
    operation: TRIBE_CREATE_ROUTE_LOG.operation,
    requestId,
  });
  const formData = await request.formData();
  const name = readStringFormValue(formData.get(TRIBE_FORM_FIELD.name));
  const slug = readStringFormValue(formData.get(TRIBE_FORM_FIELD.slug));
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createRedirectResponse(
      buildRedirectUrl(request.url, ROUTES.auth.signIn, {
        [QUERY_PARAMS.auth.callbackUrl]: ROUTES.tribes.create,
      }),
      requestId
    );
  }

  try {
    const result = await modules.tribes.useCases.createTribe({
      creatorEmail: authenticatedMember.email,
      creatorId: authenticatedMember.id,
      name,
      slug,
    });

    switch (result.status) {
      case CREATE_TRIBE_STATUS.created:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.tribes.bySlug(result.slug)),
          requestId
        );
      case CREATE_TRIBE_STATUS.slugConflict:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.tribes.create, {
            [QUERY_PARAMS.tribes.name]: name,
            [QUERY_PARAMS.tribes.slug]: slug,
            [QUERY_PARAMS.tribes.error]: result.status,
            [QUERY_PARAMS.tribes.suggestedSlug]: result.suggestedSlug,
          }),
          requestId
        );
      case CREATE_TRIBE_STATUS.invalidName:
      case CREATE_TRIBE_STATUS.invalidSlug:
      case CREATE_TRIBE_STATUS.notAllowed:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.tribes.create, {
            [QUERY_PARAMS.tribes.name]: name,
            [QUERY_PARAMS.tribes.slug]: slug,
            [QUERY_PARAMS.tribes.error]: result.status,
          }),
          requestId
        );
      default:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.tribes.create, {
            [QUERY_PARAMS.tribes.name]: name,
            [QUERY_PARAMS.tribes.slug]: slug,
            [QUERY_PARAMS.tribes.error]: CREATE_TRIBE_ERROR_CODE.unexpected,
          }),
          requestId
        );
    }
  } catch (error) {
    logger.error({
      message: TRIBE_CREATE_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        creatorId: authenticatedMember.id,
        slug,
      },
    });

    return createRedirectResponse(
      buildRedirectUrl(request.url, ROUTES.tribes.create, {
        [QUERY_PARAMS.tribes.name]: name,
        [QUERY_PARAMS.tribes.slug]: slug,
        [QUERY_PARAMS.tribes.error]: CREATE_TRIBE_ERROR_CODE.unexpected,
      }),
      requestId
    );
  }
}
