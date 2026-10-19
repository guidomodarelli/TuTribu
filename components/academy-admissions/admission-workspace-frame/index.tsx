"use client";

/** Shared admission frame mounted by the admissions layout: the return link and section row stay on screen across pages. @module admission-workspace-frame */
import { ArrowLeftIcon } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import { Link } from "@/components/navigation/link";
import { AdmissionSectionNavigation } from "@/components/academy-admissions/admission-section-navigation";
import { useMemberTribe } from "@/components/platform/member-tribes-provider";
import { admissionAudienceForRole, resolveAdmissionPage } from "@/lib/academy-admissions/admission-sections";
import { ADMISSION_PAGES, ADMISSION_WORKSPACE_COPY, ADMISSION_WORKSPACE_RETURN } from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/**
 * @param props - The admission page rendered by the route.
 * @returns The return link and section row above the page. Layouts must not read route params on the server, so the
 * frame resolves the tribe and section on the client; it renders no text that depends on the URL, so a navigation that
 * lands before hydration cannot change what the server sent.
 */
export function AdmissionWorkspaceFrame({ children }: { children: ReactNode }) {
  return <div className={styles.AdmissionWorkspaceFrame}>
    <Suspense fallback={<div className={styles.AdmissionWorkspaceFrame__headerFallback} aria-hidden="true" />}>
      <AdmissionWorkspaceHeader />
    </Suspense>
    <div className={styles.AdmissionWorkspaceFrame__content}>{children}</div>
  </div>;
}

/** @returns For a member of the tribe, the return link and the sections their role opens with the current one marked. */
function AdmissionWorkspaceHeader() {
  const params = useParams<{ slug?: string | string[] }>();
  const pathname = usePathname();
  const slug = typeof params.slug === "string" ? params.slug : undefined;
  const tribe = useMemberTribe(slug);
  const page = slug ? resolveAdmissionPage(pathname, slug) : undefined;
  if (!slug || !tribe) return null;
  return <div className={styles.AdmissionWorkspaceFrame__header}>
    <Link className={styles.AdmissionWorkspaceFrame__back} href={ADMISSION_WORKSPACE_RETURN.href(encodeURIComponent(slug))}><ArrowLeftIcon className={styles.AdmissionWorkspaceFrame__backIcon} aria-hidden="true" />{ADMISSION_WORKSPACE_RETURN.label}</Link>
    <AdmissionSectionNavigation label={ADMISSION_WORKSPACE_COPY.navigation} slug={slug} section={page ? ADMISSION_PAGES[page].section : undefined} audience={admissionAudienceForRole(tribe.role)} />
  </div>;
}
