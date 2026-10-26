/** Defines a small native calendar port without embedding time-zone infrastructure in the domain. @module admission-notification-calendar */
import type { AdmissionNotificationWindow } from "../entities/admission-notification";

/** Resolves local nine-o'clock boundaries while elapsed retry durations retain their own owner. */
export interface AdmissionNotificationCalendar {
  /** @param nowMicroseconds - Exact safe-integer native materialization clock. @param timeZone - Tribe zone or absence for the product default. @returns The daily window containing the clock, including DST-aware boundaries. */
  dailyWindow(nowMicroseconds: number, timeZone: string | null): Promise<AdmissionNotificationWindow>;
}
