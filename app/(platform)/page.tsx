import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import styles from "./page.module.scss";

const HOME_PAGE_COPY = {
  eyebrow: "Bienvenido",
  title: "Un espacio para aprender, compartir y crecer en tribu",
  authenticatedDescription:
    "Explora tribus, conecta con otras personas y sigue construyendo tu espacio dentro de la plataforma.",
  unauthenticatedDescription:
    "Entra a tu cuenta para descubrir tribus, conectar con otras personas y empezar a construir tu propio espacio.",
  signInAction: "Iniciar sesion",
} as const;

const HOME_PAGE_QUERY = {
  mercadoPagoPreapprovalId: "preapproval_id",
} as const;

type HomePageSearchParams = {
  [HOME_PAGE_QUERY.mercadoPagoPreapprovalId]?: string | string[];
};

function readFirstSearchParamValue(
  searchParamValue: string | string[] | undefined
): string | null {
  if (typeof searchParamValue === "string") {
    return searchParamValue;
  }

  if (Array.isArray(searchParamValue)) {
    const firstStringValue = searchParamValue.find(
      (value) => value.trim().length > 0
    );

    return firstStringValue ?? null;
  }

  return null;
}

export default async function HomePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<HomePageSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const mercadoPagoPreapprovalId = readFirstSearchParamValue(
    resolvedSearchParams[HOME_PAGE_QUERY.mercadoPagoPreapprovalId]
  );
  const requestHeaders = await headers();
  const { requestId } = resolveRequestContext(requestHeaders);
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (authenticatedMember && mercadoPagoPreapprovalId) {
    const returnPath =
      await modules.subscriptions.useCases.resolveTribeMemberSubscriptionReturnPath({
        providerSubscriptionId: mercadoPagoPreapprovalId,
      });

    if (returnPath) {
      redirect(returnPath);
    }
  }

  return (
    <main className={styles.HomePage}>
      <p className={styles.HomePage__eyebrow}>{HOME_PAGE_COPY.eyebrow}</p>
      <h1 className={styles.HomePage__title}>{HOME_PAGE_COPY.title}</h1>
      <p className={styles.HomePage__description}>
        {authenticatedMember
          ? HOME_PAGE_COPY.authenticatedDescription
          : HOME_PAGE_COPY.unauthenticatedDescription}
      </p>
      {!authenticatedMember ? (
        <div className={styles.HomePage__actions}>
          <Button asChild>
            <Link href={ROUTES.auth.signIn}>{HOME_PAGE_COPY.signInAction}</Link>
          </Button>
        </div>
      ) : null}
    </main>
  );
}
