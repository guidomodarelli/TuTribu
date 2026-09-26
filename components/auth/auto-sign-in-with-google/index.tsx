"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { CardDescription } from "beez-ui";
import { ROUTES } from "@/src/constants/routes";
import { startGoogleSignIn } from "@/src/modules/auth/infrastructure/better-auth/client";
import { SignInWithGoogleButton } from "../sign-in-with-google-button";
import styles from "./styles.module.scss";

type AutoSignInWithGoogleProps = {
  callbackUrl: string;
};

/**
 * Starts the Google sign-in once on mount and keeps the manual button as a
 * fallback when the automatic redirect does not happen.
 */
export function AutoSignInWithGoogle({ callbackUrl }: AutoSignInWithGoogleProps) {
  const hasTriggeredSignInRef = useRef(false);
  const { push } = useRouter();

  useEffect(() => {
    if (hasTriggeredSignInRef.current) {
      return;
    }

    hasTriggeredSignInRef.current = true;
    void startGoogleSignIn(callbackUrl).catch(() => {
      push(ROUTES.auth.error);
    });
  }, [callbackUrl, push]);

  return (
    <div className={styles.AutoSignInWithGoogle}>
      <CardDescription className={styles.AutoSignInWithGoogle__description}>
        Te estamos redirigiendo a Google. Si no sucede automáticamente, usá el botón.
      </CardDescription>
      <SignInWithGoogleButton callbackUrl={callbackUrl} />
    </div>
  );
}
