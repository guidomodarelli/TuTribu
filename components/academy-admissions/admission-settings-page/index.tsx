/** Provides the shared admission workspace frame: return link, page header, section navigation and related actions. @module admission-settings-page */
import type { ReactNode } from "react";
import { Link } from "@/components/navigation/link";
import { AdmissionSectionNavigation } from "@/components/academy-admissions/admission-section-navigation";
import {
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
 * member's role opens (the current one marked with `aria-current`) and ordinary links for related actions.
 */
export function AdmissionSettingsPage({ children, title, description, section, slug, audience, links = [] }: AdmissionSettingsPageProps) {
  const resolved = slug && audience ? { slug, audience } : null;
  return <section className={styles.AdmissionSettingsPage} aria-label={title}>
    {(title || resolved) && <header className={styles.AdmissionSettingsPage__header}>
      {resolved && <Link className={styles.AdmissionSettingsPage__back} href={ADMISSION_WORKSPACE_RETURN.href(encodeURIComponent(resolved.slug))}><span aria-hidden="true">←</span> {ADMISSION_WORKSPACE_RETURN.label}</Link>}
      {title && <div className={styles.AdmissionSettingsPage__heading}>
        <p className={styles.AdmissionSettingsPage__eyebrow}>{ADMISSION_WORKSPACE_COPY.eyebrow}</p>
        <h1 className={styles.AdmissionSettingsPage__title}>{title}</h1>
        {description && <p className={styles.AdmissionSettingsPage__description}>{description}</p>}
      </div>}
    </header>}
    {resolved && <AdmissionSectionNavigation label={ADMISSION_WORKSPACE_COPY.navigation} slug={resolved.slug} section={section} fallbackAudience={resolved.audience} />}
    {links.length > 0 && <nav className={styles.AdmissionSettingsPage__related} aria-label={ADMISSION_WORKSPACE_COPY.related}>
      {links.map((link) => <Link key={link.href} className={styles.AdmissionSettingsPage__relatedLink} href={link.href}>{link.label}</Link>)}
    </nav>}
    <div className={styles.AdmissionSettingsPage__content}>{children}</div>
  </section>;
}
