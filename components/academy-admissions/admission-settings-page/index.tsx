/** Provides the shared admission workspace frame: return link, page header, section navigation and related actions. @module admission-settings-page */
import type { ReactNode } from "react";
import { Link } from "@/components/navigation/link";
import { AdmissionSectionNavigation } from "@/components/academy-admissions/admission-section-navigation";
import {
  ADMISSION_SECTION_AUDIENCE,
  ADMISSION_SECTIONS,
  ADMISSION_WORKSPACE_COPY,
  ADMISSION_WORKSPACE_RETURN,
  type AdmissionSection,
  type AdmissionSectionAudience,
} from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/** Navigation is shown only once the page knows the current tribe and the viewer's audience. */
export type AdmissionSettingsPageProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  section?: AdmissionSection;
  slug?: string;
  audience?: AdmissionSectionAudience;
  links?: readonly { href: string; label: string }[];
};

/**
 * @param props - Page content, its heading and, when the tribe is resolved, the current section and audience.
 * @returns A named region inside the platform's main landmark with one page heading, the admission sections the
 * viewer may open (the current one marked with `aria-current`) and ordinary links for related actions.
 */
export function AdmissionSettingsPage({ children, title, description, section, slug, audience, links = [] }: AdmissionSettingsPageProps) {
  const sections = slug && audience ? ADMISSION_SECTIONS.filter((item) => audience === ADMISSION_SECTION_AUDIENCE.leader || item.audience === ADMISSION_SECTION_AUDIENCE.reviewer) : [];
  const tribePath = slug ? `/${encodeURIComponent(slug)}` : "";
  const back = slug && audience ? ADMISSION_WORKSPACE_RETURN[audience] : null;
  return <section className={styles.AdmissionSettingsPage} aria-label={title}>
    {(title || back) && <header className={styles.AdmissionSettingsPage__header}>
      {back && slug && <Link className={styles.AdmissionSettingsPage__back} href={back.href(encodeURIComponent(slug))}><span aria-hidden="true">←</span> {back.label}</Link>}
      {title && <div className={styles.AdmissionSettingsPage__heading}>
        <p className={styles.AdmissionSettingsPage__eyebrow}>{ADMISSION_WORKSPACE_COPY.eyebrow}</p>
        <h1 className={styles.AdmissionSettingsPage__title}>{title}</h1>
        {description && <p className={styles.AdmissionSettingsPage__description}>{description}</p>}
      </div>}
    </header>}
    {sections.length > 0 && <AdmissionSectionNavigation label={ADMISSION_WORKSPACE_COPY.navigation} items={sections.map((item) => ({ href: `${tribePath}/${item.segment}`, label: item.label, current: item.section === section }))} />}
    {links.length > 0 && <nav className={styles.AdmissionSettingsPage__related} aria-label={ADMISSION_WORKSPACE_COPY.related}>
      {links.map((link) => <Link key={link.href} className={styles.AdmissionSettingsPage__relatedLink} href={link.href}>{link.label}</Link>)}
    </nav>}
    <div className={styles.AdmissionSettingsPage__content}>{children}</div>
  </section>;
}
