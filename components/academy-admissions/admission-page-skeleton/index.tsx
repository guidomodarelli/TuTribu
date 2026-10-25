/** Loading skeleton of an admission page: its real heading, then placeholders shaped like its content. @module admission-page-skeleton */
import { AdmissionPageHeader } from "@/components/academy-admissions/admission-settings-page";
import { RouteSkeleton, SkeletonFacts, SkeletonRows, SkeletonStepsPanel } from "@/components/loaders/route-skeleton";
import { ADMISSION_PAGES, type AdmissionPage } from "@/src/modules/academy-admissions/constants/admission-sections";
import styles from "./styles.module.scss";

/** Placeholder groups an admission page can show, in page order. */
type AdmissionSkeletonPart = "summary" | "steps" | "rows";

/**
 * What each page shows first: lists for the inbox, the history and the activity, a step-by-step form for the
 * configuration pages, and both where a form sits above a list (allowlist, invitations, connections).
 */
const ADMISSION_PAGE_SKELETON_PARTS = {
  review: ["rows"],
  history: ["rows"],
  policy: ["summary", "steps"],
  allowlist: ["steps", "rows"],
  allowlistImport: ["steps"],
  invitations: ["steps", "rows"],
  usage: ["summary"],
  connections: ["rows", "steps"],
  notifications: ["summary"],
  activity: ["summary", "rows"],
} as const satisfies Record<AdmissionPage, readonly AdmissionSkeletonPart[]>;

/** @param props - The placeholder group. @returns Its placeholder. */
function AdmissionSkeletonPartPlaceholder({ part }: { part: AdmissionSkeletonPart }) {
  if (part === "summary") return <SkeletonFacts />;
  if (part === "steps") return <SkeletonStepsPanel />;
  return <SkeletonRows />;
}

/**
 * @param props - The admission page that is loading.
 * @returns A busy region named by the page heading, with one status and placeholders shaped like that page;
 * it reads no session, storage or clock.
 */
export function AdmissionPageSkeleton({ page }: { page: AdmissionPage }) {
  const definition = ADMISSION_PAGES[page];
  return <RouteSkeleton className={styles.AdmissionPageSkeleton} label={definition.title} status={definition.loading}>
    <AdmissionPageHeader page={page} />
    {ADMISSION_PAGE_SKELETON_PARTS[page].map((part) => <AdmissionSkeletonPartPlaceholder key={part} part={part} />)}
  </RouteSkeleton>;
}
