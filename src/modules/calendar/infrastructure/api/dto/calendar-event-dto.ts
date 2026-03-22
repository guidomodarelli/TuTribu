import type { CalendarEventKind } from "@/src/modules/calendar/domain/entities/calendar-event";

export type CalendarEventDto = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  location: string;
  kind: CalendarEventKind;
};

export type CalendarEventsResponseDto = {
  items: CalendarEventDto[];
};

const calendarEventKinds: CalendarEventKind[] = [
  "Office Hours",
  "Workshop",
  "Sprint Review",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCalendarEventKind(value: unknown): value is CalendarEventKind {
  return (
    typeof value === "string" &&
    calendarEventKinds.includes(value as CalendarEventKind)
  );
}

function isCalendarEventDto(value: unknown): value is CalendarEventDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.startAt === "string" &&
    typeof value.location === "string" &&
    isCalendarEventKind(value.kind)
  );
}

export function parseCalendarEventsResponseDto(
  payload: unknown
): CalendarEventsResponseDto {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("Invalid calendar events payload");
  }

  if (!payload.items.every(isCalendarEventDto)) {
    throw new Error("Invalid calendar event item payload");
  }

  return {
    items: payload.items,
  };
}
