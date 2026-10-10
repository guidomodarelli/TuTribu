"use client";
/** Selects optional reporting tools only after resolving the current non-private app location. @module private-aware-siteping */
import { usePathname, useSearchParams } from "next/navigation";
import { SitepingProvider } from "@/components/providers/siteping-provider";
import { isPrivateReportingLocation } from "@/lib/siteping/reporting-privacy";
import styles from "./styles.module.scss";

/** @param props - Server-owned reporting configuration; the parent keeps a stable Suspense position. @returns No reporting SDK/identity request on private or disabled surfaces. */
export function PrivateAwareSiteping({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname(), search = useSearchParams();
  if (!enabled || !pathname || !search || isPrivateReportingLocation(pathname, search)) return null;
  return <div className={styles.PrivateAwareSiteping}><SitepingProvider /></div>;
}
