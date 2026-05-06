import type {
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  ListTribeEventsQuery,
  UpdateTribeEventCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventCreationResult,
  TribeEventListResult,
  TribeEventUpdateResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_FIELD_LIMIT,
  TRIBE_EVENT_MUTATION_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

type TribeEventDependencies = {
  tribeEventRepository: TribeEventRepository;
};

type NormalizedEventInput =
  | {
      description: string | null;
      endsAt: string | null;
      meetingUrl: string | null;
      startsAt: string;
      status: typeof NORMALIZED_EVENT_STATUS.valid;
      title: string;
      tribeSlug: string;
    }
  | {
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidDate
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidInput
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl;
    };

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const NORMALIZED_EVENT_STATUS = {
  valid: "valid",
} as const;
const DATE_FORMAT = {
  fallbackMonth: "01",
  fallbackYear: "2026",
  monthStartIndex: 5,
  padLength: 2,
  padValue: "0",
  separator: "-",
} as const;
const URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;
const MONTH_PART = {
  base: 10,
  buenosAiresOffsetHours: -3,
  buenosAiresUtcHour: 3,
  firstMonth: 1,
  firstMonthDay: 1,
  millisecondsPerHour: 3_600_000,
  lastMonth: 12,
  monthIndexOffset: 1,
  nextMonthOffset: 1,
  previousMonthOffset: -1,
  yearEndIndex: 4,
  yearStartIndex: 0,
} as const;

function formatMonth(year: number, month: number): string {
  return `${year}${DATE_FORMAT.separator}${String(month).padStart(
    DATE_FORMAT.padLength,
    DATE_FORMAT.padValue
  )}`;
}

function getMonthParts(month: string): { month: number; year: number } | null {
  if (!MONTH_PATTERN.test(month)) {
    return null;
  }

  const year = Number.parseInt(
    month.slice(MONTH_PART.yearStartIndex, MONTH_PART.yearEndIndex),
    MONTH_PART.base
  );
  const monthNumber = Number.parseInt(
    month.slice(DATE_FORMAT.monthStartIndex),
    MONTH_PART.base
  );

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber) ||
    monthNumber < MONTH_PART.firstMonth ||
    monthNumber > MONTH_PART.lastMonth
  ) {
    return null;
  }

  return {
    month: monthNumber,
    year,
  };
}

function getFallbackMonthParts(): { month: number; year: number } {
  return {
    month: Number.parseInt(DATE_FORMAT.fallbackMonth, MONTH_PART.base),
    year: Number.parseInt(DATE_FORMAT.fallbackYear, MONTH_PART.base),
  };
}

function createMonthDate(month: string): Date {
  const monthParts = getMonthParts(month) ?? getFallbackMonthParts();

  return new Date(
    Date.UTC(
      monthParts.year,
      monthParts.month - MONTH_PART.monthIndexOffset,
      MONTH_PART.firstMonthDay,
      MONTH_PART.buenosAiresUtcHour
    )
  );
}

function addMonths(month: string, offset: number): string {
  const monthParts = getMonthParts(month) ?? getFallbackMonthParts();

  const date = new Date(
    Date.UTC(
      monthParts.year,
      monthParts.month - MONTH_PART.monthIndexOffset + offset,
      MONTH_PART.firstMonthDay,
      MONTH_PART.buenosAiresUtcHour
    )
  );

  return formatMonth(
    date.getUTCFullYear(),
    date.getUTCMonth() + MONTH_PART.monthIndexOffset
  );
}

function resolveCurrentBuenosAiresMonth(): string {
  const buenosAiresDate = new Date(
    Date.now() +
      MONTH_PART.buenosAiresOffsetHours * MONTH_PART.millisecondsPerHour
  );

  return formatMonth(
    buenosAiresDate.getUTCFullYear(),
    buenosAiresDate.getUTCMonth() + MONTH_PART.monthIndexOffset
  );
}

function normalizeMonth(month: string | string[] | undefined): string {
  const monthValue = Array.isArray(month) ? month[0] : month;

  if (!monthValue) {
    return resolveCurrentBuenosAiresMonth();
  }

  if (!getMonthParts(monthValue)) {
    return resolveCurrentBuenosAiresMonth();
  }

  return monthValue;
}

