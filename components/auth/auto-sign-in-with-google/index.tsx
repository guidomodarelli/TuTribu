"use client";

import { useEffect, useRef } from "react";
import { signIn } from "next-auth/react";

import { CardDescription } from "@/components/ui/card";
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
    void signIn("google", { callbackUrl });
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
