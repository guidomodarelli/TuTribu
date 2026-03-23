import Link from "next/link";
import { HomeIcon, ShieldAlertIcon } from "lucide-react";

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
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={siteConfig.name}>
              <Link href="/">
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  AO
                </span>
                <span>{siteConfig.name}</span>
              </Link>
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
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
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
