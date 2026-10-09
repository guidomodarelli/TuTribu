/** Identifies secret-bearing app navigation before reporting tools can capture URL or page content. @module reporting-privacy */
import { REPORTING_PRIVATE_ROUTE_PREFIXES } from "@/src/modules/siteping/constants/reporting-privacy";

/** @param pathname - Current own route. @param search - Current own query, including an encoded login return. @returns Whether reporting tools must stay unmounted; no token values are returned or logged. */
export function isPrivateReportingLocation(pathname: string, search: URLSearchParams): boolean {
  if (REPORTING_PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return Array.from(search.values()).some((value) => REPORTING_PRIVATE_ROUTE_PREFIXES.some((prefix) => value.includes(prefix)));
}
