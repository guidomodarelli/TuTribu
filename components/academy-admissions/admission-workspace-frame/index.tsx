"use client";

/** Shared admission frame mounted by the admissions layout: it stays on screen across sibling navigations. @module admission-workspace-frame */
import { ArrowLeftIcon } from "lucide-react";
import { Suspense, useId, type ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import { Link } from "@/components/navigation/link";
import { AdmissionSectionNavigation } from "@/components/academy-admissions/admission-section-navigation";
import { useMemberTribe } from "@/components/platform/member-tribes-provider";
import { admissionAudienceForRole, resolveAdmissionPage } from "@/lib/academy-admissions/admission-sections";
import { ADMISSION_PAGES, ADMISSION_WORKSPACE_COPY, ADMISSION_WORKSPACE_RETURN } from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/**
 * @param props - The admission page rendered by the route.
 * @returns A region named by the page heading, with the return link, heading, description and section row above the page.
 * Layouts must not read route params on the server, so the header resolves the tribe and page on the client.
 */
export function AdmissionWorkspaceFrame({ children }: { children: ReactNode }) {
  const titleId = useId();
  return <section className={styles.AdmissionWorkspaceFrame} aria-labelledby={titleId}>
    <Suspense fallback={<div className={styles.AdmissionWorkspaceFrame__headerFallback} aria-hidden="true" />}>
      <AdmissionWorkspaceHeader titleId={titleId} />
    </Suspense>
    <div className={styles.AdmissionWorkspaceFrame__content}>{children}</div>
  </section>;
}

/** @param props - Id that names the region. @returns The current page heading and, for a member of the tribe, its navigation. */
function AdmissionWorkspaceHeader({ titleId }: { titleId: string }) {
  const params = useParams<{ slug?: string | string[] }>();
  const pathname = usePathname();
  const slug = typeof params.slug === "string" ? params.slug : undefined;
  const tribe = useMemberTribe(slug);
  const page = slug ? resolveAdmissionPage(pathname, slug) : undefined;
  if (!slug || !page) return null;
  const definition = ADMISSION_PAGES[page];
  return <header className={styles.AdmissionWorkspaceFrame__header}>
    {tribe && <Link className={styles.AdmissionWorkspaceFrame__back} href={ADMISSION_WORKSPACE_RETURN.href(encodeURIComponent(slug))}><ArrowLeftIcon className={styles.AdmissionWorkspaceFrame__backIcon} aria-hidden="true" />{ADMISSION_WORKSPACE_RETURN.label}</Link>}
    <div className={styles.AdmissionWorkspaceFrame__heading}>
      <p className={styles.AdmissionWorkspaceFrame__eyebrow}>{ADMISSION_WORKSPACE_COPY.eyebrow}</p>
      <h1 id={titleId} className={styles.AdmissionWorkspaceFrame__title}>{definition.title}</h1>
      <p className={styles.AdmissionWorkspaceFrame__description}>{definition.description}</p>
    </div>
    {tribe && <AdmissionSectionNavigation label={ADMISSION_WORKSPACE_COPY.navigation} slug={slug} section={definition.section} audience={admissionAudienceForRole(tribe.role)} />}
  </header>;
}
