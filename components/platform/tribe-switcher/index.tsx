"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  PlusCircleIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactElement } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DropdownMenu, type DropdownItem, Badge, cn } from "@golfo/ui";

import { ROUTES } from "@/src/constants/routes";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import styles from "./styles.module.scss";

const TRIBE_SWITCHER_UI = {
  buttonType: "button",
  contentAlign: "start",
  contentSide: "bottom",
  menuLabel: "Tribus",
  nestedRouteSeparator: "/",
  privateBadgeAriaLabel: "Tribu privada",
  privateBadgeLabel: "Tribu privada",
  privateBadgeSize: "sm",
  privateBadgeTone: "info",
  triggerAriaLabel: "Abrir tribus",
} as const;

/** `aria-current` token of the tribe being viewed; the check mark alone is visual only. */
const ACTIVE_TRIBE_CURRENT = "page";

type TribeSwitcherProps = {
  className?: string;
  /** Own trigger of the menu; it must accept a ref and be focusable. */
  dropdownTrigger?: ReactElement;
  memberTribes: MemberTribeListItemResult[];
  onNavigate?: () => void;
  showDropdownTrigger?: boolean;
  showPrivateBadge?: boolean;
};

/**
 * @param memberTribes - Tribes of the member.
 * @param pathname - Current route.
 * @returns The tribe whose route (or a nested one) is being viewed, if any.
 */
function findActiveTribe(memberTribes: MemberTribeListItemResult[], pathname: string) {
  return memberTribes.find((tribe) => {
    const tribePath = ROUTES.tribes.bySlug(tribe.slug);

    return (
      pathname === tribePath ||
      pathname.startsWith(`${tribePath}${TRIBE_SWITCHER_UI.nestedRouteSeparator}`)
    );
  });
}

/** Navigations the menu items trigger. */
type TribeSwitcherNavigation = {
  navigateToCreateTribe: () => void;
  navigateToDiscovery: () => void;
  navigateToTribe: (tribePath: string) => void;
};

/**
 * @param memberTribes - Tribes of the member.
 * @param activeTribe - Tribe being viewed.
 * @param navigation - Navigations of the items.
 * @returns Create and discover items, then one item per tribe; the active one carries the check mark and `aria-current`.
 */
function buildTribeSwitcherMenuItems(
  memberTribes: MemberTribeListItemResult[],
  activeTribe: MemberTribeListItemResult,
  { navigateToCreateTribe, navigateToDiscovery, navigateToTribe }: TribeSwitcherNavigation
): DropdownItem[] {
  return [
    {
      className: styles.TribeSwitcher__item,
      icon: <PlusCircleIcon />,
      itemProps: { "data-active": false },
      label: "Nueva tribu",
      onSelect: navigateToCreateTribe,
    },
    {
      className: styles.TribeSwitcher__item,
      icon: <CompassIcon />,
      itemProps: { "data-active": false },
      label: "Descubrir tribus",
      onSelect: navigateToDiscovery,
    },
    ...memberTribes.map((tribe, tribeIndex): DropdownItem => {
      const isActiveTribe = activeTribe.tribeId === tribe.tribeId;

      return {
        className: styles.TribeSwitcher__item,
        icon: <UsersIcon />,
        id: tribe.tribeId,
        itemProps: {
          "aria-current": isActiveTribe ? ACTIVE_TRIBE_CURRENT : undefined,
          "data-active": isActiveTribe,
        },
        label: tribe.name,
        onSelect: () => navigateToTribe(ROUTES.tribes.bySlug(tribe.slug)),
        separatorBefore: tribeIndex === 0,
        trailing: isActiveTribe ? (
          <CheckIcon aria-hidden="true" className={styles.TribeSwitcher__activeIcon} />
        ) : undefined,
      };
    }),
  ];
}

/**
 * Tribe menu of the header and the sidebar brand: create, discover, and jump
 * between the member's tribes. Renders only inside a tribe route; the check
 * mark and `aria-current` identify the tribe being viewed.
 */
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
  const activeTribe = findActiveTribe(memberTribes, pathname);

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

  const menuItems = buildTribeSwitcherMenuItems(memberTribes, activeTribe, {
    navigateToCreateTribe,
    navigateToDiscovery,
    navigateToTribe,
  });

  return (
    <div className={cn(styles.TribeSwitcher, className)}>
      {showDropdownTrigger ? (
        <DropdownMenu
          align={TRIBE_SWITCHER_UI.contentAlign}
          contentClassName={styles.TribeSwitcher__content}
          items={menuItems}
          label={TRIBE_SWITCHER_UI.menuLabel}
          side={TRIBE_SWITCHER_UI.contentSide}
          trigger={
            dropdownTrigger ?? (
              <button
                type={TRIBE_SWITCHER_UI.buttonType}
                className={styles.TribeSwitcher__trigger}
                aria-label={TRIBE_SWITCHER_UI.triggerAriaLabel}
              >
                <ChevronDownIcon aria-hidden="true" className={styles.TribeSwitcher__triggerIcon} />
              </button>
            )
          }
        />
      ) : null}
      {showPrivateBadge ? (
        <Badge
          size={TRIBE_SWITCHER_UI.privateBadgeSize}
          tone={TRIBE_SWITCHER_UI.privateBadgeTone}
          aria-label={TRIBE_SWITCHER_UI.privateBadgeAriaLabel}
        >
          {TRIBE_SWITCHER_UI.privateBadgeLabel}
        </Badge>
      ) : null}
    </div>
  );
}
