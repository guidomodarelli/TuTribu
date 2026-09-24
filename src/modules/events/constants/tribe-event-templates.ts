import { TRIBE_EVENT_RECURRENCE_FREQUENCY } from "@/src/modules/events/constants/tribe-events";
import type { TribeEventRecurrenceFrequency } from "@/src/modules/events/domain/entities/tribe-event";

/**
 * Starting point offered to managers when a month has no events. It only
 * prefills the create form; the manager still picks the date and time.
 */
export type TribeEventTemplate = {
  durationMinutes: number;
  id: string;
  recurrenceFrequency: TribeEventRecurrenceFrequency;
  title: string;
};

export const TRIBE_EVENT_TEMPLATES: readonly TribeEventTemplate[] = [
  {
    durationMinutes: 60,
    id: "weekly-qa",
    recurrenceFrequency: TRIBE_EVENT_RECURRENCE_FREQUENCY.weekly,
    title: "Preguntas y respuestas semanal",
  },
  {
    durationMinutes: 90,
    id: "monthly-kickoff",
    recurrenceFrequency: TRIBE_EVENT_RECURRENCE_FREQUENCY.monthly,
    title: "Encuentro de arranque mensual",
  },
  {
    durationMinutes: 120,
    id: "live-workshop",
    recurrenceFrequency: TRIBE_EVENT_RECURRENCE_FREQUENCY.none,
    title: "Taller en vivo",
  },
];
