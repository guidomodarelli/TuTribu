"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import styles from "./styles.module.scss";

type SignInWithGoogleButtonProps = {
  callbackUrl: string;
};

export function SignInWithGoogleButton({
  callbackUrl,
}: SignInWithGoogleButtonProps) {
  const handleGoogleSignIn = async () => {
    await signIn("google", { callbackUrl });
  };

  return (
    <Button
      type="button"
      onClick={handleGoogleSignIn}
      size="lg"
      className={styles.SignInWithGoogleButton}
    >
      Iniciar sesion con Google
    </Button>
  );
}
