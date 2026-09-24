import { useEffect, useSyncExternalStore } from "react";

const MILLISECONDS_PER_MINUTE = 60_000;
const NO_WAKE_UP_TIMES: readonly number[] = [];

type ClockListener = () => void;

const clockListeners = new Set<ClockListener>();
/**
 * Latest instant the clock settled on. It only moves forward: minute ticks
 * raise it to the current minute and wake-ups (or an instant the server
 * confirmed) raise it to that exact instant. Null while nobody observes the
 * clock, so a later mount starts again from the real time.
 */
let settledClockTime: number | null = null;
let minuteTickTimeoutId: number | null = null;

function truncateToMinute(time: number): number {
  return Math.floor(time / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE;
}

function notifyClockListeners(): void {
  for (const listener of clockListeners) {
    listener();
  }
}

/**
 * Moves the clock forward to `instantTime` (epoch ms) and re-renders every
 * consumer. Earlier instants are ignored, so the clock never goes back. Use
 * it when a scheduled boundary is reached or the server proved that an
 * instant already passed (for example an occurrence it reported as ended
 * while the local clock still lagged behind).
 *
 * @param instantTime - Instant the clock must reach, in epoch milliseconds.
 */
export function advanceMinuteClockTo(instantTime: number): void {
  if (settledClockTime !== null && instantTime <= settledClockTime) {
    return;
  }

  settledClockTime = instantTime;
  notifyClockListeners();
}

/**
 * Schedules the next tick on the next minute boundary. Each tick measures the
 * remaining time again instead of relying on a fixed interval, so the clock
 * never lags by the mount offset and a timer that fires a little early or
 * late re-aligns on the following boundary.
 */
function scheduleNextMinuteTick(): void {
  const currentTime = Date.now();
  const millisecondsToNextMinute =
    truncateToMinute(currentTime) + MILLISECONDS_PER_MINUTE - currentTime;

  minuteTickTimeoutId = window.setTimeout(() => {
    scheduleNextMinuteTick();
    notifyClockListeners();
  }, millisecondsToNextMinute);
}

function stopMinuteTicks(): void {
  if (minuteTickTimeoutId !== null) {
    window.clearTimeout(minuteTickTimeoutId);
    minuteTickTimeoutId = null;
  }
}

function subscribe(onStoreChange: ClockListener): () => void {
  clockListeners.add(onStoreChange);

  if (clockListeners.size === 1) {
    scheduleNextMinuteTick();
  }

  return () => {
    clockListeners.delete(onStoreChange);

    if (clockListeners.size === 0) {
      stopMinuteTicks();
      settledClockTime = null;
    }
  };
}

function getSnapshot(): number {
  const currentMinuteTime = truncateToMinute(Date.now());

  if (settledClockTime === null || currentMinuteTime > settledClockTime) {
    settledClockTime = currentMinuteTime;
  }

  return settledClockTime;
}

function getServerSnapshot(): null {
  return null;
}

function findNextWakeUpTime(wakeUpTimes: readonly number[], nowTime: number): number | null {
  let nextWakeUpTime: number | null = null;

  for (const wakeUpTime of wakeUpTimes) {
    if (wakeUpTime > nowTime && (nextWakeUpTime === null || wakeUpTime < nextWakeUpTime)) {
      nextWakeUpTime = wakeUpTime;
    }
  }

  return nextWakeUpTime;
}

/**
 * Current time, refreshed on every minute boundary and at the exact instant of
 * each wake-up time that falls before the next boundary. Between boundaries it
 * holds the minute (or the last wake-up instant) it settled on. Returns null
 * during server rendering and hydration so time-dependent UI never produces a
 * server/client markup mismatch; it settles to a number right after mount.
 *
 * @param wakeUpTimes - Instants (epoch ms) where time-dependent UI changes,
 *   such as the end of an occurrence on screen; the clock re-renders exactly
 *   then instead of waiting for the next minute.
 * @returns The clock value in epoch milliseconds, or null before hydration.
 */
export function useMinuteClock(wakeUpTimes: readonly number[] = NO_WAKE_UP_TIMES): number | null {
  const nowTime = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const nextWakeUpTime = nowTime === null ? null : findNextWakeUpTime(wakeUpTimes, nowTime);

  useEffect(() => {
    if (nextWakeUpTime === null) {
      return;
    }

    const millisecondsToWakeUp = nextWakeUpTime - Date.now();

    // Wake-ups beyond the next boundary are re-evaluated by the minute tick,
    // which keeps every timeout short.
    if (millisecondsToWakeUp > MILLISECONDS_PER_MINUTE) {
      return;
    }

    const wakeUpTimeoutId = window.setTimeout(
      () => advanceMinuteClockTo(nextWakeUpTime),
      Math.max(0, millisecondsToWakeUp)
    );

    return () => window.clearTimeout(wakeUpTimeoutId);
  }, [nextWakeUpTime, nowTime]);

  return nowTime;
}
