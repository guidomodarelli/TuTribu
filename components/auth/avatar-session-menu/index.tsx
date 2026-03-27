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

const AVATAR_INITIALS_SEPARATOR = " ";
const AVATAR_INITIALS_MAX_PARTS = 2;
const AVATAR_SESSION_FALLBACK = {
  authenticatedFallback: "IN",
  guestEmail: "Sin correo",
  guestName: "Invitado",
} as const;
const AVATAR_SESSION_MENU_UI = {
  accountMenuLabel: "Menu de cuenta",
  buttonType: "button",
  dropdownAlign: "start",
  dropdownSide: "top",
} as const;

function getInitials(name: string): string {
  return name
    .split(AVATAR_INITIALS_SEPARATOR)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, AVATAR_INITIALS_MAX_PARTS);
}

export function AvatarSessionMenu({
  authenticatedMember,
  onSignOut,
  signInPath,
}: AvatarSessionMenuProps) {
  const hasAuthenticatedMember = Boolean(authenticatedMember);
  const avatarName = authenticatedMember?.name ?? AVATAR_SESSION_FALLBACK.guestName;
  const avatarEmail = authenticatedMember?.email ?? AVATAR_SESSION_FALLBACK.guestEmail;
  const avatarFallback =
    authenticatedMember?.avatarFallback ??
    (getInitials(avatarName) || AVATAR_SESSION_FALLBACK.authenticatedFallback);
  const avatarImage = authenticatedMember?.image ?? null;

  const handleSignOut = async () => {
    await onSignOut();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type={AVATAR_SESSION_MENU_UI.buttonType}
          aria-label={AVATAR_SESSION_MENU_UI.accountMenuLabel}
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
        side={AVATAR_SESSION_MENU_UI.dropdownSide}
        align={AVATAR_SESSION_MENU_UI.dropdownAlign}
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
