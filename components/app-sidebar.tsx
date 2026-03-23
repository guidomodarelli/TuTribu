"use client";

import { HomeIcon, ShieldAlertIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import { siteConfig } from "@/src/shared/config/site";
import { AvatarSessionMenu } from "@/components/auth/avatar-session-menu";
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
  {
    href: "/auth/error",
    icon: ShieldAlertIcon,
    label: "Pantalla de error",
  },
];

export function AppSidebar({ authenticatedMember }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={siteConfig.name}
              isActive={pathname === "/"}
              onClick={() => router.push("/")}
            >
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  AO
                </span>
                <span className="group-data-[collapsible=icon]:hidden">{siteConfig.name}</span>
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
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
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
