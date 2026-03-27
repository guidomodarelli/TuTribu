"use client";

import { useRouter } from "next/navigation";

import { AvatarSessionMenu } from "@/components/auth/avatar-session-menu";
import { ROUTES } from "@/src/constants/routes";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import styles from "./styles.module.scss";

const AUTH_SIGN_OUT_REQUEST = {
  errorPath: ROUTES.auth.error,
  method: "POST",
  path: ROUTES.auth.signOut,
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
  const router = useRouter();

  const handleSignOut = async () => {
    const response = await fetch(AUTH_SIGN_OUT_REQUEST.path, {
      method: AUTH_SIGN_OUT_REQUEST.method,
    });

    if (!response.ok) {
      router.push(AUTH_SIGN_OUT_REQUEST.errorPath);
      return;
    }

    router.push(signOutCallbackUrl);
  };

  return (
    <div className={styles.AvatarSessionMenuClient}>
      <AvatarSessionMenu
        authenticatedMember={authenticatedMember}
        signInPath={signInPath}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
