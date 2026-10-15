/** Resolves native digest boundaries with PostgreSQL time-zone data on the caller's existing transaction. @module postgres-admission-notification-calendar */
import "server-only";
import { sql } from "drizzle-orm";
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_DAILY_HOUR } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationCalendar } from "../../domain/repositories/admission-notification-calendar";

/**
 * Binds only calendar arithmetic, not a new checkout, clock, session or delivery authority.
 * @param database - Original bounded native producer transaction.
 * @returns A calendar backed by the database's configured IANA time-zone data.
 */
export function createPostgresAdmissionNotificationCalendar(database: RequestDatabase): AdmissionNotificationCalendar {
  return {
    /** @param nowMicroseconds - Current native epoch microseconds, retained without a Date conversion. @param requestedTimeZone - Existing product/tribe zone, with absence using the specified initial default. @returns The open daily window ending at 09:00 local time. @throws On unavailable zones or an instant outside safe integer arithmetic; no fallback silently changes a configured zone. */
    async dailyWindow(nowMicroseconds, requestedTimeZone) {
      if (!Number.isSafeInteger(nowMicroseconds)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const timeZone = requestedTimeZone ?? BUENOS_AIRES_TIME_ZONE;
      const row = (await database.execute<{ starts_at_microseconds: string; closes_at_microseconds: string }>(sql`
        with source as (
          select to_timestamp(${Math.floor(nowMicroseconds / MICROSECONDS_PER_SECOND)}::double precision)
            + ${nowMicroseconds % MICROSECONDS_PER_SECOND}::integer * interval '1 microsecond' as instant
        ), local_clock as (
          select instant at time zone ${timeZone} as wall_time from source
        ), local_boundary as (
          select wall_time, date_trunc('day',wall_time)+make_interval(hours=>${ADMISSION_NOTIFICATION_DAILY_HOUR}::integer) as today_close from local_clock
        ), local_window as (
          select case when wall_time<today_close then today_close-interval '1 day' else today_close end as local_start from local_boundary
        )
        select (extract(epoch from (local_start at time zone ${timeZone}))*${MICROSECONDS_PER_SECOND})::bigint::text as starts_at_microseconds,
          (extract(epoch from ((local_start+interval '1 day') at time zone ${timeZone}))*${MICROSECONDS_PER_SECOND})::bigint::text as closes_at_microseconds
        from local_window
      `)).rows[0];
      const startsAtMicroseconds = Number(row.starts_at_microseconds), closesAtMicroseconds = Number(row.closes_at_microseconds);
      if (!Number.isSafeInteger(startsAtMicroseconds) || !Number.isSafeInteger(closesAtMicroseconds)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      return { startsAtMicroseconds, closesAtMicroseconds, timeZone };
    },
  };
}
