/** Content area of an admission page inside the shared admission layout: related actions, then the page workflow. @module admission-settings-page */
import type { ReactNode } from "react";
import { Link } from "@/components/navigation/link";
import { ADMISSION_WORKSPACE_COPY } from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/** The heading, description and section row live in the admissions layout; a page only adds its content and related links. */
export type AdmissionSettingsPageProps = { children: ReactNode; links?: readonly { href: string; label: string }[] };

/** @param props - Page content and optional related actions. @returns The page content, after ordinary links to related actions. */
export function AdmissionSettingsPage({ children, links = [] }: AdmissionSettingsPageProps) {
  return <div className={styles.AdmissionSettingsPage}>
    {links.length > 0 && <nav className={styles.AdmissionSettingsPage__related} aria-label={ADMISSION_WORKSPACE_COPY.related}>
      {links.map((link) => <Link key={link.href} className={styles.AdmissionSettingsPage__relatedLink} href={link.href}>{link.label}</Link>)}
    </nav>}
    {children}
  </div>;
}
