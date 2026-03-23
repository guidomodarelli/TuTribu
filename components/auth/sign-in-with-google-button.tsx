"use client";

import { signIn } from "next-auth/react";

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
    <button
      type="button"
      onClick={handleGoogleSignIn}
      className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-border/80 bg-secondary/80 px-5 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      Iniciar sesion con Google
    </button>
  );
}
