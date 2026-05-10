"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { CardDescription } from "@/components/ui/card";
import { ROUTES } from "@/src/constants/routes";
import { startGoogleSignIn } from "@/src/modules/auth/infrastructure/better-auth/client";
import { SignInWithGoogleButton } from "../sign-in-with-google-button";
import styles from "./styles.module.scss";

type AutoSignInWithGoogleProps = {
  callbackUrl: string;
};

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
        Te estamos redirigiendo a Google. Si no sucede automaticamente, usa el boton.
      </CardDescription>
      <SignInWithGoogleButton callbackUrl={callbackUrl} />
    </div>
  );
}
