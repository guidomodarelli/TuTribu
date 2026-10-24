/** One admission page inside the shared admissions layout: its heading, related actions and workflow. @module admission-settings-page */
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/navigation/link";
import { ADMISSION_PAGES, ADMISSION_WORKSPACE_COPY, type AdmissionPage } from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/**
 * The page renders its own heading on the server: a heading derived from the URL inside the layout could hydrate against
 * a newer URL when someone navigates before hydration finishes. The layout keeps only the return link and section row.
 */
export type AdmissionSettingsPageProps = { page: AdmissionPage; children: ReactNode; links?: readonly { href: string; label: string }[] };

/** @param props - The admission page. @returns Its eyebrow, heading and one-line description, shared by the page and its loading skeleton. */
export function AdmissionPageHeader({ page }: { page: AdmissionPage }) {
  const definition = ADMISSION_PAGES[page];
  return <header className={styles.AdmissionSettingsPage__header}>
    <p className={styles.AdmissionSettingsPage__eyebrow}>{ADMISSION_WORKSPACE_COPY.eyebrow}</p>
    <h1 className={styles.AdmissionSettingsPage__title}>{definition.title}</h1>
    <p className={styles.AdmissionSettingsPage__description}>{definition.description}</p>
  </header>;
}

/** @param props - Page key, workflow and optional related actions. @returns A region named by the page heading with its content after related links. */
export function AdmissionSettingsPage({ page, children, links = [] }: AdmissionSettingsPageProps) {
  return <section className={styles.AdmissionSettingsPage} aria-label={ADMISSION_PAGES[page].title}>
    <AdmissionPageHeader page={page} />
    {links.length > 0 && <nav className={styles.AdmissionSettingsPage__related} aria-label={ADMISSION_WORKSPACE_COPY.related}>
      {links.map((link) => <ButtonLink key={link.href} variant="secondary" size="sm" href={link.href}>{link.label}</ButtonLink>)}
    </nav>}
    {children}
  </section>;
}
