import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AutoSignInWithGoogle } from "@/components/auth/auto-sign-in-with-google";
import { OpenInBrowserCta } from "@/components/auth/open-in-browser-cta";
import { Card, CardContent, CardHeader } from "beez-ui";
import { siteConfig } from "@/lib/site-config";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { detectInAppBrowser } from "@/src/modules/shared/infrastructure/http/in-app-browser-detection";
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
  defaultDescription:
    "Inicia sesion con tu cuenta de Google para acceder a tu plataforma privada.",
  defaultTitle: "Continuar con Google",
  eyebrowAccessPrefix: "Acceso a ",
  inAppBrowserDescription:
    "Para iniciar sesión necesitamos abrir TuTribu en tu navegador habitual.",
  inAppBrowserEyebrow: "Continuar en tu navegador",
  inAppBrowserTitle: "Casi listo",
  pendingDescription: "Preparando acceso...",
} as const;
const SIGN_IN_URL_TOKEN = {
  querySeparator: "?",
} as const;
const USER_AGENT_HEADER = "user-agent";

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

type SignInShellProps = {
  children: React.ReactNode;
  description?: string;
  eyebrow?: string;
  title?: string;
};

function SignInShell({
  children,
  description = SIGN_IN_PAGE_COPY.defaultDescription,
  eyebrow,
  title = SIGN_IN_PAGE_COPY.defaultTitle,
}: SignInShellProps) {
  return (
    <main className={styles.SignInPage}>
      <Card className={styles.SignInPage__card}>
        <div
          aria-hidden={AUTH_SIGN_IN_UI.ariaHidden}
          className={styles.SignInPage__highlight}
        />
        <CardHeader className={styles.SignInPage__cardHeader}>
          <p className={styles.SignInPage__eyebrow}>
            {eyebrow ?? SIGN_IN_PAGE_COPY.eyebrowAccessPrefix + siteConfig.name}
          </p>
          <h1 className={styles.SignInPage__title}>{title}</h1>
          <p className={styles.SignInPage__description}>{description}</p>
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

export function OpenInBrowserView({
  isIos,
  signInUrl,
}: {
  isIos: boolean;
  signInUrl: string;
}) {
  return (
    <SignInShell
      description={SIGN_IN_PAGE_COPY.inAppBrowserDescription}
      eyebrow={SIGN_IN_PAGE_COPY.inAppBrowserEyebrow}
      title={SIGN_IN_PAGE_COPY.inAppBrowserTitle}
    >
      <OpenInBrowserCta isIos={isIos} signInUrl={signInUrl} />
    </SignInShell>
  );
}

function buildAbsoluteSignInUrl(callbackUrl: string): string {
  const callbackSearchParams = new URLSearchParams({
    [QUERY_PARAMS.auth.callbackUrl]: callbackUrl,
  });

  return (
    resolvePublicAppBaseUrl() +
    ROUTES.auth.signIn +
    SIGN_IN_URL_TOKEN.querySeparator +
    callbackSearchParams.toString()
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

  const requestHeaders = await headers();
  const inAppBrowser = detectInAppBrowser(
    requestHeaders.get(USER_AGENT_HEADER)
  );

  if (inAppBrowser.isInAppBrowser) {
    return (
      <OpenInBrowserView
        isIos={inAppBrowser.isIos}
        signInUrl={buildAbsoluteSignInUrl(callbackUrlForSignIn)}
      />
    );
  }

  return <SignInView callbackUrl={callbackUrlForSignIn} />;
}
