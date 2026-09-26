"use client";

import { LogInIcon, LogOutIcon } from "lucide-react";

import { Link } from "@/components/navigation/link";
import { Avatar, AvatarFallback, AvatarImage, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "beez-ui";
import styles from "./styles.module.scss";

import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";

type AvatarSessionMenuProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  onSignOut: () => Promise<void>;
  signOutDisabled?: boolean;
  signInPath: string;
};

const AVATAR_INITIALS_SEPARATOR = " ";
const AVATAR_INITIALS_MAX_PARTS = 2;
const AVATAR_IMAGE_LOADING_PRIORITY = "eager";
const AVATAR_SESSION_FALLBACK = {
  authenticatedFallback: "IN",
  guestEmail: "Sin correo",
  guestName: "Invitado",
} as const;
const AVATAR_SESSION_MENU_UI = {
  accountMenuLabel: "Menú de cuenta",
  avatarLoading: AVATAR_IMAGE_LOADING_PRIORITY,
  buttonType: "button",
  dropdownAlign: "end",
  dropdownSide: "bottom",
} as const;

/**
 * Builds up to two initials from a display name, ignoring repeated spaces.
 * @param name - Member display name.
 * @returns Uppercase initials, or an empty string for a blank name.
 */
function getInitials(name: string): string {
  return name
    .trim()
    .split(AVATAR_INITIALS_SEPARATOR)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, AVATAR_INITIALS_MAX_PARTS);
}

/**
 * Account menu of the platform header: the avatar trigger, the member
 * identity, and the sign-in or sign-out action. Presentational: the session
 * and the sign-out flow come from the client container.
 */
export function AvatarSessionMenu({
  authenticatedMember,
  onSignOut,
  signOutDisabled = false,
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
          <Avatar>
            {avatarImage ? (
              <AvatarImage
                alt={avatarName}
                loading={AVATAR_SESSION_MENU_UI.avatarLoading}
                src={avatarImage}
              />
            ) : null}
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={AVATAR_SESSION_MENU_UI.dropdownSide}
        align={AVATAR_SESSION_MENU_UI.dropdownAlign}
        className={styles.AvatarSessionMenu__content}
      >
        <div className={styles.AvatarSessionMenu__header}>
          <div className={styles.AvatarSessionMenu__headerIdentity}>
            <span className={styles.AvatarSessionMenu__headerName}>{avatarName}</span>
            <span className={styles.AvatarSessionMenu__headerEmail}>{avatarEmail}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        {hasAuthenticatedMember ? (
          <DropdownMenuItem onClick={handleSignOut} disabled={signOutDisabled}>
            <LogOutIcon aria-hidden="true" />
            Cerrar sesión
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href={signInPath}>
              <LogInIcon aria-hidden="true" />
              Iniciar sesión
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
