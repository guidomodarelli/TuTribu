/** Keeps notification PostgreSQL instants exact without routing them through Date. @module admission-notification-timestamp */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";

/** @param microseconds - Original safe integer epoch microseconds. @returns A timestamp expression retaining the signed fractional remainder. */
export function admissionNotificationTimestamp(microseconds: number) {
  return sql`(to_timestamp(${Math.trunc(microseconds / MICROSECONDS_PER_SECOND)}::double precision)+${microseconds % MICROSECONDS_PER_SECOND}::integer*interval '1 microsecond')`;
}
