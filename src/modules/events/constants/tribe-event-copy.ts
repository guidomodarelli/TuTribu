import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_PROPOSAL_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
  TRIBE_EVENT_TYPE,
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

/**
 * Spanish labels of the event types. "Encuentro en vivo" (not just "En
 * vivo") avoids confusing the type with the "En vivo" badge of an occurrence
 * that is running right now.
 */
export const TRIBE_EVENT_TYPE_LABEL = {
  [TRIBE_EVENT_TYPE.live]: "Encuentro en vivo",
  [TRIBE_EVENT_TYPE.workshop]: "Taller",
  [TRIBE_EVENT_TYPE.questionsAndAnswers]: "Preguntas y respuestas",
  [TRIBE_EVENT_TYPE.inPerson]: "Presencial",
  [TRIBE_EVENT_TYPE.social]: "Social",
} as const;

/**
 * Status labels of member proposals.
 */
export const TRIBE_EVENT_PROPOSAL_STATUS_LABEL = {
  [TRIBE_EVENT_PROPOSAL_STATUS.pending]: "Pendiente",
  [TRIBE_EVENT_PROPOSAL_STATUS.approved]: "Aprobada",
  [TRIBE_EVENT_PROPOSAL_STATUS.rejected]: "Rechazada",
  [TRIBE_EVENT_PROPOSAL_STATUS.withdrawn]: "Retirada",
} as const;
