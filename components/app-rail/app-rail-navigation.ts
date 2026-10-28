import {
  CalendarDaysIcon,
  CompassIcon,
  FlameKindlingIcon,
  GraduationCapIcon,
  HandHeartIcon,
  LibraryBigIcon,
  MailPlusIcon,
  PlusCircleIcon,
  MedalIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  SettingsIcon,
  SignpostBigIcon,
  UserCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { ROUTES } from "@/src/constants/routes";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_PAGES } from "@/src/modules/academy-admissions/constants/admission-sections";
import { admissionAudienceForRole, resolveAdmissionPage, visibleAdmissionSections } from "@/lib/academy-admissions/admission-sections";

/**
 * Tribe navigation shared by the sidebar and the header breadcrumb, so both
 * name the same sections with the same visibility rules.
 */
export type TribeNavigationItem = {
  /** Only in academy-mode tribes. */
  academyOnly?: boolean;
  /**
   * Hidden from members who read no channel. The channel access rule decides
   * it, so free academy members keep the campfire.
   */
  channelReadersOnly?: boolean;
  /** Shows the "Pronto" badge. */
  comingSoon?: boolean;
  /** Hidden from basic academy members, who cannot read the community. */
  communityOnly?: boolean;
  hrefBuilder: (tribeSlug: string) => string;
  icon: LucideIcon;
  label: string;
  /** Only for the tribe leader. */
  leaderOnly?: boolean;
  matchPath: (pathname: string, tribeSlug: string) => boolean;
};

const NESTED_ROUTE_SEPARATOR = "/";
const TRIBE_ACCESS_MODEL_ACADEMY = "academy";

export const TRIBE_ADMIN_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

/** Heading of the management group in the sidebar and middle step of its breadcrumb. */
export const TRIBE_ADMIN_SECTION_LABEL = "Gestión";

export const DISCOVER_TRIBES_NAVIGATION_ITEM = {
  href: ROUTES.home,
  icon: CompassIcon,
  label: "Descubrir tribus",
} as const;

/**
 * Whether the pathname is the route itself or one of its nested routes.
 *
 * @param pathname - Current pathname.
 * @param routePath - Route to compare against.
 * @returns True for the route and its descendants.
 */
export function isSameOrNestedPath(pathname: string, routePath: string): boolean {
  return (
    pathname === routePath ||
    pathname.startsWith(`${routePath}${NESTED_ROUTE_SEPARATOR}`)
  );
}

export const TRIBE_MEMBER_NAVIGATION: readonly TribeNavigationItem[] = [
  {
    academyOnly: true,
    hrefBuilder: ROUTES.tribes.academy,
    icon: LibraryBigIcon,
    label: "Academia",
    matchPath: (pathname, tribeSlug) =>
      pathname === ROUTES.tribes.academy(tribeSlug) ||
      isSameOrNestedPath(pathname, ROUTES.tribes.academyVerification(tribeSlug)),
  },
  {
    channelReadersOnly: true,
    hrefBuilder: ROUTES.tribes.bySlug,
    icon: FlameKindlingIcon,
    label: "Fogón",
    matchPath: (pathname, tribeSlug) => pathname === ROUTES.tribes.bySlug(tribeSlug),
  },
  {
    hrefBuilder: ROUTES.tribes.welcome,
    icon: HandHeartIcon,
    label: "Bienvenida",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.welcome(tribeSlug)),
  },
  {
    communityOnly: true,
    hrefBuilder: ROUTES.tribes.events,
    icon: CalendarDaysIcon,
    label: "Eventos",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.events(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.courses,
    icon: GraduationCapIcon,
    label: "Cursos",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.courses(tribeSlug)),
  },
  {
    communityOnly: true,
    hrefBuilder: ROUTES.tribes.tribe,
    icon: UsersIcon,
    label: "La tribu",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.tribe(tribeSlug)),
  },
  {
    comingSoon: true,
    communityOnly: true,
    hrefBuilder: ROUTES.tribes.merits,
    icon: MedalIcon,
    label: "Méritos",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.merits(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.history,
    icon: ScrollTextIcon,
    label: "Historia",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.history(tribeSlug)),
  },
];

