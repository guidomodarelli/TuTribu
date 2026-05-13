import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import styles from "./page.module.scss";

const HOME_PAGE_COPY = {
  authenticatedDescription:
    "Explora tribus, conecta con otras personas y sigue construyendo tu espacio dentro de la plataforma.",
  eyebrow: "Bienvenido",
  pendingDescription: "Preparando tu espacio dentro de la plataforma.",
  signInAction: "Iniciar sesion",
  title: "Un espacio para aprender, compartir y crecer en tribu",
  unauthenticatedDescription:
    "Entra a tu cuenta para descubrir tribus, conectar con otras personas y empezar a construir tu propio espacio.",
} as const;

const HOME_PAGE_QUERY = {
  mercadoPagoPreapprovalId: "preapproval_id",
} as const;

export type HomePageSearchParams = {
  [HOME_PAGE_QUERY.mercadoPagoPreapprovalId]?: string | string[];
};

type HomePageViewProps = {
  isAuthenticated: boolean | null;
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

function getHomePageDescription(isAuthenticated: boolean | null): string {
  if (isAuthenticated === null) {
    return HOME_PAGE_COPY.pendingDescription;
  }

  return isAuthenticated
    ? HOME_PAGE_COPY.authenticatedDescription
    : HOME_PAGE_COPY.unauthenticatedDescription;
}

export function HomePageView({ isAuthenticated }: HomePageViewProps) {
  const description = getHomePageDescription(isAuthenticated);

  return (
    <main className={styles.HomePage}>
      <p className={styles.HomePage__eyebrow}>{HOME_PAGE_COPY.eyebrow}</p>
      <h1 className={styles.HomePage__title}>{HOME_PAGE_COPY.title}</h1>
      <p className={styles.HomePage__description}>{description}</p>
      {isAuthenticated === false ? (
        <div className={styles.HomePage__actions}>
          <Button asChild>
            <Link href={ROUTES.auth.signIn}>{HOME_PAGE_COPY.signInAction}</Link>
          </Button>
        </div>
      ) : null}
    </main>
  );
}

export async function HomePageContent({
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

  return <HomePageView isAuthenticated={Boolean(authenticatedMember)} />;
}
