"use client";

import { useEffect, useRef, useState } from "react";
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsSigningOut(true);

    try {
      const response = await fetch(AUTH_SIGN_OUT_REQUEST.path, {
        method: AUTH_SIGN_OUT_REQUEST.method,
        signal: abortController.signal,
      });

      if (!response.ok) {
        router.push(AUTH_SIGN_OUT_REQUEST.errorPath);
        return;
      }

      router.push(signOutCallbackUrl);
    } catch {
      if (abortController.signal.aborted) {
        return;
      }

      router.push(AUTH_SIGN_OUT_REQUEST.errorPath);
    } finally {
      if (isMountedRef.current) {
        setIsSigningOut(false);
      }

      abortControllerRef.current = null;
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
