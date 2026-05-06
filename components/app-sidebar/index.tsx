"use client";

import { useEffect, useMemo } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  FlameKindlingIcon,
  InfoIcon,
  PlusCircleIcon,
  SignpostBigIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { TribeSwitcher } from "@/components/platform/tribe-switcher";
import { siteConfig } from "@/lib/site-config";
import { ROUTES } from "@/src/constants/routes";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import styles from "./styles.module.scss";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const discoverTribesNavigationItem = {
  href: ROUTES.home,
  icon: CompassIcon,
  label: "Descubrir tribus",
} as const;
const tribeSectionNavigation = [
  {
    hrefBuilder: ROUTES.tribes.bySlug,
    icon: FlameKindlingIcon,
    label: "Inicio",
    matchPath: (pathname: string, tribeSlug: string) =>
      pathname === ROUTES.tribes.bySlug(tribeSlug),
  },
  {
    hrefBuilder: ROUTES.tribes.channels,
    icon: SignpostBigIcon,
    label: "Canales",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.channels(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.events,
    icon: CalendarDaysIcon,
    label: "Eventos",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.events(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.tribemates,
    icon: UsersIcon,
    label: "Integrantes",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.tribemates(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.ranking,
    icon: TrophyIcon,
    label: "Ranking",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.ranking(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.about,
    icon: InfoIcon,
    label: "Acerca de",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.about(tribeSlug)),
  },
] as const;
const APP_SIDEBAR_UI = {
  brandButtonSize: "lg",
  brandMarkLength: 2,
  channelsSectionLabel: "Canales",
  collapsible: "icon",
  createTribeTooltip: "Nueva tribu",
  nestedRouteSeparator: "/",
  variant: "sidebar",
} as const;

const TRIBE_CHANNEL_MANAGER_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

type AppSidebarProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  memberTribes: MemberTribeListItemResult[];
};

function canManageTribeChannels(
  tribe: MemberTribeListItemResult
): boolean {
  return (
    tribe.role === TRIBE_CHANNEL_MANAGER_ROLE.leader ||
    tribe.role === TRIBE_CHANNEL_MANAGER_ROLE.guardian
  );
}

function getVisibleTribeSectionNavigation(
  tribe: MemberTribeListItemResult
) {
  return tribeSectionNavigation.filter(
    (item) =>
      item.label !== APP_SIDEBAR_UI.channelsSectionLabel ||
      canManageTribeChannels(tribe)
  );
}

function isSameOrNestedPath(pathname: string, routePath: string): boolean {
  return (
    pathname === routePath ||
    pathname.startsWith(`${routePath}${APP_SIDEBAR_UI.nestedRouteSeparator}`)
  );
}

function getTribeBrandMark(tribeName: string): string {
  return tribeName
    .trim()
    .slice(0, APP_SIDEBAR_UI.brandMarkLength)
    .toUpperCase();
}

export function AppSidebar({
  authenticatedMember,
  memberTribes,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isCreateTribeActive = pathname === ROUTES.tribes.create;
  const activeTribe = memberTribes.find((tribe) =>
    isSameOrNestedPath(pathname, ROUTES.tribes.bySlug(tribe.slug))
  );
  const brandName = activeTribe?.name ?? siteConfig.name;
  const brandMark = activeTribe
    ? getTribeBrandMark(activeTribe.name)
    : siteConfig.brandMark;
  const brandPath = activeTribe
    ? ROUTES.tribes.bySlug(activeTribe.slug)
    : ROUTES.home;
  const visibleTribeSectionNavigation = useMemo(
    () =>
      activeTribe
        ? getVisibleTribeSectionNavigation(activeTribe)
        : [],
    [activeTribe]
  );

  useEffect(() => {
    if (!activeTribe) {
      return;
    }

    visibleTribeSectionNavigation.forEach((item) => {
      router.prefetch(item.hrefBuilder(activeTribe.slug));
    });
  }, [activeTribe, router, visibleTribeSectionNavigation]);

  return (
    <Sidebar
      collapsible={APP_SIDEBAR_UI.collapsible}
      variant={APP_SIDEBAR_UI.variant}
      className={styles.AppSidebar}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {activeTribe ? (
              <TribeSwitcher
                className={styles.AppSidebar__tribeSwitcher}
                dropdownTrigger={
                  <SidebarMenuButton
                    size={APP_SIDEBAR_UI.brandButtonSize}
                    isActive={pathname === brandPath}
                  >
                    <span className={styles.AppSidebar__brandMark}>{brandMark}</span>
                    <span className={styles.AppSidebar__brandName}>{brandName}</span>
                    <ChevronDownIcon className={styles.AppSidebar__brandChevron} />
                  </SidebarMenuButton>
                }
                memberTribes={memberTribes}
                showPrivateBadge={false}
              />
            ) : (
              <SidebarMenuButton
                size={APP_SIDEBAR_UI.brandButtonSize}
                tooltip={brandName}
                isActive={pathname === brandPath}
                onClick={() => router.push(brandPath)}
              >
                <span className={styles.AppSidebar__brandMark}>{brandMark}</span>
                <span className={styles.AppSidebar__brandName}>{brandName}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className={styles.AppSidebar__separator} />
      <SidebarContent>
        {activeTribe ? (
          <SidebarGroup>
            <SidebarGroupLabel>Tribu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleTribeSectionNavigation.map((item) => {
                  const sectionPath = item.hrefBuilder(activeTribe.slug);
                  const isSectionActive = item.matchPath(
                    pathname,
                    activeTribe.slug
                  );

                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        tooltip={item.label}
                        isActive={isSectionActive}
                        onClick={() => router.push(sectionPath)}
                      >
                        <item.icon />
                        <span className={styles.AppSidebar__itemLabel}>
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {activeTribe ? null : (
          <SidebarGroup>
            <SidebarGroupLabel>Tribus</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={APP_SIDEBAR_UI.createTribeTooltip}
                    isActive={isCreateTribeActive}
                    onClick={() => router.push(ROUTES.tribes.create)}
                  >
                    <PlusCircleIcon />
                    <span className={styles.AppSidebar__itemLabel}>Nueva tribu</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={discoverTribesNavigationItem.label}
                    isActive={pathname === discoverTribesNavigationItem.href}
                    onClick={() => router.push(discoverTribesNavigationItem.href)}
                  >
                    <discoverTribesNavigationItem.icon />
                    <span className={styles.AppSidebar__itemLabel}>
                      {discoverTribesNavigationItem.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {memberTribes.map((tribe) => {
                  const tribePath = ROUTES.tribes.bySlug(tribe.slug);
                  const isTribeActive =
                    pathname === tribePath ||
                    pathname.startsWith(`${tribePath}/`);

                  return (
                    <SidebarMenuItem key={tribe.tribeId}>
                      <SidebarMenuButton
                        tooltip={tribe.name}
                        isActive={isTribeActive}
                        onClick={() => router.push(tribePath)}
                      >
                        <UsersIcon />
                        <span className={styles.AppSidebar__itemLabel}>
                          {tribe.name}
                        </span>
                        {isTribeActive ? (
                          <CheckIcon className={styles.AppSidebar__activeIcon} />
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
              {authenticatedMember && memberTribes.length === 0 ? (
                <p className={styles.AppSidebar__emptyState}>
                  Todavia no formas parte de ninguna tribu
                </p>
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
