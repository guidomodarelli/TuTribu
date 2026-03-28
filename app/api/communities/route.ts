import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { createAuthModule } from "@/src/modules/auth/setup";
import {
  CREATE_COMMUNITY_ERROR_CODE,
  CREATE_COMMUNITY_STATUS,
} from "@/src/modules/communities/application/results/create-community-result";
import { createCreateCommunityUseCase } from "@/src/modules/communities/infrastructure/composition/create-create-community-use-case";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createRedirectResponse } from "@/src/modules/shared/infrastructure/observability/route-response";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const COMMUNITY_FORM_FIELD = {
  name: "name",
  slug: "slug",
} as const;

const COMMUNITY_CREATE_ROUTE_LOG = {
  createFailureMessage: "Community creation failed",
  feature: "communities",
  operation: "create-community",
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
    feature: COMMUNITY_CREATE_ROUTE_LOG.feature,
    operation: COMMUNITY_CREATE_ROUTE_LOG.operation,
    requestId,
  });
  const formData = await request.formData();
  const name = readStringFormValue(formData.get(COMMUNITY_FORM_FIELD.name));
  const slug = readStringFormValue(formData.get(COMMUNITY_FORM_FIELD.slug));
  const authenticatedMember = await createAuthModule().useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createRedirectResponse(
      buildRedirectUrl(request.url, ROUTES.auth.signIn, {
        [QUERY_PARAMS.auth.callbackUrl]: ROUTES.communities.create,
      }),
      requestId
    );
  }

  try {
    const result = await createCreateCommunityUseCase().execute({
      creatorEmail: authenticatedMember.email,
      creatorId: authenticatedMember.id,
      name,
      slug,
    });

    switch (result.status) {
      case CREATE_COMMUNITY_STATUS.created:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.communities.bySlug(result.slug)),
          requestId
        );
      case CREATE_COMMUNITY_STATUS.slugConflict:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.communities.create, {
            [QUERY_PARAMS.communities.name]: name,
            [QUERY_PARAMS.communities.slug]: slug,
            [QUERY_PARAMS.communities.error]: result.status,
            [QUERY_PARAMS.communities.suggestedSlug]: result.suggestedSlug,
          }),
          requestId
        );
      case CREATE_COMMUNITY_STATUS.invalidName:
      case CREATE_COMMUNITY_STATUS.invalidSlug:
      case CREATE_COMMUNITY_STATUS.notAllowed:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.communities.create, {
            [QUERY_PARAMS.communities.name]: name,
            [QUERY_PARAMS.communities.slug]: slug,
            [QUERY_PARAMS.communities.error]: result.status,
          }),
          requestId
        );
      default:
        return createRedirectResponse(
          buildRedirectUrl(request.url, ROUTES.communities.create, {
            [QUERY_PARAMS.communities.name]: name,
            [QUERY_PARAMS.communities.slug]: slug,
            [QUERY_PARAMS.communities.error]: CREATE_COMMUNITY_ERROR_CODE.unexpected,
          }),
          requestId
        );
    }
  } catch (error) {
    logger.error({
      message: COMMUNITY_CREATE_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        creatorId: authenticatedMember.id,
        slug,
      },
    });

    return createRedirectResponse(
      buildRedirectUrl(request.url, ROUTES.communities.create, {
        [QUERY_PARAMS.communities.name]: name,
        [QUERY_PARAMS.communities.slug]: slug,
        [QUERY_PARAMS.communities.error]: CREATE_COMMUNITY_ERROR_CODE.unexpected,
      }),
      requestId
    );
  }
}
