"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, PresenceSwap } from "beez-ui";
import { ROUTES } from "@/src/constants/routes";
import { startGoogleSignIn } from "@/src/modules/auth/infrastructure/better-auth/client";
import styles from "./styles.module.scss";

type SignInWithGoogleButtonProps = {
  callbackUrl: string;
};
const SIGN_IN_WITH_GOOGLE_BUTTON = {
  size: "lg",
  type: "button",
} as const;

const SIGN_IN_WITH_GOOGLE_COPY = {
  idle: "Iniciar sesión con Google",
  redirecting: "Redirigiendo a Google…",
} as const;

/** Presence keys of the two button labels, so the swap cross-fades them. */
const SIGN_IN_LABEL_KEY = {
  idle: "idle",
  redirecting: "redirecting",
} as const;

/** Browser event fired when a page is shown, including restores from the back-forward cache. */
const PAGE_SHOW_EVENT = "pageshow";

/**
 * Starts the Google OAuth redirect. While the browser leaves for Google the
 * button stays disabled so repeated taps cannot open several OAuth flows; it
 * is re-enabled when the start fails or when the page comes back from the
 * back-forward cache (Safari and iOS restore it with the pending state).
 */
export function SignInWithGoogleButton({
  callbackUrl,
}: SignInWithGoogleButtonProps) {
  const { push } = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    /** Clears the pending state of a page restored after leaving for Google. */
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setIsRedirecting(false);
      }
    };

    window.addEventListener(PAGE_SHOW_EVENT, handlePageShow);

    return () => window.removeEventListener(PAGE_SHOW_EVENT, handlePageShow);
  }, []);

  const handleGoogleSignIn = () => {
    if (isRedirecting) {
      return;
    }

    setIsRedirecting(true);
    void startGoogleSignIn(callbackUrl).catch(() => {
      setIsRedirecting(false);
      push(ROUTES.auth.error);
    });
  };

  return (
    <Button
      aria-busy={isRedirecting}
      type={SIGN_IN_WITH_GOOGLE_BUTTON.type}
      onClick={handleGoogleSignIn}
      disabled={isRedirecting}
      size={SIGN_IN_WITH_GOOGLE_BUTTON.size}
      className={styles.SignInWithGoogleButton}
    >
      <PresenceSwap
        as="span"
        mode="popLayout"
        presenceKey={isRedirecting ? SIGN_IN_LABEL_KEY.redirecting : SIGN_IN_LABEL_KEY.idle}
      >
        {isRedirecting ? SIGN_IN_WITH_GOOGLE_COPY.redirecting : SIGN_IN_WITH_GOOGLE_COPY.idle}
      </PresenceSwap>
    </Button>
  );
}