function createMonthRange(month: string) {
  const next = addMonths(month, MONTH_PART.nextMonthOffset);

  return {
    monthEnd: createMonthDate(next).toISOString(),
    monthStart: createMonthDate(month).toISOString(),
  };
}

function isInvalidDateRange(startsAt: string, endsAt: string | null): boolean {
  const startsAtTime = Date.parse(startsAt);

  if (!Number.isFinite(startsAtTime)) {
    return true;
  }

  if (!endsAt) {
    return false;
  }

  const endsAtTime = Date.parse(endsAt);

  return !Number.isFinite(endsAtTime) || endsAtTime <= startsAtTime;
}

function isInvalidMeetingUrl(meetingUrl: string | null): boolean {
  if (!meetingUrl) {
    return false;
  }

  try {
    const url = new URL(meetingUrl);

    return (
      url.protocol !== URL_PROTOCOL.http && url.protocol !== URL_PROTOCOL.https
    );
  } catch {
    return true;
  }
}

function normalizeOptionalText(value: string): string | null {
  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeEventInput(
  command: CreateTribeEventCommand
): NormalizedEventInput {
  const title = command.title.trim();
  const startsAt = command.startsAt.trim();
  const endsAt = normalizeOptionalText(command.endsAt);
  const meetingUrl = normalizeOptionalText(command.meetingUrl);

  if (
    title.length === 0 ||
    title.length > TRIBE_EVENT_FIELD_LIMIT.titleMaxLength ||
    startsAt.length === 0
  ) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidInput };
  }

  if (isInvalidDateRange(startsAt, endsAt)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidDate };
  }

  if (isInvalidMeetingUrl(meetingUrl)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl };
  }

  return {
    description: normalizeOptionalText(command.description),
    endsAt,
    meetingUrl,
    startsAt: new Date(startsAt).toISOString(),
    status: NORMALIZED_EVENT_STATUS.valid,
    title,
    tribeSlug: command.tribeSlug.trim(),
  };
}

export function listTribeEvents({ tribeEventRepository }: TribeEventDependencies) {
  return async (query: ListTribeEventsQuery): Promise<TribeEventListResult> => {
    const current = normalizeMonth(query.month);
    const monthRange = createMonthRange(current);
    const result = await tribeEventRepository.listByTribeMonth({
      ...monthRange,
      tribeSlug: query.tribeSlug.trim(),
    });

    return {
      events: result.events,
      month: {
        current,
        next: addMonths(current, MONTH_PART.nextMonthOffset),
        previous: addMonths(current, MONTH_PART.previousMonthOffset),
      },
      viewerPermissions: result.viewerPermissions,
    };
  };
}

export function createTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (
    command: CreateTribeEventCommand
  ): Promise<TribeEventCreationResult> => {
    const normalizedInput = normalizeEventInput(command);

    if (normalizedInput.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedInput.status };
    }

    return tribeEventRepository.create({
      description: normalizedInput.description,
      endsAt: normalizedInput.endsAt,
      meetingUrl: normalizedInput.meetingUrl,
      startsAt: normalizedInput.startsAt,
      title: normalizedInput.title,
      tribeSlug: normalizedInput.tribeSlug,
    });
  };
}

export function updateTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (
    command: UpdateTribeEventCommand
  ): Promise<TribeEventUpdateResult> => {
    const normalizedInput = normalizeEventInput(command);

    if (normalizedInput.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedInput.status };
    }

    return tribeEventRepository.update({
      description: normalizedInput.description,
      endsAt: normalizedInput.endsAt,
      eventId: command.eventId.trim(),
      meetingUrl: normalizedInput.meetingUrl,
      startsAt: normalizedInput.startsAt,
      title: normalizedInput.title,
      tribeSlug: normalizedInput.tribeSlug,
    });
  };
}

export function deleteTribeEvent({
  tribeEventRepository,
}: TribeEventDependencies) {
  return async (command: DeleteTribeEventCommand) =>
    tribeEventRepository.delete({
      eventId: command.eventId.trim(),
      tribeSlug: command.tribeSlug.trim(),
    });
}
