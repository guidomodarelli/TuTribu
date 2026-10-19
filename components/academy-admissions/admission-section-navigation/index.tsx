/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 *
 * Adapted from the section navigation of the Arc "Settings page" block: the
 * sections are the admission pages (ordinary links, one route each), the list
 * is the block's narrow horizontal row at every width, the raised highlight
 * glides to the new section because the row lives in the shared admission
 * layout, the current page is scrolled into view, and the copy is in Spanish.
 */

"use client";

import { useLayoutEffect, useRef } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { SPRING_LAYOUT } from "@astra-kit/ui";
import { Link } from "@/components/navigation/link";
import { visibleAdmissionSections } from "@/lib/academy-admissions/admission-sections";
import type { AdmissionSection, AdmissionSectionAudience } from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/** The tribe, the open section and the member's audience. */
export type AdmissionSectionNavigationProps = { label: string; slug: string; section?: AdmissionSection; audience: AdmissionSectionAudience };

/** Smooth scrolling keeps the current section in view without a jump; reduced motion scrolls instantly. */
const SMOOTH_SCROLL = "smooth";
const INSTANT_SCROLL = "auto";
/** Halving the free space centers the current section in the row. */
const CENTERING_DIVISOR = 2;
const HIGHLIGHT_LAYOUT_ID = "admission-section-highlight";
const INSTANT = { duration: 0 } as const;

/**
 * @param props - Accessible name, tribe, current section and audience.
 * @returns A navigation landmark with the sections the audience opens, whose current link carries `aria-current="page"`,
 * a highlight that glides between sections and stays visible in the scrolling row.
 */
export function AdmissionSectionNavigation({ label, slug, section, audience }: AdmissionSectionNavigationProps) {
  const list = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotion();
  const tribePath = `/${encodeURIComponent(slug)}`;
  const items = visibleAdmissionSections(audience).map((item) => ({ key: item.section, href: `${tribePath}/${item.segment}`, label: item.label, current: item.section === section }));

  useLayoutEffect(() => {
    const row = list.current;
    const current = row?.querySelector<HTMLElement>("[aria-current='page']");
    // Only the row scrolls: scrollIntoView would also move the window on narrow screens.
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const left = current.offsetLeft;
    const visible = left >= row.scrollLeft && left + current.offsetWidth <= row.scrollLeft + row.clientWidth;
    if (!visible) row.scrollTo({ left: Math.max(0, left - (row.clientWidth - current.offsetWidth) / CENTERING_DIVISOR), behavior: reduce ? INSTANT_SCROLL : SMOOTH_SCROLL });
  }, [section, reduce]);

  return <nav className={styles.AdmissionSectionNavigation} aria-label={label}>
    <LayoutGroup id={HIGHLIGHT_LAYOUT_ID}>
      <ul ref={list} className={styles.AdmissionSectionNavigation__list}>
        {items.map((item) => <li key={item.key} className={styles.AdmissionSectionNavigation__entry}>
          <Link className={styles.AdmissionSectionNavigation__item} href={item.href} aria-current={item.current ? "page" : undefined}>
            {item.current && <motion.span layoutId={HIGHLIGHT_LAYOUT_ID} className={styles.AdmissionSectionNavigation__highlight} transition={reduce ? INSTANT : SPRING_LAYOUT} aria-hidden="true" />}
            <span className={styles.AdmissionSectionNavigation__label}>{item.label}</span>
          </Link>
        </li>)}
      </ul>
    </LayoutGroup>
  </nav>;
}
