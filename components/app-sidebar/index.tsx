"use client";

import {
  CalendarDaysIcon,
  CheckIcon,
  CompassIcon,
  HomeIcon,
  InfoIcon,
  PlusCircleIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { siteConfig } from "@/lib/site-config";
import { ROUTES } from "@/src/constants/routes";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { MemberCommunityListItemResult } from "@/src/modules/communities/application/results/member-community-list-item-result";
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

const discoverCommunitiesNavigationItem = {
  href: ROUTES.home,
  icon: CompassIcon,
  label: "Descubrir comunidades",
} as const;
const communitySectionNavigation = [
  {
    hrefBuilder: ROUTES.communities.bySlug,
    icon: HomeIcon,
    label: "Inicio",
    matchPath: (pathname: string, communitySlug: string) =>
      pathname === ROUTES.communities.bySlug(communitySlug),
  },
  {
    hrefBuilder: ROUTES.communities.events,
    icon: CalendarDaysIcon,
    label: "Eventos",
    matchPath: (pathname: string, communitySlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.communities.events(communitySlug)),
  },
  {
    hrefBuilder: ROUTES.communities.members,
    icon: UsersIcon,
    label: "Miembros",
    matchPath: (pathname: string, communitySlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.communities.members(communitySlug)),
  },
  {
    hrefBuilder: ROUTES.communities.ranking,
    icon: TrophyIcon,
    label: "Ranking",
    matchPath: (pathname: string, communitySlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.communities.ranking(communitySlug)),
  },
  {
    hrefBuilder: ROUTES.communities.about,
    icon: InfoIcon,
    label: "Acerca de",
    matchPath: (pathname: string, communitySlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.communities.about(communitySlug)),
  },
] as const;
const APP_SIDEBAR_UI = {
  brandButtonSize: "lg",
  collapsible: "icon",
  createCommunityTooltip: "Nueva comunidad",
  nestedRouteSeparator: "/",
  variant: "sidebar",
} as const;

type AppSidebarProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  memberCommunities: MemberCommunityListItemResult[];
};

function isSameOrNestedPath(pathname: string, routePath: string): boolean {
  return (
    pathname === routePath ||
    pathname.startsWith(`${routePath}${APP_SIDEBAR_UI.nestedRouteSeparator}`)
  );
}

export function AppSidebar({
  authenticatedMember,
  memberCommunities,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isCreateCommunityActive = pathname === ROUTES.communities.create;
  const activeCommunity = memberCommunities.find((community) =>
    isSameOrNestedPath(pathname, ROUTES.communities.bySlug(community.slug))
  );

  return (
    <Sidebar
      collapsible={APP_SIDEBAR_UI.collapsible}
      variant={APP_SIDEBAR_UI.variant}
      className={styles.AppSidebar}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size={APP_SIDEBAR_UI.brandButtonSize}
              tooltip={siteConfig.name}
              isActive={pathname === ROUTES.home}
              onClick={() => router.push(ROUTES.home)}
            >
              <span className={styles.AppSidebar__brandMark}>AO</span>
              <span className={styles.AppSidebar__brandName}>{siteConfig.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className={styles.AppSidebar__separator} />
      <SidebarContent>
        {activeCommunity ? (
          <SidebarGroup>
            <SidebarGroupLabel>Comunidad</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {communitySectionNavigation.map((item) => {
                  const sectionPath = item.hrefBuilder(activeCommunity.slug);
                  const isSectionActive = item.matchPath(
                    pathname,
                    activeCommunity.slug
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
        <SidebarGroup>
          <SidebarGroupLabel>Comunidades</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={APP_SIDEBAR_UI.createCommunityTooltip}
                  isActive={isCreateCommunityActive}
                  onClick={() => router.push(ROUTES.communities.create)}
                >
                  <PlusCircleIcon />
                  <span className={styles.AppSidebar__itemLabel}>Nueva comunidad</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={discoverCommunitiesNavigationItem.label}
                  isActive={pathname === discoverCommunitiesNavigationItem.href}
                  onClick={() => router.push(discoverCommunitiesNavigationItem.href)}
                >
                  <discoverCommunitiesNavigationItem.icon />
                  <span className={styles.AppSidebar__itemLabel}>
                    {discoverCommunitiesNavigationItem.label}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {memberCommunities.map((community) => {
                const communityPath = ROUTES.communities.bySlug(community.slug);
                const isCommunityActive =
                  pathname === communityPath || pathname.startsWith(`${communityPath}/`);

                return (
                  <SidebarMenuItem key={community.communityId}>
                    <SidebarMenuButton
                      tooltip={community.name}
                      isActive={isCommunityActive}
                      onClick={() => router.push(communityPath)}
                    >
                      <UsersIcon />
                      <span className={styles.AppSidebar__itemLabel}>{community.name}</span>
                      {isCommunityActive ? (
                        <CheckIcon className={styles.AppSidebar__activeIcon} />
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            {authenticatedMember && memberCommunities.length === 0 ? (
              <p className={styles.AppSidebar__emptyState}>
                Todavia no formas parte de ninguna comunidad
              </p>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
