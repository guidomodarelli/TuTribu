"use client";
/** Reads the current address that a failed admission page uses to build its recovery. @module use-admission-route-location */
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import type { AdmissionRouteLocation } from "@/lib/academy-admissions/admission-route-recovery";
import { ROUTES } from "@/src/constants/routes";

/** @returns The current path and query (without `?`); outside an App Router context (isolated renders) the home path and no query. */
export function useAdmissionRouteLocation(): AdmissionRouteLocation {
  // Outside an App Router context both hooks return null at runtime despite their types.
  const pathname = (usePathname() as string | null) ?? ROUTES.home, searchParams = useSearchParams() as ReadonlyURLSearchParams | null;
  return { pathname, search: searchParams?.toString() ?? "" };
}
