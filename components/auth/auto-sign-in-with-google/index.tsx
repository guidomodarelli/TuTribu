"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { CardDescription } from "beez-ui";
import { useIsHydrated } from "beez-ui/hooks";
import { isBackForwardDocumentLoad } from "@/lib/browser-navigation";
import { ROUTES } from "@/src/constants/routes";
import { startGoogleSignIn } from "@/src/modules/auth/infrastructure/better-auth/client";
import { SignInWithGoogleButton } from "../sign-in-with-google-button";
import styles from "./styles.module.scss";

type AutoSignInWithGoogleProps = {
  callbackUrl: string;
};

const AUTO_SIGN_IN_COPY = {
  manual: "Iniciá sesión con tu cuenta de Google para continuar.",
  redirecting:
    "Te estamos redirigiendo a Google. Si no sucede automáticamente, usá el botón.",
} as const;

/**
 * Starts the Google sign-in once on mount and keeps the manual button as a
 * fallback when the automatic redirect does not happen.
 *
 * The automatic start is skipped when the page was reached with Back or
 * Forward: the member is coming back from Google on purpose, and redirecting
 * again would trap them in a loop. Only the manual button is offered then.
 */
export function AutoSignInWithGoogle({ callbackUrl }: AutoSignInWithGoogleProps) {
  const hasTriggeredSignInRef = useRef(false);
  const { push } = useRouter();
  // The navigation type only exists in the browser: the server and the first
  // client render show the redirecting copy, so hydration stays deterministic.
  const isHydrated = useIsHydrated();
  const isAutomaticStartSkipped = isHydrated && isBackForwardDocumentLoad();

  useEffect(() => {
    if (hasTriggeredSignInRef.current) {
      return;
    }

    hasTriggeredSignInRef.current = true;

    if (isBackForwardDocumentLoad()) {
      return;
    }

    void startGoogleSignIn(callbackUrl).catch(() => {
      push(ROUTES.auth.error);
    });
  }, [callbackUrl, push]);

  return (
    <div className={styles.AutoSignInWithGoogle}>
      <CardDescription className={styles.AutoSignInWithGoogle__description}>
        {isAutomaticStartSkipped
          ? AUTO_SIGN_IN_COPY.manual
          : AUTO_SIGN_IN_COPY.redirecting}
      </CardDescription>
      <SignInWithGoogleButton callbackUrl={callbackUrl} />
    </div>
  );
}
