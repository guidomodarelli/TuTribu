import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app-sidebar";
import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";
import { CommunitySwitcher } from "@/components/platform/community-switcher";
import { ThemeModeDropdown } from "@/components/theme/theme-mode-dropdown";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ROUTES } from "@/src/constants/routes";
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_OPEN_VALUE,
} from "@/src/constants/sidebar";
import { createRequestModules } from "@/src/modules/setup";
import styles from "./layout.module.scss";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const sidebarCookieValue = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value;
  const defaultSidebarOpen =
    sidebarCookieValue !== undefined
      ? sidebarCookieValue === SIDEBAR_COOKIE_OPEN_VALUE
      : undefined;
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();
  const memberCommunities = authenticatedMember
    ? await modules.communities.useCases.getMemberCommunities()
    : [];

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar
          authenticatedMember={authenticatedMember}
          memberCommunities={memberCommunities}
        />
        <SidebarInset className={styles.PlatformLayout}>
          <header className={styles.PlatformLayout__header}>
            <SidebarTrigger className={styles.PlatformLayout__trigger} />
            <CommunitySwitcher
              memberCommunities={memberCommunities}
              showDropdownTrigger={false}
              showPrivateBadge
            />
            <div className={styles.PlatformLayout__accountMenu}>
              <ThemeModeDropdown />
              <AvatarSessionMenuClient
                authenticatedMember={authenticatedMember}
                signInPath={ROUTES.auth.signIn}
                signOutCallbackUrl={ROUTES.auth.signIn}
              />
            </div>
          </header>
          <div className={styles.PlatformLayout__content}>{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
