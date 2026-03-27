import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import { createCreateCommunityUseCase } from "@/src/modules/communities/infrastructure/composition/create-create-community-use-case";

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
  const name = readStringFormValue(formData.get("name"));
  const slug = readStringFormValue(formData.get("slug"));
  const authenticatedMember =
    await createGetAuthenticatedMemberUseCase().execute();

  if (!authenticatedMember) {
    return Response.redirect(
      buildRedirectUrl(request.url, "/auth/signin", {
        callbackUrl: "/comunidad/crear",
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
      case "created":
        return Response.redirect(
          buildRedirectUrl(request.url, `/comunidad/${result.slug}`)
        );
      case "slug-conflict":
        return Response.redirect(
          buildRedirectUrl(request.url, "/comunidad/crear", {
            name,
            slug,
            error: result.status,
            suggestedSlug: result.suggestedSlug,
          })
        );
      case "invalid-name":
      case "invalid-slug":
      case "not-allowed":
        return Response.redirect(
          buildRedirectUrl(request.url, "/comunidad/crear", {
            name,
            slug,
            error: result.status,
          })
        );
      default:
        return Response.redirect(
          buildRedirectUrl(request.url, "/comunidad/crear", {
            name,
            slug,
            error: "unexpected",
          })
        );
    }
  } catch {
    return Response.redirect(
      buildRedirectUrl(request.url, "/comunidad/crear", {
        name,
        slug,
        error: "unexpected",
      })
    );
  }
}
