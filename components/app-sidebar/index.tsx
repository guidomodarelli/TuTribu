"use client";

import { HomeIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import { siteConfig } from "@/src/shared/config/site";
import { AvatarSessionMenu } from "@/components/auth/avatar-session-menu";
import styles from "./styles.module.scss";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

type AppSidebarProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
};

const primaryNavigation = [
  {
    href: "/",
    icon: HomeIcon,
    label: "Inicio",
  },
];

export function AppSidebar({ authenticatedMember }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sidebar collapsible="icon" variant="inset" className={styles.AppSidebar}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={siteConfig.name}
              isActive={pathname === "/"}
              onClick={() => router.push("/")}
            >
              <span className={styles.AppSidebar__brandMark}>AO</span>
              <span className={styles.AppSidebar__brandName}>{siteConfig.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
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
      </SidebarContent>
      <SidebarFooter>
        <AvatarSessionMenu
          authenticatedMember={authenticatedMember}
          signInPath="/auth/signin"
          signOutCallbackUrl="/auth/signin"
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
