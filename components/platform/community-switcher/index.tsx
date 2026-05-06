"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  PlusCircleIcon,
  UsersIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/src/constants/routes";
import type { MemberCommunityListItemResult } from "@/src/modules/communities/application/results/member-community-list-item-result";
import styles from "./styles.module.scss";

const COMMUNITY_SWITCHER_UI = {
  buttonType: "button",
  contentAlign: "start",
  contentSide: "bottom",
  nestedRouteSeparator: "/",
  privateBadgeAriaLabel: "Tribu privada",
  privateBadgeLabel: "privada",
  privateBadgeVariant: "outline",
  triggerAriaLabel: "Abrir tribus",
} as const;

type CommunitySwitcherProps = {
  className?: string;
  dropdownTrigger?: React.ReactNode;
  memberCommunities: MemberCommunityListItemResult[];
  showDropdownTrigger?: boolean;
  showPrivateBadge?: boolean;
};

export function CommunitySwitcher({
  className,
  dropdownTrigger,
  memberCommunities,
  showDropdownTrigger = true,
  showPrivateBadge = true,
}: CommunitySwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activeCommunity = memberCommunities.find((community) => {
    const communityPath = ROUTES.communities.bySlug(community.slug);

    return (
      pathname === communityPath ||
      pathname.startsWith(`${communityPath}${COMMUNITY_SWITCHER_UI.nestedRouteSeparator}`)
    );
  });

  const navigateToCreateCommunity = () => {
    router.push(ROUTES.communities.create);
  };

  const navigateToDiscovery = () => {
    router.push(ROUTES.home);
  };

  if (!activeCommunity) {
    return null;
  }

  return (
    <div className={cn(styles.CommunitySwitcher, className)}>
      {showDropdownTrigger ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {dropdownTrigger ?? (
              <button
                type={COMMUNITY_SWITCHER_UI.buttonType}
                className={styles.CommunitySwitcher__trigger}
                aria-label={COMMUNITY_SWITCHER_UI.triggerAriaLabel}
              >
                <ChevronDownIcon className={styles.CommunitySwitcher__triggerIcon} />
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={COMMUNITY_SWITCHER_UI.contentSide}
            align={COMMUNITY_SWITCHER_UI.contentAlign}
            className={styles.CommunitySwitcher__content}
          >
            <DropdownMenuItem
              className={styles.CommunitySwitcher__item}
              data-active={false}
              onClick={navigateToCreateCommunity}
            >
              <PlusCircleIcon />
              Nueva tribu
            </DropdownMenuItem>
            <DropdownMenuItem
              className={styles.CommunitySwitcher__item}
              data-active={false}
              onClick={navigateToDiscovery}
            >
              <CompassIcon />
              Descubrir tribus
            </DropdownMenuItem>
            {memberCommunities.length > 0 ? <DropdownMenuSeparator /> : null}
            {memberCommunities.map((community) => {
              const communityPath = ROUTES.communities.bySlug(community.slug);
              const isActiveCommunity =
                activeCommunity.communityId === community.communityId;

              return (
                <DropdownMenuItem
                  key={community.communityId}
                  className={styles.CommunitySwitcher__item}
                  data-active={isActiveCommunity}
                  onClick={() => router.push(communityPath)}
                >
                  <UsersIcon />
                  <span className={styles.CommunitySwitcher__communityName}>
                    {community.name}
                  </span>
                  {isActiveCommunity ? (
                    <CheckIcon className={styles.CommunitySwitcher__activeIcon} />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {showPrivateBadge ? (
        <Badge
          variant={COMMUNITY_SWITCHER_UI.privateBadgeVariant}
          className={styles.CommunitySwitcher__privateBadge}
          aria-label={COMMUNITY_SWITCHER_UI.privateBadgeAriaLabel}
        >
          {COMMUNITY_SWITCHER_UI.privateBadgeLabel}
        </Badge>
      ) : null}
    </div>
  );
}
