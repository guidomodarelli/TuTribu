"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import { hasOccurrenceFinishedBetween } from "@/lib/events/tribe-event-occurrence-timing";
import type { TribeEventOccurrenceTimes } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

const NO_EXTRA_FINISH_TIMES: readonly number[] = [];

type UseOccurrenceFinishWatcherInput = {
  /**
   * Extra instants (epoch ms) that count as a finish even though no
   * occurrence on screen ends then, such as the end of an occurrence outside
   * the visible month. They are deduplicated with the occurrence ends: several
   * instants inside the same clock step still produce a single call.
   */
  extraFinishTimes?: readonly number[];
  /** Minute clock (`useMinuteClock`); null before hydration. */
  nowTime: number | null;
  /** Called once per clock step in which at least one occurrence finished. */
  onOccurrenceFinished: () => void;
  /** Occurrences on screen. */
  occurrences: readonly TribeEventOccurrenceTimes[];
  /**
   * Instant (epoch ms) at which the server computed the data the callback
   * refreshes; null when unknown. It stands in for the previous clock value on
   * the first client tick.
   */
  serverSnapshotTime: number | null;
};

/**
 * Reuses the existing minute clock to notice when an occurrence on screen
 * crosses its end. It compares each clock value with the previous one, so it
 * fires at most once per clock step (several occurrences ending together, or
 * a throttled background tab jumping several minutes, still produce a single
 * call), and never when only the occurrences change. The first clock value
 * after hydration is compared with the server snapshot instant, so an
 * occurrence that ended between the server render and hydration is noticed
 * too; without a snapshot instant that first value is only recorded.
 *
 * @param input - Minute clock, visible occurrences, extra finish instants,
 *   server snapshot instant, and the finish callback.
 */
export function useOccurrenceFinishWatcher({
  extraFinishTimes = NO_EXTRA_FINISH_TIMES,
  nowTime,
  onOccurrenceFinished,
  occurrences,
  serverSnapshotTime,
}: UseOccurrenceFinishWatcherInput): void {
  const previousNowTimeRef = useRef<number | null>(null);
  const notifyOccurrenceFinished = useEffectEvent(onOccurrenceFinished);

  useEffect(() => {
    if (nowTime === null) {
      return;
    }

    // Only the first clock value falls back to the server snapshot: from then
    // on the ref always holds the previous client clock value.
    const previousNowTime = previousNowTimeRef.current ?? serverSnapshotTime;

    previousNowTimeRef.current = nowTime;

    if (previousNowTime === null) {
      return;
    }

    const hasExtraFinishPassed = extraFinishTimes.some(
      (finishTime) => finishTime > previousNowTime && finishTime <= nowTime
    );

    if (
      hasExtraFinishPassed ||
      hasOccurrenceFinishedBetween(occurrences, previousNowTime, nowTime)
    ) {
      notifyOccurrenceFinished();
    }
  }, [extraFinishTimes, nowTime, occurrences, serverSnapshotTime]);
}
