"use client";

import { CheckIcon, ChevronDownIcon, PlusCircleIcon, UsersIcon } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { TribeSwitcher } from "@/components/platform/tribe-switcher";
import { siteConfig } from "@/lib/site-config";
import { ROUTES } from "@/src/constants/routes";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import {
  DISCOVER_TRIBES_NAVIGATION_ITEM,
  findActiveTribe,
  getVisibleAdminNavigation,
  getVisibleMemberNavigation,
  isSameOrNestedPath,
  TRIBE_ADMIN_SECTION_LABEL,
  type TribeNavigationItem,
} from "./app-sidebar-navigation";
import styles from "./styles.module.scss";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar, useSidebarPanel } from "beez-ui";

const APP_SIDEBAR_UI = {
  ariaLabel: "Navegación principal",
  brandButtonType: "button",
  brandMarkLength: 2,
  collapsible: "icon",
  comingSoonBadgeLabel: "Pronto",
  createTribeLabel: "Nueva tribu",
  tribesSectionLabel: "Tribus",
  variant: "sidebar",
} as const;

const TRIBE_LOGO_SIZE = 32;

type AppSidebarProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  memberTribes: MemberTribeListItemResult[];
};

function getTribeBrandMark(tribeName: string): string {
  return tribeName
    .trim()
    .slice(0, APP_SIDEBAR_UI.brandMarkLength)
    .toUpperCase();
}

/**
 * Section heading that becomes a short divider in the icon rail, so the rail
 * still shows where one group ends and the next begins.
 */
function AppSidebarSectionHeading({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebarPanel();

  return (
    <div className={styles.AppSidebar__sectionHeading}>
      <SidebarGroupLabel>{children}</SidebarGroupLabel>
      <span
        aria-hidden="true"
        className={styles.AppSidebar__railDivider}
        data-visible={collapsed}
      />
    </div>
  );
}

export function AppSidebar({
  authenticatedMember,
  memberTribes,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { push } = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const isCreateTribeActive = pathname === ROUTES.tribes.create;
  const activeTribe = findActiveTribe(pathname, memberTribes);
  const brandName = activeTribe?.name ?? siteConfig.name;
  const brandMark = activeTribe
    ? getTribeBrandMark(activeTribe.name)
    : siteConfig.brandMark;
  const brandPath = activeTribe
    ? ROUTES.tribes.bySlug(activeTribe.slug)
    : ROUTES.home;
  const adminNavigation = activeTribe ? getVisibleAdminNavigation(activeTribe) : [];
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const navigateFromSidebar = (href: string) => {
    push(href);
    closeMobileSidebar();
  };
  const renderTribeSection = (item: TribeNavigationItem, tribeSlug: string) => (
    <SidebarMenuItem key={item.label}>
      <SidebarMenuButton
        icon={<item.icon />}
        isActive={item.matchPath(pathname, tribeSlug)}
        onSelect={() => push(item.hrefBuilder(tribeSlug))}
        badge={
          item.comingSoon ? (
            <span className={styles.AppSidebar__comingSoonBadge}>
              {APP_SIDEBAR_UI.comingSoonBadgeLabel}
            </span>
          ) : undefined
        }
      >
        {item.label}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  const brandIdentity = (
    <>
      {activeTribe?.logoUrl ? (
        <Image
          alt=""
          className={styles.AppSidebar__brandLogo}
          height={TRIBE_LOGO_SIZE}
          src={activeTribe.logoUrl}
          unoptimized
          width={TRIBE_LOGO_SIZE}
        />
      ) : (
        <span className={styles.AppSidebar__brandMark}>{brandMark}</span>
      )}
      <span className={styles.AppSidebar__brandName}>{brandName}</span>
    </>
  );

  return (
    <Sidebar
      ariaLabel={APP_SIDEBAR_UI.ariaLabel}
      collapsible={APP_SIDEBAR_UI.collapsible}
      variant={APP_SIDEBAR_UI.variant}
      className={styles.AppSidebar}
    >
      <SidebarHeader>
        {activeTribe ? (
          <TribeSwitcher
            className={styles.AppSidebar__tribeSwitcher}
            dropdownTrigger={
              <button
                type={APP_SIDEBAR_UI.brandButtonType}
                className={styles.AppSidebar__brand}
                data-active={pathname === brandPath}
              >
                {brandIdentity}
                <ChevronDownIcon aria-hidden="true" className={styles.AppSidebar__brandChevron} />
              </button>
            }
            memberTribes={memberTribes}
            onNavigate={closeMobileSidebar}
            showPrivateBadge={false}
          />
        ) : (
          <button
            type={APP_SIDEBAR_UI.brandButtonType}
            aria-label={brandName}
            title={brandName}
            className={styles.AppSidebar__brand}
            data-active={pathname === brandPath}
            onClick={() => navigateFromSidebar(brandPath)}
          >
            {brandIdentity}
          </button>
        )}
      </SidebarHeader>
      <SidebarContent>
        {activeTribe ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {getVisibleMemberNavigation(activeTribe).map((item) =>
                    renderTribeSection(item, activeTribe.slug)
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {adminNavigation.length > 0 ? (
              <SidebarGroup>
                <AppSidebarSectionHeading>
                  {TRIBE_ADMIN_SECTION_LABEL}
                </AppSidebarSectionHeading>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {adminNavigation.map((item) =>
                      renderTribeSection(item, activeTribe.slug)
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}
          </>
        ) : (
          <SidebarGroup>
            <AppSidebarSectionHeading>
              {APP_SIDEBAR_UI.tribesSectionLabel}
            </AppSidebarSectionHeading>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    icon={<PlusCircleIcon />}
                    isActive={isCreateTribeActive}
                    onSelect={() => push(ROUTES.tribes.create)}
                  >
                    {APP_SIDEBAR_UI.createTribeLabel}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    icon={<DISCOVER_TRIBES_NAVIGATION_ITEM.icon />}
                    isActive={pathname === DISCOVER_TRIBES_NAVIGATION_ITEM.href}
                    onSelect={() => push(DISCOVER_TRIBES_NAVIGATION_ITEM.href)}
                  >
                    {DISCOVER_TRIBES_NAVIGATION_ITEM.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {memberTribes.map((tribe) => {
                  const tribePath = ROUTES.tribes.bySlug(tribe.slug);
                  const isTribeActive = isSameOrNestedPath(pathname, tribePath);

                  return (
                    <SidebarMenuItem key={tribe.tribeId}>
                      <SidebarMenuButton
                        icon={<UsersIcon />}
                        isActive={isTribeActive}
                        onSelect={() => push(tribePath)}
                        badge={
                          isTribeActive ? (
                            <CheckIcon aria-hidden="true" className={styles.AppSidebar__activeIcon} />
                          ) : undefined
                        }
                      >
                        {tribe.name}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
              {authenticatedMember && memberTribes.length === 0 ? (
                <p className={styles.AppSidebar__emptyState}>
                  Todavía no formas parte de ninguna tribu
                </p>
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
