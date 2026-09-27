"use client";

import { useState } from "react";
import { AccountMenu, toast } from "beez-ui";

import { useMemberSessionKeepAlive } from "@/hooks/use-member-session-keep-alive";
import { replaceCurrentPageWithUrl } from "@/lib/browser-navigation";
import { signOutMember } from "@/src/modules/auth/infrastructure/better-auth/client";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import styles from "./styles.module.scss";

const AUTH_SIGN_OUT_REQUEST = {
  errorMessage: "No pudimos cerrar la sesión. Intentá de nuevo.",
} as const;

/** Identity shown to visitors without a session. */
const GUEST_ACCOUNT = {
  email: "Sin correo",
  name: "Invitado",
} as const;

const ACCOUNT_MENU_STATUS = {
  authenticated: "authenticated",
  unauthenticated: "unauthenticated",
} as const;

type AvatarSessionMenuClientProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  signInPath: string;
  signOutCallbackUrl: string;
};

/**
 * Client container of the account menu: keeps the member session alive, owns
 * the sign-out request, and ignores repeated clicks while it is in flight.
 *
 * A successful sign-out loads `signOutCallbackUrl` as a full document that
 * replaces the current history entry: the router cache and in-memory member
 * state are dropped and Back cannot show the signed-in page again. A failure
 * keeps the member on the current page with a Spanish toast and the action
 * enabled again, so they can retry where they were. The menu itself is the
 * shared `AccountMenu`.
 */
export function AvatarSessionMenuClient({
  authenticatedMember,
  signInPath,
  signOutCallbackUrl,
}: AvatarSessionMenuClientProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  useMemberSessionKeepAlive(authenticatedMember?.id ?? null);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOutMember();
    } catch {
      // Recoverable: the session is still valid, so the member stays here and retries.
      toast.error(AUTH_SIGN_OUT_REQUEST.errorMessage);
      setIsSigningOut(false);
      return;
    }

    // Stays disabled while the browser leaves the page.
    replaceCurrentPageWithUrl(signOutCallbackUrl);
  };

  return (
    <div className={styles.AvatarSessionMenuClient}>
      <AccountMenu
        avatarFallback={authenticatedMember?.avatarFallback}
        email={authenticatedMember?.email ?? GUEST_ACCOUNT.email}
        image={authenticatedMember?.image ?? null}
        name={authenticatedMember?.name ?? GUEST_ACCOUNT.name}
        onSignOut={handleSignOut}
        signInHref={signInPath}
        signOutDisabled={isSigningOut}
        status={authenticatedMember ? ACCOUNT_MENU_STATUS.authenticated : ACCOUNT_MENU_STATUS.unauthenticated}
      />
    </div>
  );
}
