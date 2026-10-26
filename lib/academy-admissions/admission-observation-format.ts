/** Formats already guarded own observations deterministically for SSR and the first browser render. @module admission-observation-format */
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { formatBuenosAiresDateTime } from "@/lib/date-time/buenos-aires-format";
import { ADMISSION_OBSERVATION_COPY } from "@/src/modules/academy-admissions/constants/admission-activity-labels";

/** @param value - Own ISO UTC timestamp, already guarded at the public boundary. @returns The observed instant in Argentina time, the same on the server and in any browser. */
export function formatAdmissionObservationTime(value: string): string {
  return formatBuenosAiresDateTime(value);
}

/** @param milliseconds - Observed age/duration, or explicit missing history. @returns Rounded seconds with no invented sample or live browser clock. */
export function formatAdmissionObservationDuration(milliseconds: number | null): string {
  return milliseconds === null ? ADMISSION_OBSERVATION_COPY.noData : `${Math.ceil(milliseconds / MILLISECONDS_PER_SECOND)} s`;
}
