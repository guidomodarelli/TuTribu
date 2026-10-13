"use client";

import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  FlameKindlingIcon,
  GraduationCapIcon,
  HandHeartIcon,
  LibraryBigIcon,
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
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "beez-ui";

const discoverTribesNavigationItem = {
  href: ROUTES.home,
  icon: CompassIcon,
  label: "Descubrir tribus",
} as const;
const tribeMemberNavigation = [
  {
    academyOnly: true,
    hrefBuilder: ROUTES.tribes.academy,
    icon: LibraryBigIcon,
    label: "Academia",
    matchPath: (pathname: string, tribeSlug: string) =>
      pathname === ROUTES.tribes.academy(tribeSlug) ||
      isSameOrNestedPath(pathname, ROUTES.tribes.academyVerification(tribeSlug)),
  },
  {
    communityOnly: true,
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
    communityOnly: true,
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
    communityOnly: true,
    hrefBuilder: ROUTES.tribes.tribe,
    icon: UsersIcon,
    label: "La tribu",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.tribe(tribeSlug)),
  },
  {
    comingSoon: true,
    communityOnly: true,
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
    academyOnly: true,
    hrefBuilder: ROUTES.tribes.academyManage,
    icon: LibraryBigIcon,
    label: "Gestionar academia",
    matchPath: (pathname: string, tribeSlug: string) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.academyManage(tribeSlug)),
  },
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
  brandButtonType: "button",
  brandMarkLength: 2,
  adminSectionLabel: "Gestión",
  collapsible: "icon",
  comingSoonBadgeLabel: "Pronto",
  createTribeLabel: "Nueva tribu",
  nestedRouteSeparator: "/",
  variant: "sidebar",
} as const;

const TRIBE_LOGO_SIZE = 32;

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

const TRIBE_ACCESS_MODEL_ACADEMY = "academy";

/**
 * Hides academy entries in classic tribes and community entries from basic
 * academy members (the server enforces the same rules; this only avoids
 * links that would redirect).
 *
 * @param item - Navigation item with its optional visibility flags.
 * @param tribe - Active tribe of the member.
 * @returns Whether the item applies to this member and tribe.
 */
function isNavigationItemVisible(
  item: object,
  tribe: MemberTribeListItemResult
): boolean {
  if ("academyOnly" in item && item.academyOnly && tribe.accessModel !== TRIBE_ACCESS_MODEL_ACADEMY) {
    return false;
  }

  return !("communityOnly" in item && item.communityOnly && tribe.hasCommunityAccess === false);
}

function isSameOrNestedPath(pathname: string, routePath: string): boolean {
  return (
    pathname === routePath ||
    pathname.startsWith(`${routePath}${APP_SIDEBAR_UI.nestedRouteSeparator}`)
  );
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
                  {tribeMemberNavigation
                    .filter((item) => isNavigationItemVisible(item, activeTribe))
                    .map((item) => {
                    const sectionPath = item.hrefBuilder(activeTribe.slug);
                    const isSectionActive = item.matchPath(
                      pathname,
                      activeTribe.slug
                    );

                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          icon={<item.icon />}
                          isActive={isSectionActive}
                          onSelect={() => push(sectionPath)}
                          badge={
                            "comingSoon" in item && item.comingSoon ? (
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
                          (!("leaderOnly" in item && item.leaderOnly) ||
                            activeTribe.role === TRIBE_ADMIN_ROLE.leader) &&
                          isNavigationItemVisible(item, activeTribe)
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
                            icon={<item.icon />}
                            isActive={isSectionActive}
                            onSelect={() => push(sectionPath)}
                          >
                            {item.label}
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
                    icon={<PlusCircleIcon />}
                    isActive={isCreateTribeActive}
                    onSelect={() => push(ROUTES.tribes.create)}
                  >
                    {APP_SIDEBAR_UI.createTribeLabel}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    icon={<discoverTribesNavigationItem.icon />}
                    isActive={pathname === discoverTribesNavigationItem.href}
                    onSelect={() => push(discoverTribesNavigationItem.href)}
                  >
                    {discoverTribesNavigationItem.label}
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
