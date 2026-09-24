import {
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
  TRIBE_EVENT_TYPE,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventRecurrenceFrequency,
  TribeEventType,
} from "@/src/modules/events/domain/entities/tribe-event";

/**
 * Starting point offered to managers when a month has no events. It only
 * prefills the create form; the manager still picks the date and time.
 */
export type TribeEventTemplate = {
  durationMinutes: number;
  eventType: TribeEventType;
  id: string;
  recurrenceFrequency: TribeEventRecurrenceFrequency;
  title: string;
};

export const TRIBE_EVENT_TEMPLATES: readonly TribeEventTemplate[] = [
  {
    durationMinutes: 60,
    eventType: TRIBE_EVENT_TYPE.questionsAndAnswers,
    id: "weekly-qa",
    recurrenceFrequency: TRIBE_EVENT_RECURRENCE_FREQUENCY.weekly,
    title: "Preguntas y respuestas semanal",
  },
  {
    durationMinutes: 90,
    eventType: TRIBE_EVENT_TYPE.live,
    id: "monthly-kickoff",
    recurrenceFrequency: TRIBE_EVENT_RECURRENCE_FREQUENCY.monthly,
    title: "Encuentro de arranque mensual",
  },
  {
    durationMinutes: 120,
    eventType: TRIBE_EVENT_TYPE.workshop,
    id: "live-workshop",
    recurrenceFrequency: TRIBE_EVENT_RECURRENCE_FREQUENCY.none,
    title: "Taller en vivo",
  },
];
