import { cookies } from "next/headers";
import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { TribeSwitcher } from "@/components/platform/tribe-switcher";
import { TribeSupportButton } from "@/components/tribes/tribe-support-button";
import { ThemeModeDropdown } from "@/components/theme/theme-mode-dropdown";
import { SidebarInset, SidebarProvider, SidebarTrigger, TooltipProvider, SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_OPEN_VALUE } from "beez-ui";

import { ROUTES } from "@/src/constants/routes";

import {
  notificationInboxSchema,
  type NotificationInboxResponse,
} from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";
import styles from "./layout.module.scss";

const PLATFORM_LAYOUT_NOTIFICATIONS_LOG = {
  dtoRejectedMessage: "Notification inbox public DTO rejected",
  dtoRejectedReason: "public_dto_rejected",
  failureMessage: "Notification inbox lookup failed in the platform layout",
  feature: "notifications",
  operation: "platform-layout-notification-inbox",
  requestId: "platform-layout",
} as const;

type PlatformModules = Awaited<ReturnType<typeof createRequestModules>>;

/**
 * Server-first inbox for the header bell. A failure never breaks the layout:
 * it is logged and the bell starts empty, loading on open and polling the
 * count. The inbox is a prop of a client component, so it goes through its
 * public DTO allowlist first.
 */
async function loadInitialNotificationInbox(
  modules: PlatformModules,
  userId: string
): Promise<NotificationInboxResponse | null> {
  const logger = createServerLogger({
    feature: PLATFORM_LAYOUT_NOTIFICATIONS_LOG.feature,
    operation: PLATFORM_LAYOUT_NOTIFICATIONS_LOG.operation,
    requestId: PLATFORM_LAYOUT_NOTIFICATIONS_LOG.requestId,
  });

  try {
    const inbox = notificationInboxSchema.safeParse(
      await modules.notifications.useCases.getNotificationInbox()
    );

    if (!inbox.success) {
      logger.error({
        message: PLATFORM_LAYOUT_NOTIFICATIONS_LOG.dtoRejectedMessage,
        metadata: {
          issues: summarizeValidationIssues(inbox.error.issues),
          reason: PLATFORM_LAYOUT_NOTIFICATIONS_LOG.dtoRejectedReason,
          userId,
        },
      });

      return null;
    }

    return inbox.data;
  } catch (error) {
    logger.error({
      error,
      message: PLATFORM_LAYOUT_NOTIFICATIONS_LOG.failureMessage,
      metadata: { userId },
    });

    return null;
  }
}

type PlatformLayoutShellProps = Readonly<{
  authenticatedMember: React.ComponentProps<
    typeof AppSidebar
  >["authenticatedMember"];
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
  memberTribes: React.ComponentProps<typeof AppSidebar>["memberTribes"];
  notificationInbox: NotificationInboxResponse | null;
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
  notificationInbox,
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
              {authenticatedMember ? (
                <NotificationCenter initialInbox={notificationInbox} />
              ) : null}
              <TribeSupportButton memberTribes={memberTribes} />
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
  const [memberTribes, notificationInbox] = authenticatedMember
    ? await Promise.all([
        modules.tribes.useCases.getMemberTribes(),
        loadInitialNotificationInbox(modules, authenticatedMember.id),
      ])
    : [[], null];

  return (
    <PlatformLayoutShell
      authenticatedMember={authenticatedMember}
      defaultSidebarOpen={defaultSidebarOpen}
      memberTribes={memberTribes}
      notificationInbox={notificationInbox}
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
