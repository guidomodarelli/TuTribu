"use client";

import { CheckIcon, CompassIcon, PlusCircleIcon, UsersIcon } from "lucide-react";
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

const primaryNavigation = [
  {
    href: ROUTES.home,
    icon: CompassIcon,
    label: "Descubrir comunidades",
  },
];
const APP_SIDEBAR_UI = {
  brandButtonSize: "lg",
  collapsible: "icon",
  createCommunityTooltip: "Nueva comunidad",
  variant: "sidebar",
} as const;

type AppSidebarProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  memberCommunities: MemberCommunityListItemResult[];
};

export function AppSidebar({
  authenticatedMember,
  memberCommunities,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isCreateCommunityActive = pathname === ROUTES.communities.create;

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
        <SidebarGroup>
          <SidebarGroupLabel>Navegacion</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNavigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={pathname === item.href}
                    onClick={() => router.push(item.href)}
                  >
                    <item.icon />
                    <span className={styles.AppSidebar__itemLabel}>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
