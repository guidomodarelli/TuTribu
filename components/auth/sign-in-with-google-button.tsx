"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

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
      className="mt-6 w-full rounded-xl"
    >
      Iniciar sesion con Google
    </Button>
  );
}
