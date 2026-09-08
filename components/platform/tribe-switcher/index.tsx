"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  PlusCircleIcon,
  UsersIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Badge, cn } from "beez-ui";


import { ROUTES } from "@/src/constants/routes";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import styles from "./styles.module.scss";

const TRIBE_SWITCHER_UI = {
  buttonType: "button",
  contentAlign: "start",
  contentSide: "bottom",
  nestedRouteSeparator: "/",
  privateBadgeAriaLabel: "Tribu privada",
  privateBadgeLabel: "Tribu privada",
  privateBadgeVariant: "outline",
  triggerAriaLabel: "Abrir tribus",
} as const;

type TribeSwitcherProps = {
  className?: string;
  dropdownTrigger?: React.ReactNode;
  memberTribes: MemberTribeListItemResult[];
  onNavigate?: () => void;
  showDropdownTrigger?: boolean;
  showPrivateBadge?: boolean;
};

export function TribeSwitcher({
  className,
  dropdownTrigger,
  memberTribes,
  onNavigate,
  showDropdownTrigger = true,
  showPrivateBadge = true,
}: TribeSwitcherProps) {
  const pathname = usePathname();
  const { push } = useRouter();
  const activeTribe = memberTribes.find((tribe) => {
    const tribePath = ROUTES.tribes.bySlug(tribe.slug);

    return (
      pathname === tribePath ||
      pathname.startsWith(`${tribePath}${TRIBE_SWITCHER_UI.nestedRouteSeparator}`)
    );
  });

  const navigateToCreateTribe = () => {
    push(ROUTES.tribes.create);
    onNavigate?.();
  };

  const navigateToDiscovery = () => {
    push(ROUTES.home);
    onNavigate?.();
  };

  const navigateToTribe = (tribePath: string) => {
    push(tribePath);
    onNavigate?.();
  };

  if (!activeTribe) {
    return null;
  }

  return (
    <div className={cn(styles.TribeSwitcher, className)}>
      {showDropdownTrigger ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {dropdownTrigger ?? (
              <button
                type={TRIBE_SWITCHER_UI.buttonType}
                className={styles.TribeSwitcher__trigger}
                aria-label={TRIBE_SWITCHER_UI.triggerAriaLabel}
              >
                <ChevronDownIcon className={styles.TribeSwitcher__triggerIcon} />
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={TRIBE_SWITCHER_UI.contentSide}
            align={TRIBE_SWITCHER_UI.contentAlign}
            className={styles.TribeSwitcher__content}
          >
            <DropdownMenuItem
              className={styles.TribeSwitcher__item}
              data-active={false}
              onClick={navigateToCreateTribe}
            >
              <PlusCircleIcon />
              Nueva tribu
            </DropdownMenuItem>
            <DropdownMenuItem
              className={styles.TribeSwitcher__item}
              data-active={false}
              onClick={navigateToDiscovery}
            >
              <CompassIcon />
              Descubrir tribus
            </DropdownMenuItem>
            {memberTribes.length > 0 ? <DropdownMenuSeparator /> : null}
            {memberTribes.map((tribe) => {
              const tribePath = ROUTES.tribes.bySlug(tribe.slug);
              const isActiveTribe =
                activeTribe.tribeId === tribe.tribeId;

              return (
                <DropdownMenuItem
                  key={tribe.tribeId}
                  className={styles.TribeSwitcher__item}
                  data-active={isActiveTribe}
                  onClick={() => navigateToTribe(tribePath)}
                >
                  <UsersIcon />
                  <span className={styles.TribeSwitcher__tribeName}>
                    {tribe.name}
                  </span>
                  {isActiveTribe ? (
                    <CheckIcon className={styles.TribeSwitcher__activeIcon} />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {showPrivateBadge ? (
        <Badge
          variant={TRIBE_SWITCHER_UI.privateBadgeVariant}
          className={styles.TribeSwitcher__privateBadge}
          aria-label={TRIBE_SWITCHER_UI.privateBadgeAriaLabel}
        >
          {TRIBE_SWITCHER_UI.privateBadgeLabel}
        </Badge>
      ) : null}
    </div>
  );
}
