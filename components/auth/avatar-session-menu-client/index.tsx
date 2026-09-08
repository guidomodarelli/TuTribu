"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "beez-ui";

import { AvatarSessionMenu } from "@/components/auth/avatar-session-menu";
import { ROUTES } from "@/src/constants/routes";
import { signOutMember } from "@/src/modules/auth/infrastructure/better-auth/client";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import styles from "./styles.module.scss";

const AUTH_SIGN_OUT_REQUEST = {
  errorMessage: "No pudimos cerrar la sesion. Intenta de nuevo.",
  errorPath: ROUTES.auth.error,
} as const;

type AvatarSessionMenuClientProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  signInPath: string;
  signOutCallbackUrl: string;
};

export function AvatarSessionMenuClient({
  authenticatedMember,
  signInPath,
  signOutCallbackUrl,
}: AvatarSessionMenuClientProps) {
  const { push } = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOutMember();
      push(signOutCallbackUrl);
    } catch {
      toast.error(AUTH_SIGN_OUT_REQUEST.errorMessage);
      push(AUTH_SIGN_OUT_REQUEST.errorPath);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className={styles.AvatarSessionMenuClient}>
      <AvatarSessionMenu
        authenticatedMember={authenticatedMember}
        signInPath={signInPath}
        onSignOut={handleSignOut}
        signOutDisabled={isSigningOut}
      />
    </div>
  );
}
