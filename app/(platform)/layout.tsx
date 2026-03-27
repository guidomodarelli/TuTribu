import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import { createGetMemberCommunitiesUseCase } from "@/src/modules/communities/infrastructure/composition/create-get-member-communities-use-case";
import styles from "./layout.module.scss";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authenticatedMember = await createGetAuthenticatedMemberUseCase().execute();
  const memberCommunities = authenticatedMember
    ? await createGetMemberCommunitiesUseCase().execute()
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
