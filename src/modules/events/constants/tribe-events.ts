export const TRIBE_EVENT_MUTATION_STATUS = {
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  invalidDate: "invalid_date",
  invalidInput: "invalid_input",
  invalidMeetingUrl: "invalid_meeting_url",
  notFound: "not_found",
  updated: "updated",
} as const;

export const TRIBE_EVENT_TIME_ZONE = {
  buenosAiresOffset: "-03:00",
  locale: "es-AR",
  name: "America/Argentina/Buenos_Aires",
} as const;

export const TRIBE_EVENT_FIELD_LIMIT = {
  titleMaxLength: 120,
} as const;
