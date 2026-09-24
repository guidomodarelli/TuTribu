import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";

/**
 * Spanish labels shared by the event calendar, the detail dialog, the event
 * form, and the tribe home block so every surface names series the same way.
 */
export const TRIBE_EVENT_RECURRENCE_LABEL = {
  [TRIBE_EVENT_RECURRENCE_FREQUENCY.none]: "No se repite",
  [TRIBE_EVENT_RECURRENCE_FREQUENCY.weekly]: "Todas las semanas",
  [TRIBE_EVENT_RECURRENCE_FREQUENCY.biweekly]: "Cada dos semanas",
  [TRIBE_EVENT_RECURRENCE_FREQUENCY.monthly]: "Todos los meses",
} as const;

/**
 * First-person labels of the answer buttons ("Voy", "Tal vez", "No voy").
 */
export const TRIBE_EVENT_ATTENDANCE_LABEL = {
  [TRIBE_EVENT_ATTENDANCE_STATUS.going]: "Voy",
  [TRIBE_EVENT_ATTENDANCE_STATUS.maybe]: "Tal vez",
  [TRIBE_EVENT_ATTENDANCE_STATUS.notGoing]: "No voy",
} as const;

/**
 * Third-person status labels used when managers look at other people's
 * answers (attendee list and CSV export).
 */
export const TRIBE_EVENT_ATTENDEE_STATUS_LABEL = {
  [TRIBE_EVENT_ATTENDANCE_STATUS.going]: "Va",
  [TRIBE_EVENT_ATTENDANCE_STATUS.maybe]: "Tal vez",
  [TRIBE_EVENT_ATTENDANCE_STATUS.notGoing]: "No va",
  [TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted]: "En lista de espera",
} as const;
