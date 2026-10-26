"use client";
/** Placeholder of the leader's setup guide while its settings are read. @module admission-setup-guide-fallback */
import { useParams } from "next/navigation";
import { Skeleton } from "@golfo/ui";
import { useMemberTribe } from "@/components/platform/member-tribes-provider";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { ADMISSION_SETUP_GUIDE_COPY } from "@/src/modules/academy-admissions/constants/admission-setup-guide";
import styles from "./styles.module.scss";

/** One line per setup step, so the placeholder keeps the guide's height. */
const SETUP_GUIDE_PLACEHOLDER_LINES = 5;

/**
 * Only the leader gets a guide, so only the leader sees its placeholder; other roles see nothing while the page streams.
 *
 * @returns A skeleton shaped like the guide for the tribe's leader, or nothing.
 */
export function AdmissionSetupGuideFallback() {
  const params = useParams<{ slug?: string | string[] }>();
  const tribe = useMemberTribe(typeof params.slug === "string" ? params.slug : undefined);
  if (tribe?.role !== TRIBE_MEMBER_ROLE.leader) return null;
  return <div className={styles.AdmissionSetupGuideFallback}><Skeleton label={ADMISSION_SETUP_GUIDE_COPY.loading} lines={SETUP_GUIDE_PLACEHOLDER_LINES} /></div>;
}
