import type {
  TribeEventAttendanceStatus,
  TribeEventAttendanceStreakResult,
  TribeEventAttendeePreview,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_ATTENDANCE_STATUS } from "@/src/modules/events/constants/tribe-events";
import { getTribeEventRemainingSpots } from "@/src/modules/events/domain/services/tribe-event-attendance";

/**
 * Spanish copy of the attendance summaries (next event card, agenda rows,
 * detail dialog). Every helper is pure so the wording is tested once.
 */

const NAMED_ATTENDEES_LIMIT = 2;
const NAME_SEPARATOR = ", ";
const FIRST_NAME_SEPARATOR = " ";
const COPY = {
  and: " y ",
  full: "Completo",
  more: " más",
  separator: " · ",
  waitlistedSuffix: " en espera",
  maybeSuffix: " tal vez",
  goingVerb: (count: number, isPast: boolean) =>
    isPast ? (count === 1 ? " fue" : " fueron") : count === 1 ? " va" : " van",
  remainingSpots: (spots: number) => (spots === 1 ? "Queda 1 lugar" : `Quedan ${spots} lugares`),
  streak: (attended: number, total: number) =>
    `Fuiste a ${attended} de los últimos ${total} encuentros 🔥`,
  waitlistPosition: (position: number) => `Estás en lista de espera · posición ${position}`,
} as const;

function getFirstName(name: string): string {
  return name.trim().split(FIRST_NAME_SEPARATOR)[0] ?? name;
}

/**
 * "Ana, Juan y 10 más van": up to two first names from the preview plus the
 * rest of the people going.
 *
 * @param preview - First people who answered going.
 * @param goingCount - Total people going.
 * @param isPast - Whether the occurrence already finished (past tense).
 * @returns The sentence, or null when nobody is going.
 */
export function formatGoingNames(
  preview: TribeEventAttendeePreview[],
  goingCount: number,
  isPast: boolean
): string | null {
  if (goingCount === 0) {
    return null;
  }

  const verb = COPY.goingVerb(goingCount, isPast);
  const names = preview.slice(0, NAMED_ATTENDEES_LIMIT).map((attendee) => getFirstName(attendee.name));
  const remainingCount = goingCount - names.length;

  if (names.length === 0) {
    return String(goingCount) + verb;
  }

  if (remainingCount <= 0) {
    return names.join(COPY.and) + verb;
  }

  return names.join(NAME_SEPARATOR) + COPY.and + String(remainingCount) + COPY.more + verb;
}

/**
 * "12 van · 3 tal vez". Maybe answers never take a seat, so they are listed
 * apart from the people going.
 *
 * @returns The counts line, or null when nobody answered going or maybe.
 */
export function formatAttendanceCounts(
  goingCount: number,
  maybeCount: number,
  isPast: boolean
): string | null {
  if (goingCount === 0 && maybeCount === 0) {
    return null;
  }

  const goingText = String(goingCount) + COPY.goingVerb(goingCount, isPast);

  return maybeCount > 0
    ? goingText + COPY.separator + String(maybeCount) + COPY.maybeSuffix
    : goingText;
}

/**
 * "Quedan 3 lugares" or "Completo · 2 en espera".
 *
 * @returns The capacity line, or null when the event has no capacity.
 */
export function formatCapacityStatus(
  capacity: number | null,
  goingCount: number,
  waitlistedCount: number
): string | null {
  const remainingSpots = getTribeEventRemainingSpots(capacity, goingCount);

  if (remainingSpots === null) {
    return null;
  }

  if (remainingSpots > 0) {
    return COPY.remainingSpots(remainingSpots);
  }

  return waitlistedCount > 0
    ? COPY.full + COPY.separator + String(waitlistedCount) + COPY.waitlistedSuffix
    : COPY.full;
}

/**
 * Waitlist position of the viewer, shown next to the answer buttons.
 */
export function formatWaitlistPosition(
  viewerStatus: TribeEventAttendanceStatus | null,
  position: number | null
): string | null {
  return viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted && position !== null
    ? COPY.waitlistPosition(position)
    : null;
}

/**
 * Viewer-only streak line of the next event card.
 */
export function formatAttendanceStreak(streak: TribeEventAttendanceStreakResult): string {
  return COPY.streak(streak.attendedCount, streak.occurrenceCount);
}
