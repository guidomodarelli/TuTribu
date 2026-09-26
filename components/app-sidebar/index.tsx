"use client";

import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  FlameKindlingIcon,
  GraduationCapIcon,
  HandHeartIcon,
  MailPlusIcon,
  MedalIcon,
  ReceiptTextIcon,
  PlusCircleIcon,
  ScrollTextIcon,
  SettingsIcon,
  SignpostBigIcon,
  UsersIcon,
} from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

import { TribeSwitcher } from "@/components/platform/tribe-switcher";
import { siteConfig } from "@/lib/site-config";
import { ROUTES } from "@/src/constants/routes";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import styles from "./styles.module.scss";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarSeparator, useSidebar } from "beez-ui";

const discoverTribesNavigationItem = {
  href: ROUTES.home,
  icon: CompassIcon,
  label: "Descubrir tribus",
} as const;
const tribeMemberNavigation = [
  {
    hrefBuilder: ROUTES.tribes.bySlug,
    icon: FlameKindlingIcon,
    label: "Fogón",
    matchPath: (pathname: string, tribeSlug: string) =>
      pathname === ROUTES.tribes.bySlug(tribeSlug),
  },
  {
    hrefBuilder: ROUTES.tribes.welcome,
    icon: HandHeartIcon,
    label: "Bienvenida",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.welcome(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.events,
    icon: CalendarDaysIcon,
    label: "Eventos",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.events(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.courses,
    icon: GraduationCapIcon,
    label: "Cursos",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.courses(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.tribe,
    icon: UsersIcon,
    label: "La tribu",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.tribe(tribeSlug)),
  },
  {
    comingSoon: true,
    hrefBuilder: ROUTES.tribes.merits,
    icon: MedalIcon,
    label: "Méritos",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.merits(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.history,
    icon: ScrollTextIcon,
    label: "Historia",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.history(tribeSlug)),
  },
] as const;
const tribeAdminNavigation = [
  {
    hrefBuilder: ROUTES.tribes.invitations,
    icon: MailPlusIcon,
    label: "Invitaciones",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.invitations(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.prices,
    icon: ReceiptTextIcon,
    label: "Precios",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.prices(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.channels,
    icon: SignpostBigIcon,
    label: "Canales",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.channels(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.settings,
    icon: SettingsIcon,
    label: "Ajustes",
    leaderOnly: true,
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.settings(tribeSlug)),
  },
] as const;
const APP_SIDEBAR_UI = {
  brandButtonSize: "lg",
  brandMarkLength: 2,
  adminSectionLabel: "Gestión",
  collapsible: "icon",
  comingSoonBadgeLabel: "Pronto",
  createTribeTooltip: "Nueva tribu",
  nestedRouteSeparator: "/",
  variant: "sidebar",
} as const;

const TRIBE_LOGO_SIZE = 32;

/** `aria-current` token of the section being viewed, so its state is not only visual. */
const ACTIVE_SECTION_CURRENT = "page";

const TRIBE_ADMIN_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

type AppSidebarProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  memberTribes: MemberTribeListItemResult[];
};

function canManageTribe(tribe: MemberTribeListItemResult): boolean {
  return (
    tribe.role === TRIBE_ADMIN_ROLE.leader ||
    tribe.role === TRIBE_ADMIN_ROLE.guardian
  );
}

function isSameOrNestedPath(pathname: string, routePath: string): boolean {
  return (
    pathname === routePath ||
    pathname.startsWith(`${routePath}${APP_SIDEBAR_UI.nestedRouteSeparator}`)
  );
}

/**
 * Exposes the active navigation item to assistive technology.
 * @param isActive - Whether the item matches the current route.
 * @returns The `aria-current` value, or `undefined` for inactive items.
 */
function getAriaCurrent(isActive: boolean): typeof ACTIVE_SECTION_CURRENT | undefined {
  return isActive ? ACTIVE_SECTION_CURRENT : undefined;
}

function getTribeBrandMark(tribeName: string): string {
  return tribeName
    .trim()
    .slice(0, APP_SIDEBAR_UI.brandMarkLength)
    .toUpperCase();
}

export function AppSidebar({
  authenticatedMember,
  memberTribes,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { push } = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const isCreateTribeActive = pathname === ROUTES.tribes.create;
  const activeTribe = memberTribes.find((tribe) =>
    isSameOrNestedPath(pathname, ROUTES.tribes.bySlug(tribe.slug))
  );
  const brandName = activeTribe?.name ?? siteConfig.name;
  const brandMark = activeTribe
    ? getTribeBrandMark(activeTribe.name)
    : siteConfig.brandMark;
  const brandPath = activeTribe
    ? ROUTES.tribes.bySlug(activeTribe.slug)
    : ROUTES.home;
  const canManageActiveTribe = activeTribe ? canManageTribe(activeTribe) : false;
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const navigateFromSidebar = (href: string) => {
    push(href);
    closeMobileSidebar();
  };

  return (
    <Sidebar
      collapsible={APP_SIDEBAR_UI.collapsible}
      variant={APP_SIDEBAR_UI.variant}
      className={styles.AppSidebar}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {activeTribe ? (
              <TribeSwitcher
                className={styles.AppSidebar__tribeSwitcher}
                dropdownTrigger={
                  <SidebarMenuButton
                    size={APP_SIDEBAR_UI.brandButtonSize}
                    isActive={pathname === brandPath}
                  >
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
                    <ChevronDownIcon aria-hidden="true" className={styles.AppSidebar__brandChevron} />
                  </SidebarMenuButton>
                }
                memberTribes={memberTribes}
                onNavigate={closeMobileSidebar}
                showPrivateBadge={false}
              />
            ) : (
              <SidebarMenuButton
                size={APP_SIDEBAR_UI.brandButtonSize}
                tooltip={brandName}
                isActive={pathname === brandPath}
                onClick={() => navigateFromSidebar(brandPath)}
              >
                <span className={styles.AppSidebar__brandMark}>{brandMark}</span>
                <span className={styles.AppSidebar__brandName}>{brandName}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className={styles.AppSidebar__separator} />
      <SidebarContent>
        {activeTribe ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {tribeMemberNavigation.map((item) => {
                    const sectionPath = item.hrefBuilder(activeTribe.slug);
                    const isSectionActive = item.matchPath(
                      pathname,
                      activeTribe.slug
                    );

                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          aria-current={getAriaCurrent(isSectionActive)}
                          tooltip={item.label}
                          isActive={isSectionActive}
                          onClick={() => navigateFromSidebar(sectionPath)}
                        >
                          <item.icon />
                          <span className={styles.AppSidebar__itemLabel}>
                            {item.label}
                          </span>
                        </SidebarMenuButton>
                        {"comingSoon" in item && item.comingSoon ? (
                          <SidebarMenuBadge
                            className={styles.AppSidebar__comingSoonBadge}
                          >
                            {APP_SIDEBAR_UI.comingSoonBadgeLabel}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {canManageActiveTribe ? (
              <SidebarGroup>
                <SidebarGroupLabel>
                  {APP_SIDEBAR_UI.adminSectionLabel}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {tribeAdminNavigation
                      .filter(
                        (item) =>
                          !("leaderOnly" in item && item.leaderOnly) ||
                          activeTribe.role === TRIBE_ADMIN_ROLE.leader
                      )
                      .map((item) => {
                      const sectionPath = item.hrefBuilder(activeTribe.slug);
                      const isSectionActive = item.matchPath(
                        pathname,
                        activeTribe.slug
                      );

                      return (
                        <SidebarMenuItem key={item.label}>
                          <SidebarMenuButton
                            aria-current={getAriaCurrent(isSectionActive)}
                            tooltip={item.label}
                            isActive={isSectionActive}
                            onClick={() => navigateFromSidebar(sectionPath)}
                          >
                            <item.icon />
                            <span className={styles.AppSidebar__itemLabel}>
                              {item.label}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}
          </>
        ) : null}
        {activeTribe ? null : (
          <SidebarGroup>
            <SidebarGroupLabel>Tribus</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-current={getAriaCurrent(isCreateTribeActive)}
                    tooltip={APP_SIDEBAR_UI.createTribeTooltip}
                    isActive={isCreateTribeActive}
                    onClick={() => navigateFromSidebar(ROUTES.tribes.create)}
                  >
                    <PlusCircleIcon />
                    <span className={styles.AppSidebar__itemLabel}>Nueva tribu</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-current={getAriaCurrent(pathname === discoverTribesNavigationItem.href)}
                    tooltip={discoverTribesNavigationItem.label}
                    isActive={pathname === discoverTribesNavigationItem.href}
                    onClick={() => navigateFromSidebar(discoverTribesNavigationItem.href)}
                  >
                    <discoverTribesNavigationItem.icon />
                    <span className={styles.AppSidebar__itemLabel}>
                      {discoverTribesNavigationItem.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {memberTribes.map((tribe) => {
                  const tribePath = ROUTES.tribes.bySlug(tribe.slug);
                  const isTribeActive = isSameOrNestedPath(pathname, tribePath);

                  return (
                    <SidebarMenuItem key={tribe.tribeId}>
                      <SidebarMenuButton
                        aria-current={getAriaCurrent(isTribeActive)}
                        tooltip={tribe.name}
                        isActive={isTribeActive}
                        onClick={() => navigateFromSidebar(tribePath)}
                      >
                        <UsersIcon />
                        <span className={styles.AppSidebar__itemLabel}>
                          {tribe.name}
                        </span>
                        {isTribeActive ? (
                          <CheckIcon aria-hidden="true" className={styles.AppSidebar__activeIcon} />
                        ) : null}
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
