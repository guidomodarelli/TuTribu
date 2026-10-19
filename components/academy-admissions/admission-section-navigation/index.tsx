/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 *
 * Adapted from the section navigation of the Arc "Settings page" block: the
 * sections are the admission pages (ordinary links, one route each), the list
 * is the block's narrow horizontal row at every width, the current page keeps
 * the raised highlight and is scrolled into view, and the copy is in Spanish.
 */

"use client";

import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { Link } from "@/components/navigation/link";
import { useMemberTribe } from "@/components/platform/member-tribes-provider";
import { admissionAudienceForRole, visibleAdmissionSections } from "@/lib/academy-admissions/admission-sections";
import type { AdmissionSection, AdmissionSectionAudience } from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/** The tribe and section of the page, plus the audience the page resolved on the server. */
export type AdmissionSectionNavigationProps = { label: string; slug: string; section?: AdmissionSection; fallbackAudience: AdmissionSectionAudience };

/** Smooth scrolling keeps the current section in view without a jump; reduced motion scrolls instantly. */
const SMOOTH_SCROLL = "smooth";
const INSTANT_SCROLL = "auto";
/** Halving the free space centers the current section in the row. */
const CENTERING_DIVISOR = 2;

/**
 * @param props - Accessible name, tribe, current section and the server's audience for the page.
 * @returns A navigation landmark with the sections the member's role opens, as in the app rail, whose current link
 * carries `aria-current="page"` and stays visible in the scrolling row.
 */
export function AdmissionSectionNavigation({ label, slug, section, fallbackAudience }: AdmissionSectionNavigationProps) {
  const list = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotion();
  const tribe = useMemberTribe(slug);
  const audience = tribe ? admissionAudienceForRole(tribe.role) : fallbackAudience;
  const tribePath = `/${encodeURIComponent(slug)}`;
  const items = visibleAdmissionSections(audience).map((item) => ({ href: `${tribePath}/${item.segment}`, label: item.label, current: item.section === section }));
  const currentHref = items.find((item) => item.current)?.href;

  useLayoutEffect(() => {
    const row = list.current;
    const current = row?.querySelector<HTMLElement>("[aria-current='page']");
    // Only the row scrolls: scrollIntoView would also move the window on narrow screens.
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const left = current.offsetLeft;
    const visible = left >= row.scrollLeft && left + current.offsetWidth <= row.scrollLeft + row.clientWidth;
    if (!visible) row.scrollTo({ left: Math.max(0, left - (row.clientWidth - current.offsetWidth) / CENTERING_DIVISOR), behavior: reduce ? INSTANT_SCROLL : SMOOTH_SCROLL });
  }, [currentHref, reduce]);

  return <nav className={styles.AdmissionSectionNavigation} aria-label={label}>
    <ul ref={list} className={styles.AdmissionSectionNavigation__list}>
      {items.map((item) => <li key={item.href} className={styles.AdmissionSectionNavigation__entry}>
        <Link className={styles.AdmissionSectionNavigation__item} href={item.href} aria-current={item.current ? "page" : undefined}>{item.label}</Link>
      </li>)}
    </ul>
  </nav>;
}
