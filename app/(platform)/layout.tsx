import { AppSidebar } from "@/components/app-sidebar";
import { Providers } from "@/components/providers";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import styles from "./layout.module.scss";

export default function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Providers>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className={styles.PlatformLayout}>
            <header className={styles.PlatformLayout__header}>
              <SidebarTrigger className={styles.PlatformLayout__trigger} />
              <p className={styles.PlatformLayout__title}>Panel principal</p>
            </header>
            <div className={styles.PlatformLayout__content}>{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </Providers>
  );
}
