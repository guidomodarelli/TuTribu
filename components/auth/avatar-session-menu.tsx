"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogInIcon, LogOutIcon } from "lucide-react";

import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import { GoogleAccountAvatar } from "@/components/auth/google-account-avatar";
import styles from "./avatar-session-menu.module.scss";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AvatarSessionMenuProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  signInPath: string;
  signOutCallbackUrl: string;
};

export function AvatarSessionMenu({
  authenticatedMember,
  signInPath,
  signOutCallbackUrl,
}: AvatarSessionMenuProps) {
  const hasAuthenticatedMember = Boolean(authenticatedMember);
  const avatarName = authenticatedMember?.name ?? "Invitado";
  const avatarFallback = authenticatedMember?.avatarFallback ?? "IN";
  const avatarImage = authenticatedMember?.image ?? null;

  const handleSignOut = async () => {
    await signOut({ callbackUrl: signOutCallbackUrl });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu de cuenta"
          className={styles.AvatarSessionMenu}
        >
          <GoogleAccountAvatar fallback={avatarFallback} image={avatarImage} name={avatarName} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={styles.AvatarSessionMenu__content}>
        <DropdownMenuLabel>
          {hasAuthenticatedMember ? `Conectado como ${avatarName}` : "Acceso de invitado"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasAuthenticatedMember ? (
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOutIcon className={styles.AvatarSessionMenu__icon} />
            Cerrar sesion
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href={signInPath}>
              <LogInIcon className={styles.AvatarSessionMenu__icon} />
              Iniciar sesion
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
