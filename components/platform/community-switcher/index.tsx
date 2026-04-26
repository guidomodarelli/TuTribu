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
import { ROUTES } from "@/src/constants/routes";
import type { MemberCommunityListItemResult } from "@/src/modules/communities/application/results/member-community-list-item-result";
import styles from "./styles.module.scss";

const COMMUNITY_SWITCHER_UI = {
  buttonType: "button",
  contentAlign: "start",
  contentSide: "bottom",
  nestedRouteSeparator: "/",
  triggerLabel: "Comunidades",
} as const;

type CommunitySwitcherProps = {
  memberCommunities: MemberCommunityListItemResult[];
};

export function CommunitySwitcher({ memberCommunities }: CommunitySwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activeCommunity = memberCommunities.find((community) => {
    const communityPath = ROUTES.communities.bySlug(community.slug);

    return (
      pathname === communityPath ||
      pathname.startsWith(`${communityPath}${COMMUNITY_SWITCHER_UI.nestedRouteSeparator}`)
    );
  });
  const triggerLabel = activeCommunity?.name ?? COMMUNITY_SWITCHER_UI.triggerLabel;

  const navigateToCreateCommunity = () => {
    router.push(ROUTES.communities.create);
  };

  const navigateToDiscovery = () => {
    router.push(ROUTES.home);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type={COMMUNITY_SWITCHER_UI.buttonType}
          className={styles.CommunitySwitcher}
        >
          <span className={styles.CommunitySwitcher__label}>
            {triggerLabel}
          </span>
          <ChevronDownIcon className={styles.CommunitySwitcher__triggerIcon} />
        </button>
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
          Nueva comunidad
        </DropdownMenuItem>
        <DropdownMenuItem
          className={styles.CommunitySwitcher__item}
          data-active={false}
          onClick={navigateToDiscovery}
        >
          <CompassIcon />
          Descubrir comunidades
        </DropdownMenuItem>
        {memberCommunities.length > 0 ? <DropdownMenuSeparator /> : null}
        {memberCommunities.map((community) => {
          const communityPath = ROUTES.communities.bySlug(community.slug);
          const isActiveCommunity = activeCommunity?.communityId === community.communityId;

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
  );
}
