"use client";

import { Button } from "@/components/ui/button";
import { navigateToGoogleAuthStart } from "@/src/modules/auth/infrastructure/oauth/start-google-auth-navigation";
import styles from "./styles.module.scss";

type SignInWithGoogleButtonProps = {
  callbackUrl: string;
};
const SIGN_IN_WITH_GOOGLE_BUTTON = {
  size: "lg",
  type: "button",
} as const;

export function SignInWithGoogleButton({
  callbackUrl,
}: SignInWithGoogleButtonProps) {
  const handleGoogleSignIn = () => {
    navigateToGoogleAuthStart(callbackUrl);
  };

  return (
    <Button
      type={SIGN_IN_WITH_GOOGLE_BUTTON.type}
      onClick={handleGoogleSignIn}
      size={SIGN_IN_WITH_GOOGLE_BUTTON.size}
      className={styles.SignInWithGoogleButton}
    >
      Iniciar sesion con Google
    </Button>
  );
}
