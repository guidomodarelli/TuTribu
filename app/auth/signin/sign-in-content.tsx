import { redirect } from "next/navigation";

import { AutoSignInWithGoogle } from "@/components/auth/auto-sign-in-with-google";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { siteConfig } from "@/lib/site-config";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import styles from "./page.module.scss";

export type SignInSearchParams = {
  [key: string]: string | string[] | undefined;
};

const AUTH_SIGN_IN_PREFIX = {
  doubleSlash: "//",
  slash: "/",
} as const;
const AUTH_SIGN_IN_UI = {
  ariaHidden: "true",
} as const;
const SIGN_IN_PAGE_COPY = {
  pendingDescription: "Preparando acceso...",
} as const;

function resolveSafeCallbackUrl(
  rawCallbackUrl: string | null,
  fallbackPath: string
): string {
  if (!rawCallbackUrl) {
    return fallbackPath;
  }

  const trimmedCallbackUrl = rawCallbackUrl.trim();

  if (
    !trimmedCallbackUrl.startsWith(AUTH_SIGN_IN_PREFIX.slash) ||
    trimmedCallbackUrl.startsWith(AUTH_SIGN_IN_PREFIX.doubleSlash)
  ) {
    return fallbackPath;
  }

  return trimmedCallbackUrl;
}

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

function SignInShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.SignInPage}>
      <Card className={styles.SignInPage__card}>
        <div
          aria-hidden={AUTH_SIGN_IN_UI.ariaHidden}
          className={styles.SignInPage__highlight}
        />
        <CardHeader className={styles.SignInPage__cardHeader}>
          <p className={styles.SignInPage__eyebrow}>
            Acceso a {siteConfig.name}
          </p>
          <h1 className={styles.SignInPage__title}>Continuar con Google</h1>
          <p className={styles.SignInPage__description}>
            Inicia sesion con tu cuenta de Google para acceder a tu plataforma privada.
          </p>
        </CardHeader>
        <CardContent className={styles.SignInPage__cardContent}>
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

export function SignInPendingView() {
  return (
    <SignInShell>
      <p className={styles.SignInPage__description}>
        {SIGN_IN_PAGE_COPY.pendingDescription}
      </p>
    </SignInShell>
  );
}

export function SignInView({ callbackUrl }: { callbackUrl: string }) {
  return (
    <SignInShell>
      <AutoSignInWithGoogle callbackUrl={callbackUrl} />
    </SignInShell>
  );
}

export async function SignInContent({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<SignInSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawCallbackUrl = readFirstSearchParamValue(
    resolvedSearchParams[QUERY_PARAMS.auth.callbackUrl]
  );
  const callbackUrlForAuthenticatedMember = resolveSafeCallbackUrl(
    rawCallbackUrl,
    ROUTES.home
  );
  const callbackUrlForSignIn = resolveSafeCallbackUrl(
    rawCallbackUrl,
    ROUTES.home
  );
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (authenticatedMember) {
    redirect(callbackUrlForAuthenticatedMember);
  }

  return <SignInView callbackUrl={callbackUrlForSignIn} />;
}
