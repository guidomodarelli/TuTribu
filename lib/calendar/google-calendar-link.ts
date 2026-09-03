const GOOGLE_CALENDAR = {
  action: "TEMPLATE",
  dateSeparator: "/",
  recurrencePrefix: "RRULE:",
  renderUrl: "https://calendar.google.com/calendar/render",
} as const;
const GOOGLE_CALENDAR_PARAM = {
  action: "action",
  dates: "dates",
  details: "details",
  location: "location",
  recurrence: "recur",
  text: "text",
} as const;
const MILLISECONDS_PER_MINUTE = 60_000;
const ICS_DATE_TIME_STRIP_PATTERN = /[-:]|\.\d{3}/g;

export type GoogleCalendarEventLinkInput = {
  defaultDurationMinutes: number;
  description: string | null;
  endsAt: string | null;
  location: string | null;
  recurrenceRule: string | null;
  startsAt: string;
  title: string;
};

function formatGoogleCalendarDateTime(value: string): string {
  return new Date(value).toISOString().replace(ICS_DATE_TIME_STRIP_PATTERN, "");
}

/**
 * Builds a Google Calendar "add event" link for an occurrence. The optional
 * recurrence rule makes Google create the whole series from the link.
 */
export function buildGoogleCalendarEventUrl(
  input: GoogleCalendarEventLinkInput
): string {
  const endsAt =
    input.endsAt ??
    new Date(
      Date.parse(input.startsAt) +
        input.defaultDurationMinutes * MILLISECONDS_PER_MINUTE
    ).toISOString();
  const searchParams = new URLSearchParams({
    [GOOGLE_CALENDAR_PARAM.action]: GOOGLE_CALENDAR.action,
    [GOOGLE_CALENDAR_PARAM.text]: input.title,
    [GOOGLE_CALENDAR_PARAM.dates]:
      formatGoogleCalendarDateTime(input.startsAt) +
      GOOGLE_CALENDAR.dateSeparator +
      formatGoogleCalendarDateTime(endsAt),
  });

  if (input.description) {
    searchParams.set(GOOGLE_CALENDAR_PARAM.details, input.description);
  }

  if (input.location) {
    searchParams.set(GOOGLE_CALENDAR_PARAM.location, input.location);
  }

  if (input.recurrenceRule) {
    searchParams.set(
      GOOGLE_CALENDAR_PARAM.recurrence,
      GOOGLE_CALENDAR.recurrencePrefix + input.recurrenceRule
    );
  }

  return GOOGLE_CALENDAR.renderUrl + "?" + searchParams.toString();
}
