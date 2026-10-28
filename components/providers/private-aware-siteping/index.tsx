"use client";
/** Selects optional reporting tools only after resolving the current non-private app location. @module private-aware-siteping */
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { SitepingProvider } from "@/components/providers/siteping-provider";
import { isPrivateReportingLocation } from "@/lib/siteping/reporting-privacy";
import styles from "./styles.module.scss";

/** @param props - Server-owned reporting configuration; the parent keeps a stable Suspense position. @returns No reporting SDK/identity request on private or disabled surfaces. */
export function PrivateAwareSiteping({ enabled = true }: { enabled?: boolean }) {
  // Outside an App Router context (Pages Router, isolated renders) both hooks return null at runtime despite their types.
  const pathname = usePathname() as string | null, search = useSearchParams() as ReadonlyURLSearchParams | null;
  if (!enabled || !pathname || !search || isPrivateReportingLocation(pathname, search)) return null;
  return <div className={styles.PrivateAwareSiteping}><SitepingProvider /></div>;
}
