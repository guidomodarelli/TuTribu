/** @vitest-environment node */
/** Exercises native daily calendar boundaries without mocking time-zone data or PostgreSQL. @module admission-notification-calendar-test */
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { createPostgresAdmissionNotificationCalendar } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-calendar";
import { MICROSECONDS_PER_SECOND, MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_NOTIFICATION_CALENDAR_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";

/** @param iso - Synthetic millisecond-aligned UTC instant. @returns Exact fixture microseconds; submillisecond boundary cases adjust this integer directly. */
function microseconds(iso: string): number { return Date.parse(iso) * (MICROSECONDS_PER_SECOND / MILLISECONDS_PER_SECOND); }

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification calendar", () => {
  it("should retain precise nine-o'clock boundaries across default zones, offsets and both daylight-saving changes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: this calendar reads only native date functions on the verified owned branch.
      const read = (instant: number, timeZone: string | null) => database.withContext({ userId: null, email: null }, (transaction) => createPostgresAdmissionNotificationCalendar(transaction).dailyWindow(instant, timeZone));
      const boundary = microseconds("2026-10-15T12:00:00Z");
      // Act/assert: one microsecond before 09:00 belongs to yesterday's open digest; the exact boundary starts today's.
      expect(await read(boundary - 1, null)).toEqual({ startsAtMicroseconds: microseconds("2026-10-14T12:00:00Z"), closesAtMicroseconds: boundary, timeZone: "America/Argentina/Buenos_Aires" });
      expect(await read(boundary, null)).toEqual({ startsAtMicroseconds: boundary, closesAtMicroseconds: microseconds("2026-10-16T12:00:00Z"), timeZone: "America/Argentina/Buenos_Aires" });
      const spring = await read(microseconds("2026-03-07T15:00:00Z"), "America/New_York");
      expect(spring).toEqual({ startsAtMicroseconds: microseconds("2026-03-07T14:00:00Z"), closesAtMicroseconds: microseconds("2026-03-08T13:00:00Z"), timeZone: "America/New_York" });
      expect(spring.closesAtMicroseconds - spring.startsAtMicroseconds).toBe(82_800_000_000);
      const autumn = await read(microseconds("2026-10-31T15:00:00Z"), "America/New_York");
      expect(autumn).toEqual({ startsAtMicroseconds: microseconds("2026-10-31T13:00:00Z"), closesAtMicroseconds: microseconds("2026-11-01T14:00:00Z"), timeZone: "America/New_York" });
      expect(autumn.closesAtMicroseconds - autumn.startsAtMicroseconds).toBe(90_000_000_000);
      expect(await read(boundary, "Asia/Kolkata")).toEqual({ startsAtMicroseconds: microseconds("2026-10-15T03:30:00Z"), closesAtMicroseconds: microseconds("2026-10-16T03:30:00Z"), timeZone: "Asia/Kolkata" });
      await expect(read(boundary, "Synthetic/Unavailable")).rejects.toMatchObject({ cause: { code: "22023" } });
      await expect(read(Number.MAX_SAFE_INTEGER + 1, null)).rejects.toMatchObject({ code: "resource_unavailable" });
    });
  }, ADMISSION_NOTIFICATION_CALENDAR_TEST_TIMEOUT_MS);
});
