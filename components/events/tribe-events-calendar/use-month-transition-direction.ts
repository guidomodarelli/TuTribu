import { useEffect, useState } from "react";

/**
 * Direction in which the visible month changed, used only to orient the
 * entrance animation of the month title and the month view.
 */
export const MONTH_TRANSITION_DIRECTION = {
  next: "next",
  none: "none",
  previous: "previous",
} as const;

export type MonthTransitionDirection =
  (typeof MONTH_TRANSITION_DIRECTION)[keyof typeof MONTH_TRANSITION_DIRECTION];

/**
 * How long, in milliseconds, the last shown month still orients the next
 * calendar mount. Month links remount the calendar behind the route loading
 * state, so the memory must outlive that gap but not a later, unrelated visit.
 */
const SHOWN_MONTH_MEMORY_MS = 5_000;

type ShownMonthMemory = {
  month: string;
  shownAt: number;
  tribeSlug: string;
};

/**
 * Last month shown by a calendar in this browser tab. It is written only from
 * effects, which never run on the server, so server renders and the hydration
 * render always read `null` and their markup matches.
 */
let lastShownMonth: ShownMonthMemory | null = null;

function rememberShownMonth(tribeSlug: string, month: string): void {
  lastShownMonth = { month, shownAt: Date.now(), tribeSlug };
}

function readRecentlyShownMonth(tribeSlug: string): string | null {
  if (
    lastShownMonth === null ||
    lastShownMonth.tribeSlug !== tribeSlug ||
    Date.now() - lastShownMonth.shownAt > SHOWN_MONTH_MEMORY_MS
  ) {
    return null;
  }

  return lastShownMonth.month;
}

/**
 * Compares two `YYYY-MM` keys, which sort chronologically as plain strings.
 *
 * @param fromMonth - Month shown before, or null when there is none.
 * @param toMonth - Month shown now.
 * @returns `next` or `previous` when the month changed, `none` otherwise.
 */
export function resolveMonthTransitionDirection(
  fromMonth: string | null,
  toMonth: string
): MonthTransitionDirection {
  if (fromMonth === null || fromMonth === toMonth) {
    return MONTH_TRANSITION_DIRECTION.none;
  }

  return toMonth > fromMonth
    ? MONTH_TRANSITION_DIRECTION.next
    : MONTH_TRANSITION_DIRECTION.previous;
}

type MonthTransitionState = {
  direction: MonthTransitionDirection;
  month: string;
};

/**
 * Direction of the latest month change of a tribe calendar: a new `month`
 * prop on the same instance, or a fresh mount right after another month of
 * the same tribe was on screen (month links remount the route).
 *
 * @param tribeSlug - Tribe whose calendar is shown.
 * @param month - Visible `YYYY-MM` month.
 * @returns Direction to animate the month entrance with.
 */
export function useMonthTransitionDirection(
  tribeSlug: string,
  month: string
): MonthTransitionDirection {
  const [transition, setTransition] = useState<MonthTransitionState>(() => ({
    direction: resolveMonthTransitionDirection(readRecentlyShownMonth(tribeSlug), month),
    month,
  }));

  if (transition.month !== month) {
    setTransition({
      direction: resolveMonthTransitionDirection(transition.month, month),
      month,
    });
  }

  // Refreshed on unmount too, so the memory window starts when the viewer
  // leaves the month, not when it was first shown.
  useEffect(() => {
    rememberShownMonth(tribeSlug, month);

    return () => rememberShownMonth(tribeSlug, month);
  }, [month, tribeSlug]);

  return transition.month === month
    ? transition.direction
    : resolveMonthTransitionDirection(transition.month, month);
}