export const TRIBE_ADMIN_NAVIGATION: readonly TribeNavigationItem[] = [
  {
    academyOnly: true,
    hrefBuilder: ROUTES.tribes.academyManage,
    icon: LibraryBigIcon,
    label: "Gestionar academia",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.academyManage(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.invitations,
    icon: MailPlusIcon,
    label: "Invitaciones",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.invitations(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.prices,
    icon: ReceiptTextIcon,
    label: "Precios",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.prices(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.channels,
    icon: SignpostBigIcon,
    label: "Canales",
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.channels(tribeSlug)),
  },
  {
    hrefBuilder: ROUTES.tribes.settings,
    icon: SettingsIcon,
    label: "Ajustes",
    leaderOnly: true,
    matchPath: (pathname, tribeSlug) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.settings(tribeSlug)),
  },
];

/**
 * Whether the member leads or guards the tribe, which unlocks its management group.
 *
 * @param tribe - Tribe of the member.
 * @returns True for leaders and guardians.
 */
export function canManageTribe(tribe: MemberTribeListItemResult): boolean {
  return (
    tribe.role === TRIBE_ADMIN_ROLE.leader ||
    tribe.role === TRIBE_ADMIN_ROLE.guardian
  );
}

/**
 * Hides academy entries in classic tribes, community entries from basic
 * academy members and the campfire from members who read no channel (the
 * server enforces the same rules; this only avoids links that would redirect).
 *
 * @param item - Navigation item with its optional visibility flags.
 * @param tribe - Active tribe of the member.
 * @returns Whether the item applies to this member and tribe.
 */
function isNavigationItemVisible(
  item: TribeNavigationItem,
  tribe: MemberTribeListItemResult
): boolean {
  if (item.academyOnly && tribe.accessModel !== TRIBE_ACCESS_MODEL_ACADEMY) {
    return false;
  }

  if (item.channelReadersOnly && tribe.hasChannelReadAccess === false) {
    return false;
  }

  return !(item.communityOnly && tribe.hasCommunityAccess === false);
}

/**
 * Member sections the sidebar shows for the tribe.
 *
 * @param tribe - Active tribe of the member.
 * @returns Visible member navigation items, in sidebar order.
 */
export function getVisibleMemberNavigation(
  tribe: MemberTribeListItemResult
): TribeNavigationItem[] {
  return TRIBE_MEMBER_NAVIGATION.filter((item) => isNavigationItemVisible(item, tribe));
}

/**
 * Management sections the sidebar shows for the tribe; empty for members who
 * cannot manage it.
 *
 * @param tribe - Active tribe of the member.
 * @returns Visible management navigation items, in sidebar order.
 */
export function getVisibleAdminNavigation(
  tribe: MemberTribeListItemResult
): TribeNavigationItem[] {
  if (!canManageTribe(tribe)) {
    return [];
  }

  return TRIBE_ADMIN_NAVIGATION.filter(
    (item) =>
      (!item.leaderOnly || tribe.role === TRIBE_ADMIN_ROLE.leader) &&
      isNavigationItemVisible(item, tribe)
  );
}

/**
 * Tribe of the member whose routes contain the pathname.
 *
 * @param pathname - Current pathname.
 * @param memberTribes - Tribes of the member.
 * @returns The active tribe, or undefined outside the member's tribes.
 */
export function findActiveTribe(
  pathname: string,
  memberTribes: readonly MemberTribeListItemResult[]
): MemberTribeListItemResult | undefined {
  return memberTribes.find((tribe) =>
    isSameOrNestedPath(pathname, ROUTES.tribes.bySlug(tribe.slug))
  );
}

/** Label of the global tribes section shown outside a tribe. */
export const TRIBES_SECTION_LABEL = "Tribus";

export const CREATE_TRIBE_NAVIGATION_ITEM = {
  href: ROUTES.tribes.create,
  icon: PlusCircleIcon,
  label: "Nueva tribu",
} as const;

/** Text of the badge that marks sections still in development. */
export const COMING_SOON_BADGE_LABEL = "Pronto";

const MEMBER_SECTION_ID = "member";
const ADMIN_SECTION_ID = "admin";
const TRIBES_SECTION_ID = "tribes";

/** One row of the app rail; a row with children is a disclosure group whose subsections are the destinations. */
export type AppRailEntry = {
  badge?: string;
  children?: AppRailEntry[];
  href: string;
  icon: LucideIcon;
  id: string;
  isActive: boolean;
  label: string;
};

/** Label of the admissions group in the management section of the rail. */
export const ADMISSIONS_NAVIGATION_LABEL = "Admisiones";
const ADMISSIONS_ENTRY_ID = "admissions";

/**
 * Admissions group of the management section: academy tribes only, with every
 * subsection for the leader and the review subsections for guardians (the
 * server authorizes each page again).
 *
 * @param pathname - Current pathname.
 * @param tribe - Active tribe of the member.
 * @returns The group entry, or undefined when the tribe has no admissions.
 */
function toAdmissionsEntry(pathname: string, tribe: MemberTribeListItemResult): AppRailEntry | undefined {
  if (tribe.accessModel !== TRIBE_ACCESS_MODEL_ACADEMY || !canManageTribe(tribe)) return undefined;
  const currentPage = resolveAdmissionPage(pathname, tribe.slug);
  const currentSection = currentPage ? ADMISSION_PAGES[currentPage].section : undefined;
  const children = visibleAdmissionSections(admissionAudienceForRole(tribe.role)).map((section) => ({
    href: `${ROUTES.tribes.bySlug(tribe.slug)}/${section.segment}`,
    icon: UserCheckIcon,
    id: `${ADMISSIONS_ENTRY_ID}-${section.section}`,
    isActive: currentSection === section.section,
    label: section.label,
  }));
  return {
    children,
    href: `${ROUTES.tribes.bySlug(tribe.slug)}/${ADMISSION_NAVIGATION.reviewSegment}`,
    icon: UserCheckIcon,
    id: ADMISSIONS_ENTRY_ID,
    isActive: false,
    label: ADMISSIONS_NAVIGATION_LABEL,
  };
}

/**
 * Places the admissions group right after the academy management row.
 *
 * @param entries - Visible management rows.
 * @param admissions - Admissions group, when the tribe has one.
 * @param tribeSlug - Slug of the active tribe.
 * @returns Rows in rail order.
 */
function withAdmissionsEntry(entries: AppRailEntry[], admissions: AppRailEntry | undefined, tribeSlug: string): AppRailEntry[] {
  if (!admissions) return entries;
  const managementIndex = entries.findIndex((entry) => entry.href === ROUTES.tribes.academyManage(tribeSlug));
  const position = managementIndex === -1 ? 0 : managementIndex + 1;
  return [...entries.slice(0, position), admissions, ...entries.slice(position)];
}

/** A group of rows, optionally under a heading that becomes a divider in the rail. */
export type AppRailSection = {
  entries: AppRailEntry[];
  heading?: string;
  id: string;
};

/** Everything the app rail shows for the current pathname. */
export type AppRailNavigation = {
  activeTribe?: MemberTribeListItemResult;
  /** Label of the open row, the last breadcrumb step. */
  currentLabel?: string;
  /** Heading of the section that holds the open row, the middle breadcrumb step. */
  currentParent?: string;
  sections: AppRailSection[];
};

function toTribeEntry(
  item: TribeNavigationItem,
  pathname: string,
  tribeSlug: string
): AppRailEntry {
  return {
    badge: item.comingSoon ? COMING_SOON_BADGE_LABEL : undefined,
    href: item.hrefBuilder(tribeSlug),
    icon: item.icon,
    id: item.label,
    isActive: item.matchPath(pathname, tribeSlug),
    label: item.label,
  };
}

/**
 * Builds the rail for the pathname: the tribe sections inside one of the
 * member's tribes, and the global tribes list elsewhere. The sidebar and the
 * breadcrumb read the same result, so they never disagree on the open row.
 *
 * @param pathname - Current pathname.
 * @param memberTribes - Tribes of the member.
 * @returns Sections, active tribe and the breadcrumb steps of the open row.
 */
export function resolveAppRailNavigation(
  pathname: string,
  memberTribes: readonly MemberTribeListItemResult[]
): AppRailNavigation {
  const activeTribe = findActiveTribe(pathname, memberTribes);

  const sections: AppRailSection[] = activeTribe
    ? [
        {
          entries: getVisibleMemberNavigation(activeTribe).map((item) =>
            toTribeEntry(item, pathname, activeTribe.slug)
          ),
          id: MEMBER_SECTION_ID,
        },
        {
          entries: withAdmissionsEntry(
            getVisibleAdminNavigation(activeTribe).map((item) =>
              toTribeEntry(item, pathname, activeTribe.slug)
            ),
            toAdmissionsEntry(pathname, activeTribe),
            activeTribe.slug
          ),
          heading: TRIBE_ADMIN_SECTION_LABEL,
          id: ADMIN_SECTION_ID,
        },
      ]
    : [
        {
          entries: [
            {
              ...CREATE_TRIBE_NAVIGATION_ITEM,
              id: CREATE_TRIBE_NAVIGATION_ITEM.href,
              isActive: pathname === CREATE_TRIBE_NAVIGATION_ITEM.href,
            },
            {
              ...DISCOVER_TRIBES_NAVIGATION_ITEM,
              id: DISCOVER_TRIBES_NAVIGATION_ITEM.href,
              isActive: pathname === DISCOVER_TRIBES_NAVIGATION_ITEM.href,
            },
            ...memberTribes.map((tribe) => ({
              href: ROUTES.tribes.bySlug(tribe.slug),
              icon: UsersIcon,
              id: tribe.tribeId,
              isActive: false,
              label: tribe.name,
            })),
          ],
          heading: TRIBES_SECTION_LABEL,
          id: TRIBES_SECTION_ID,
        },
      ];
  const visibleSections = sections.filter((section) => section.entries.length > 0);
  const isOpenRow = (entry: AppRailEntry) => entry.isActive || Boolean(entry.children?.some((child) => child.isActive));
  const currentSection = visibleSections.find((section) => section.entries.some(isOpenRow));
  const currentEntry = currentSection?.entries.find(isOpenRow);
  const currentChild = currentEntry?.children?.find((child) => child.isActive);
  const currentChildParent = currentChild ? currentEntry?.label : currentSection?.heading;

  return {
    activeTribe,
    currentLabel: currentChild?.label ?? currentEntry?.label,
    currentParent: activeTribe ? currentChildParent : undefined,
    sections: visibleSections,
  };
}
