"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import { hasOccurrenceFinishedBetween } from "@/lib/events/tribe-event-occurrence-timing";
import type { TribeEventOccurrenceTimes } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

type UseOccurrenceFinishWatcherInput = {
  /** Minute clock (`useMinuteClock`); null before hydration. */
  nowTime: number | null;
  /** Called once per clock step in which at least one occurrence finished. */
  onOccurrenceFinished: () => void;
  /** Occurrences on screen. */
  occurrences: readonly TribeEventOccurrenceTimes[];
};

/**
 * Reuses the existing minute clock to notice when an occurrence on screen
 * crosses its end. It compares each clock value with the previous one, so it
 * fires at most once per clock step (several occurrences ending together, or
 * a throttled background tab jumping several minutes, still produce a single
 * call), never on the first clock value after hydration, and never when only
 * the occurrences change.
 *
 * @param input - Minute clock, visible occurrences, and the finish callback.
 */
export function useOccurrenceFinishWatcher({
  nowTime,
  onOccurrenceFinished,
  occurrences,
}: UseOccurrenceFinishWatcherInput): void {
  const previousNowTimeRef = useRef<number | null>(null);
  const notifyOccurrenceFinished = useEffectEvent(onOccurrenceFinished);

  useEffect(() => {
    const previousNowTime = previousNowTimeRef.current;

    previousNowTimeRef.current = nowTime;

    if (previousNowTime === null || nowTime === null) {
      return;
    }

    if (hasOccurrenceFinishedBetween(occurrences, previousNowTime, nowTime)) {
      notifyOccurrenceFinished();
    }
  }, [nowTime, occurrences]);
}
