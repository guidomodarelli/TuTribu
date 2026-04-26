import { AppSidebar } from "@/components/app-sidebar";
import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import styles from "./layout.module.scss";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();
  const memberCommunities = authenticatedMember
    ? await modules.communities.useCases.getMemberCommunities()
    : [];

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          authenticatedMember={authenticatedMember}
          memberCommunities={memberCommunities}
        />
        <SidebarInset className={styles.PlatformLayout}>
          <header className={styles.PlatformLayout__header}>
            <SidebarTrigger className={styles.PlatformLayout__trigger} />
            <p className={styles.PlatformLayout__title}>Panel principal</p>
            <div className={styles.PlatformLayout__accountMenu}>
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
