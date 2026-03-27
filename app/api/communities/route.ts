import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import {
  CREATE_COMMUNITY_ERROR_CODE,
  CREATE_COMMUNITY_STATUS,
} from "@/src/modules/communities/application/results/create-community-result";
import { createCreateCommunityUseCase } from "@/src/modules/communities/infrastructure/composition/create-create-community-use-case";

const COMMUNITY_FORM_FIELD = {
  name: "name",
  slug: "slug",
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
  const formData = await request.formData();
  const name = readStringFormValue(formData.get(COMMUNITY_FORM_FIELD.name));
  const slug = readStringFormValue(formData.get(COMMUNITY_FORM_FIELD.slug));
  const authenticatedMember =
    await createGetAuthenticatedMemberUseCase().execute();

  if (!authenticatedMember) {
    return Response.redirect(
      buildRedirectUrl(request.url, ROUTES.auth.signIn, {
        [QUERY_PARAMS.auth.callbackUrl]: ROUTES.communities.create,
      })
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
        return Response.redirect(
          buildRedirectUrl(request.url, ROUTES.communities.bySlug(result.slug))
        );
      case CREATE_COMMUNITY_STATUS.slugConflict:
        return Response.redirect(
          buildRedirectUrl(request.url, ROUTES.communities.create, {
            [QUERY_PARAMS.communities.name]: name,
            [QUERY_PARAMS.communities.slug]: slug,
            [QUERY_PARAMS.communities.error]: result.status,
            [QUERY_PARAMS.communities.suggestedSlug]: result.suggestedSlug,
          })
        );
      case CREATE_COMMUNITY_STATUS.invalidName:
      case CREATE_COMMUNITY_STATUS.invalidSlug:
      case CREATE_COMMUNITY_STATUS.notAllowed:
        return Response.redirect(
          buildRedirectUrl(request.url, ROUTES.communities.create, {
            [QUERY_PARAMS.communities.name]: name,
            [QUERY_PARAMS.communities.slug]: slug,
            [QUERY_PARAMS.communities.error]: result.status,
          })
        );
      default:
        return Response.redirect(
          buildRedirectUrl(request.url, ROUTES.communities.create, {
            [QUERY_PARAMS.communities.name]: name,
            [QUERY_PARAMS.communities.slug]: slug,
            [QUERY_PARAMS.communities.error]: CREATE_COMMUNITY_ERROR_CODE.unexpected,
          })
        );
    }
  } catch {
    return Response.redirect(
      buildRedirectUrl(request.url, ROUTES.communities.create, {
        [QUERY_PARAMS.communities.name]: name,
        [QUERY_PARAMS.communities.slug]: slug,
        [QUERY_PARAMS.communities.error]: CREATE_COMMUNITY_ERROR_CODE.unexpected,
      })
    );
  }
}
