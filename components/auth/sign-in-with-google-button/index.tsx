"use client";

import { Button } from "@/components/ui/button";
import { navigateToGoogleAuthStart } from "@/src/modules/auth/infrastructure/oauth/start-google-auth-navigation";
import styles from "./styles.module.scss";

type SignInWithGoogleButtonProps = {
  callbackUrl: string;
};

export function SignInWithGoogleButton({
  callbackUrl,
}: SignInWithGoogleButtonProps) {
  const handleGoogleSignIn = () => {
    navigateToGoogleAuthStart(callbackUrl);
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
