import type {
  TribeEvent,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";

/**
 * Schedule fields an occurrence was validated against. Writes that depend on
 * that validation (attendance answers, per-date exceptions) send them to the
 * repository so the database refuses the write (`scheduleChanged`) when a
 * manager changed the schedule after this validation, which runs in an
 * earlier transaction than the write.
 *
 * @param event - Event read by the use case before validating the occurrence.
 * @returns Only the schedule fields, without title, capacity, or other data.
 */
export function pickValidatedTribeEventSchedule(event: TribeEvent): TribeEventSchedule {
  return {
    endsAt: event.endsAt,
    recurrenceFrequency: event.recurrenceFrequency,
    recurrenceUntil: event.recurrenceUntil,
    startsAt: event.startsAt,
  };
}
