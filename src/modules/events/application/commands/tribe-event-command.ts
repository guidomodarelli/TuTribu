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

/**
 * Raw fields of an event update. Unlike creation, a missing `capacity` means
 * "keep the stored capacity": an older client or API consumer that does not
 * know the field must not remove an existing limit. An empty value removes it
 * explicitly and a positive integer sets it.
 */
export type UpdateTribeEventCommand = Omit<CreateTribeEventCommand, "capacity"> & {
  capacity?: string;
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

/**
 * Streak reads take the reference instant from the caller instead of reading
 * the clock themselves: a response that carries both the streak and its next
 * refresh instant must compute them from one snapshot, or an occurrence that
 * ends between the two reads leaves a stale streak next to a deadline that
 * already skipped that occurrence.
 */
export type GetTribeEventAttendanceStreakQuery = {
  now: Date;
  tribeSlug: string;
};

export type ClearTribeEventAttendanceCommand = {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
};
