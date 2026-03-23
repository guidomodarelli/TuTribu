import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const useCase = createGetAuthenticatedMemberUseCase();
  const authenticatedMember = await useCase.execute();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar authenticatedMember={authenticatedMember} />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border/60 bg-background/80 px-4 backdrop-blur lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <p className="ml-2 text-sm font-medium text-muted-foreground">Panel principal</p>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
