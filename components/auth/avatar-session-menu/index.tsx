"use client";

import Link from "next/link";
import { LogInIcon, LogOutIcon } from "lucide-react";

import { GoogleAccountAvatar } from "@/components/auth/google-account-avatar";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import styles from "./styles.module.scss";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";

type AvatarSessionMenuProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  onSignOut: () => Promise<void>;
  signInPath: string;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AvatarSessionMenu({
  authenticatedMember,
  onSignOut,
  signInPath,
}: AvatarSessionMenuProps) {
  const hasAuthenticatedMember = Boolean(authenticatedMember);
  const avatarName = authenticatedMember?.name ?? "Invitado";
  const avatarEmail = authenticatedMember?.email ?? "Sin correo";
  const avatarFallback =
    authenticatedMember?.avatarFallback ?? (getInitials(avatarName) || "IN");
  const avatarImage = authenticatedMember?.image ?? null;

  const handleSignOut = async () => {
    await onSignOut();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu de cuenta"
          className={styles.AvatarSessionMenu}
        >
          <GoogleAccountAvatar
            fallback={avatarFallback}
            image={avatarImage}
            name={avatarName}
            email={avatarEmail}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className={styles.AvatarSessionMenu__content}
      >
        <div className={styles.AvatarSessionMenu__header}>
          <Avatar>
            {avatarImage ? <AvatarImage alt={avatarName} src={avatarImage} /> : null}
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
          <div className={styles.AvatarSessionMenu__headerIdentity}>
            <span className={styles.AvatarSessionMenu__headerName}>{avatarName}</span>
            <span className={styles.AvatarSessionMenu__headerEmail}>{avatarEmail}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        {hasAuthenticatedMember ? (
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOutIcon />
            Cerrar sesion
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href={signInPath}>
              <LogInIcon />
              Iniciar sesion
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
