import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createAuthModule } from "@/src/modules/auth/setup";
import { createCommunitiesModule } from "@/src/modules/communities/setup";
import styles from "./layout.module.scss";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authenticatedMember = await createAuthModule().useCases.getAuthenticatedMember();
  const memberCommunities = authenticatedMember
    ? await createCommunitiesModule().useCases.getMemberCommunities()
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
          </header>
          <div className={styles.PlatformLayout__content}>{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
