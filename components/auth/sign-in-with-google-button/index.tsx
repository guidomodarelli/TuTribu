"use client";

import { useRouter } from "next/navigation";

import { Button } from "beez-ui";
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

export function SignInWithGoogleButton({
  callbackUrl,
}: SignInWithGoogleButtonProps) {
  const { push } = useRouter();

  const handleGoogleSignIn = () => {
    void startGoogleSignIn(callbackUrl).catch(() => {
      push(ROUTES.auth.error);
    });
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
