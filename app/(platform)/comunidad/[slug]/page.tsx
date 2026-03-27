import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import { createGetCommunityPageAccessUseCase } from "@/src/modules/communities/infrastructure/composition/create-get-community-page-access-use-case";
import styles from "./page.module.scss";

export default async function CommunityPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const authenticatedMember =
    await createGetAuthenticatedMemberUseCase().execute();

  const accessResult = await createGetCommunityPageAccessUseCase()
    .execute({
      isAuthenticated: Boolean(authenticatedMember),
      slug,
    })
    .catch((error) => {
      console.error("[communities] failed to resolve community access", {
        error,
        reason: "unexpected_repository_error",
        slug,
        viewerId: authenticatedMember?.id ?? null,
      });
      notFound();
    });

  if (accessResult.status === "hidden") {
    console.info("[communities] hidden community access", {
      reason: accessResult.reason,
      slug,
      viewerId: authenticatedMember?.id ?? null,
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
