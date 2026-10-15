import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AutoSignInWithGoogle } from "@/components/auth/auto-sign-in-with-google";
import { DevSignInForm } from "@/components/auth/dev-sign-in-form";
import { OpenInBrowserCta } from "@/components/auth/open-in-browser-cta";
import { SignInWithGoogleButton } from "@/components/auth/sign-in-with-google-button";
import { Card, CardContent, CardHeader } from "beez-ui";
import { siteConfig } from "@/lib/site-config";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { detectInAppBrowser } from "@/src/modules/shared/infrastructure/http/in-app-browser-detection";
import { resolveDevSignInFormEmail } from "@/src/modules/auth/infrastructure/dev-sign-in/dev-sign-in-activation";
import { createRequestModules } from "@/src/modules/setup";
import styles from "./page.module.scss";

export type SignInSearchParams = {
  [key: string]: string | string[] | undefined;
};

const AUTH_SIGN_IN_PREFIX = {
  slash: "/",
} as const;
/**
 * Placeholder origin used only to resolve a callback path the way a browser
 * would. A callback is accepted when it stays on this origin, which rejects
 * protocol-relative tricks such as `//host`, `/\host` or `/<tab>/host`.
 */
const CALLBACK_URL_RESOLUTION_ORIGIN = "https://callback.invalid";
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

/**
 * Keeps only same-origin callback paths. The candidate is resolved with the
 * WHATWG URL parser, the same one browsers apply to `Location` and meta
 * refresh targets, so backslashes and stripped control characters cannot turn
 * a path into a protocol-relative URL that leaves the app.
 *
 * @param rawCallbackUrl - Untrusted `callbackUrl` search param value.
 * @param fallbackPath - Internal path used when the candidate is missing or unsafe.
 * @returns The normalized internal path (with search and hash) or the fallback.
 */
function resolveSafeCallbackUrl(
  rawCallbackUrl: string | null,
  fallbackPath: string
): string {
  if (!rawCallbackUrl) {
    return fallbackPath;
  }

  const trimmedCallbackUrl = rawCallbackUrl.trim();

  if (!trimmedCallbackUrl.startsWith(AUTH_SIGN_IN_PREFIX.slash)) {
    return fallbackPath;
  }

  let resolvedCallbackUrl: URL;

  try {
    resolvedCallbackUrl = new URL(
      trimmedCallbackUrl,
      CALLBACK_URL_RESOLUTION_ORIGIN
    );
  } catch {
    // Unparseable input is untrusted: fall back to the internal default path.
    return fallbackPath;
  }

  if (resolvedCallbackUrl.origin !== CALLBACK_URL_RESOLUTION_ORIGIN) {
    return fallbackPath;
  }

  return (
    resolvedCallbackUrl.pathname +
    resolvedCallbackUrl.search +
    resolvedCallbackUrl.hash
  );
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

/**
 * Sign-in options. With the development sign-in active (`devSignInEmail` set)
 * the automatic Google redirect is skipped so the local form stays reachable;
 * Google remains available through the manual button.
 */
export function SignInView({
  callbackUrl,
  devSignInEmail = null,
}: {
  callbackUrl: string;
  devSignInEmail?: string | null;
}) {
  if (devSignInEmail) {
    return (
      <SignInShell>
        <SignInWithGoogleButton callbackUrl={callbackUrl} />
        <DevSignInForm callbackUrl={callbackUrl} defaultEmail={devSignInEmail} />
      </SignInShell>
    );
  }

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
  const callbackUrl = resolveSafeCallbackUrl(rawCallbackUrl, ROUTES.home);
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (authenticatedMember) {
    redirect(callbackUrl);
  }

  const requestHeaders = await headers();
  const inAppBrowser = detectInAppBrowser(
    requestHeaders.get(USER_AGENT_HEADER)
  );

  if (inAppBrowser.isInAppBrowser) {
    return (
      <OpenInBrowserView
        isIos={inAppBrowser.isIos}
        signInUrl={buildAbsoluteSignInUrl(callbackUrl)}
      />
    );
  }

  return (
    <SignInView
      callbackUrl={callbackUrl}
      devSignInEmail={resolveDevSignInFormEmail(process.env)}
    />
  );
}
