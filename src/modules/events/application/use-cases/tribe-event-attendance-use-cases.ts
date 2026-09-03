import type {
  ClearTribeEventAttendanceCommand,
  SetTribeEventAttendanceCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type { TribeEventAttendanceMutationResult } from "@/src/modules/events/application/results/tribe-event-result";
import { isValidTribeEventId } from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_MUTATION_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventAttendanceStatus } from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TribeEventAttendanceKey,
  TribeEventRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { isTribeEventOccurrence } from "@/src/modules/events/domain/services/tribe-event-recurrence";

type TribeEventAttendanceDependencies = {
  tribeEventRepository: TribeEventRepository;
};

type ResolvedAttendanceKey =
  | { key: TribeEventAttendanceKey; status: typeof RESOLVED_KEY_STATUS.valid }
  | {
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidAttendance
        | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;
    };

const RESOLVED_KEY_STATUS = {
  valid: "valid",
} as const;
const ATTENDANCE_STATUSES: ReadonlySet<string> = new Set(
  Object.values(TRIBE_EVENT_ATTENDANCE_STATUS)
);

/**
 * Validates the identifiers and proves the occurrence is a real slot of the
 * series before touching attendance rows.
 */
async function resolveAttendanceKey(
  tribeEventRepository: TribeEventRepository,
  command: ClearTribeEventAttendanceCommand
): Promise<ResolvedAttendanceKey> {
  const eventId = command.eventId.trim();
  const tribeSlug = command.tribeSlug.trim();
  const occurrenceTime = Date.parse(command.occurrenceStartsAt.trim());

  if (!Number.isFinite(occurrenceTime)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance };
  }

  if (!isValidTribeEventId(eventId)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  const event = await tribeEventRepository.findById({ eventId, tribeSlug });

  if (!event) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  const occurrenceStartsAt = new Date(occurrenceTime).toISOString();

  if (!isTribeEventOccurrence(event, occurrenceStartsAt)) {
    return { status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance };
  }

  return {
    key: { eventId, occurrenceStartsAt, tribeSlug },
    status: RESOLVED_KEY_STATUS.valid,
  };
}

export function setTribeEventAttendance({
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
  return async (
    command: SetTribeEventAttendanceCommand
  ): Promise<TribeEventAttendanceMutationResult> => {
    const status = command.status.trim();

    if (!ATTENDANCE_STATUSES.has(status)) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance };
    }

    const resolvedKey = await resolveAttendanceKey(tribeEventRepository, command);

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    return tribeEventRepository.setAttendance({
      ...resolvedKey.key,
      status: status as TribeEventAttendanceStatus,
    });
  };
}

export function clearTribeEventAttendance({
  tribeEventRepository,
}: TribeEventAttendanceDependencies) {
  return async (
    command: ClearTribeEventAttendanceCommand
  ): Promise<TribeEventAttendanceMutationResult> => {
    const resolvedKey = await resolveAttendanceKey(tribeEventRepository, command);

    if (resolvedKey.status !== RESOLVED_KEY_STATUS.valid) {
      return { status: resolvedKey.status };
    }

    return tribeEventRepository.clearAttendance(resolvedKey.key);
  };
}
