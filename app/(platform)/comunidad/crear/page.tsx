import { redirect } from "next/navigation";

import { CommunityCreationBlocked } from "@/components/communities/community-creation-blocked";
import { CreateCommunityForm } from "@/components/communities/create-community-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import { createGetCommunityCreationEligibilityUseCase } from "@/src/modules/communities/infrastructure/composition/create-get-community-creation-eligibility-use-case";
import { getContactEmail } from "@/src/modules/communities/infrastructure/config/community-creation-contact-email";
import styles from "./page.module.scss";

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
    case "invalid-name":
      return "Define un nombre para tu comunidad.";
    case "invalid-slug":
      return "Define un slug valido para tu comunidad.";
    case "slug-conflict":
      return "Ese slug ya esta en uso. Puedes probar con la sugerencia.";
    case "not-allowed":
      return "Tu cuenta no esta habilitada para crear comunidades.";
    case "unexpected":
      return "No pudimos crear tu comunidad. Intentalo otra vez.";
    default:
      return null;
  }
}

export default async function CreateCommunityPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<CreateCommunitySearchParams>;
}) {
  const authenticatedMember =
    await createGetAuthenticatedMemberUseCase().execute();

  if (!authenticatedMember) {
    redirect("/auth/signin?callbackUrl=%2Fcomunidad%2Fcrear");
  }

  const eligibility = await createGetCommunityCreationEligibilityUseCase().execute({
    creatorEmail: authenticatedMember.email,
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
      <Card className={styles.CreateCommunityPage__card}>
        <CardHeader className={styles.CreateCommunityPage__header}>
          <p className={styles.CreateCommunityPage__eyebrow}>Nueva comunidad</p>
          <h1 className={styles.CreateCommunityPage__title}>Crear una comunidad</h1>
          <p className={styles.CreateCommunityPage__description}>
            Define el nombre y el slug inicial. La comunidad se creara como privada
            y tu cuenta quedara como owner desde el primer momento.
          </p>
        </CardHeader>
        <CardContent className={styles.CreateCommunityPage__content}>
          <CreateCommunityForm
            errorMessage={resolveErrorMessage(
              readFirstSearchParamValue(resolvedSearchParams.error)
            )}
            initialName={readFirstSearchParamValue(resolvedSearchParams.name) ?? ""}
            initialSlug={readFirstSearchParamValue(resolvedSearchParams.slug) ?? ""}
            submitPath="/api/communities"
            suggestedSlug={readFirstSearchParamValue(
              resolvedSearchParams.suggestedSlug
            )}
          />
        </CardContent>
      </Card>
    </main>
  );
}
