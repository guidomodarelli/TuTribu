/**
 * Raw route query of the events page. `occurrenceKey` is the untrusted deep
 * link (`eventId@startsAt`); when `month` is missing, the month is derived
 * from it so the linked occurrence is part of the listing.
 */
export type ListTribeEventsQuery = {
  month?: string | string[];
  occurrenceKey?: string | string[];
  tribeSlug: string;
};

export type ListUpcomingTribeEventsQuery = {
  limit?: number;
  tribeSlug: string;
};

export type GetTribeEventQuery = {
  eventId: string;
  tribeSlug: string;
};

/**
 * Raw event fields as received from the route. Optional fields arrive as
 * empty strings; `visibleMonth` lets the caller get back the occurrences of
 * the month it is rendering so the UI can update without a full reload.
 */
export type CreateTribeEventCommand = {
  /**
   * Raw "Cupo máximo" field: a positive integer, or empty/missing for an
   * unlimited event.
   */
  capacity?: string;
  description: string;
  endsAt: string;
  meetingUrl: string;
  recurrenceFrequency: string;
  recurrenceUntil: string;
  startsAt: string;
  title: string;
  tribeSlug: string;
  visibleMonth?: string;
};

export type UpdateTribeEventCommand = CreateTribeEventCommand & {
  eventId: string;
};

export type DeleteTribeEventCommand = {
  eventId: string;
  tribeSlug: string;
};

export type SetTribeEventAttendanceCommand = {
  eventId: string;
  occurrenceStartsAt: string;
  status: string;
  tribeSlug: string;
};

export type GetTribeEventAttendanceReportQuery = {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
};

export type GetTribeEventAttendanceStreakQuery = {
  tribeSlug: string;
};

export type ClearTribeEventAttendanceCommand = {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
};
