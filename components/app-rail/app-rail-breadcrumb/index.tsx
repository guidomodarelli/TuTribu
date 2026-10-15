"use client";

import { usePathname } from "next/navigation";

import {
  findActiveTribe,
  getVisibleAdminNavigation,
  getVisibleMemberNavigation,
  TRIBE_ADMIN_SECTION_LABEL,
} from "@/components/app-sidebar/app-sidebar-navigation";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import { PresenceSwap } from "beez-ui";
import styles from "./styles.module.scss";

const APP_RAIL_BREADCRUMB_UI = {
  ariaLabel: "Ruta de navegación",
  currentStep: "page",
  swapElement: "span",
  swapMode: "popLayout",
} as const;

type AppRailBreadcrumbProps = {
  memberTribes: MemberTribeListItemResult[];
};

type BreadcrumbTrail = {
  /** Group the section belongs to, such as the management group. */
  group?: string;
  section?: string;
  tribeName: string;
};

/**
 * Names the tribe and the sidebar section of the pathname, applying the same
 * visibility rules as the sidebar so the trail never names a hidden section.
 *
 * @param pathname - Current pathname.
 * @param memberTribes - Tribes of the member.
 * @returns The trail, or null outside the member's tribes.
 */
function resolveBreadcrumbTrail(
  pathname: string,
  memberTribes: readonly MemberTribeListItemResult[]
): BreadcrumbTrail | null {
  const tribe = findActiveTribe(pathname, memberTribes);

  if (!tribe) {
    return null;
  }

  const memberSection = getVisibleMemberNavigation(tribe).find((item) =>
    item.matchPath(pathname, tribe.slug)
  );

  if (memberSection) {
    return { section: memberSection.label, tribeName: tribe.name };
  }

  const adminSection = getVisibleAdminNavigation(tribe).find((item) =>
    item.matchPath(pathname, tribe.slug)
  );

  return adminSection
    ? { group: TRIBE_ADMIN_SECTION_LABEL, section: adminSection.label, tribeName: tribe.name }
    : { tribeName: tribe.name };
}

/**
 * Header trail of the app rail shell: the active tribe and the section the
 * member is on. The current step rises into its new name on each navigation.
 */
export function AppRailBreadcrumb({ memberTribes }: AppRailBreadcrumbProps) {
  const pathname = usePathname();
  const trail = resolveBreadcrumbTrail(pathname, memberTribes);

  if (!trail) {
    return null;
  }

  const currentStep = trail.section ?? trail.tribeName;

  return (
    <nav aria-label={APP_RAIL_BREADCRUMB_UI.ariaLabel} className={styles.AppRailBreadcrumb}>
      <ol className={styles.AppRailBreadcrumb__list}>
        {trail.section ? (
          <li className={`${styles.AppRailBreadcrumb__step} ${styles["AppRailBreadcrumb__step--root"]}`}>
            {trail.tribeName}
          </li>
        ) : null}
        {trail.group ? (
          <li className={`${styles.AppRailBreadcrumb__step} ${styles["AppRailBreadcrumb__step--group"]}`}>
            {trail.group}
          </li>
        ) : null}
        <li
          aria-current={APP_RAIL_BREADCRUMB_UI.currentStep}
          className={`${styles.AppRailBreadcrumb__step} ${styles["AppRailBreadcrumb__step--current"]}`}
        >
          <PresenceSwap
            as={APP_RAIL_BREADCRUMB_UI.swapElement}
            className={styles.AppRailBreadcrumb__current}
            mode={APP_RAIL_BREADCRUMB_UI.swapMode}
            presenceKey={currentStep}
          >
            {currentStep}
          </PresenceSwap>
        </li>
      </ol>
    </nav>
  );
}
