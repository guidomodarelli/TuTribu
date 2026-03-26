"use client";

import { useEffect, useRef } from "react";

import { CardDescription } from "@/components/ui/card";
import { navigateToGoogleAuthStart } from "@/src/modules/auth/infrastructure/oauth/start-google-auth-navigation";
import { SignInWithGoogleButton } from "../sign-in-with-google-button";
import styles from "./styles.module.scss";

type AutoSignInWithGoogleProps = {
  callbackUrl: string;
};

export function AutoSignInWithGoogle({ callbackUrl }: AutoSignInWithGoogleProps) {
  const hasTriggeredSignInRef = useRef(false);

  useEffect(() => {
    if (hasTriggeredSignInRef.current) {
      return;
    }

    hasTriggeredSignInRef.current = true;
    navigateToGoogleAuthStart(callbackUrl);
  }, [callbackUrl]);

  return (
    <div className={styles.AutoSignInWithGoogle}>
      <CardDescription className={styles.AutoSignInWithGoogle__description}>
        Te estamos redirigiendo a Google. Si no sucede automaticamente, usa el boton.
      </CardDescription>
      <SignInWithGoogleButton callbackUrl={callbackUrl} />
    </div>
  );
}
