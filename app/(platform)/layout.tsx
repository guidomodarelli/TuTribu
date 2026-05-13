import { cookies } from "next/headers";
import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";
import { TribeSwitcher } from "@/components/platform/tribe-switcher";
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

type PlatformLayoutShellProps = Readonly<{
  authenticatedMember: React.ComponentProps<
    typeof AppSidebar
  >["authenticatedMember"];
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
  memberTribes: React.ComponentProps<typeof AppSidebar>["memberTribes"];
}>;

function PlatformLayoutFallback() {
  return (
    <div className={styles.PlatformLayoutFallback}>
      <aside className={styles.PlatformLayoutFallback__sidebar} />
      <main className={styles.PlatformLayoutFallback__main}>
        <header className={styles.PlatformLayoutFallback__header} />
        <div className={styles.PlatformLayoutFallback__content} />
      </main>
    </div>
  );
}

function PlatformLayoutShell({
  authenticatedMember,
  children,
  defaultSidebarOpen,
  memberTribes,
}: PlatformLayoutShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar
          authenticatedMember={authenticatedMember}
          memberTribes={memberTribes}
        />
        <SidebarInset className={styles.PlatformLayout}>
          <header className={styles.PlatformLayout__header}>
            <SidebarTrigger className={styles.PlatformLayout__trigger} />
            <TribeSwitcher
              memberTribes={memberTribes}
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

export async function PlatformLayoutContent({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, modules] = await Promise.all([
    cookies(),
    createRequestModules(),
  ]);
  const sidebarCookieValue = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value;
  const defaultSidebarOpen =
    sidebarCookieValue !== undefined
      ? sidebarCookieValue === SIDEBAR_COOKIE_OPEN_VALUE
      : undefined;
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();
  const memberTribes = authenticatedMember
    ? await modules.tribes.useCases.getMemberTribes()
    : [];

  return (
    <PlatformLayoutShell
      authenticatedMember={authenticatedMember}
      defaultSidebarOpen={defaultSidebarOpen}
      memberTribes={memberTribes}
    >
      {children}
    </PlatformLayoutShell>
  );
}

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense
      fallback={<PlatformLayoutFallback />}
    >
      <PlatformLayoutContent>{children}</PlatformLayoutContent>
    </Suspense>
  );
}
