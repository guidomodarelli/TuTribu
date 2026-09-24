"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  INITIAL_STREAK_FRESHNESS_STATE,
  STREAK_FRESHNESS_COMMAND,
  STREAK_FRESHNESS_EVENT,
  transitionStreakFreshness,
  type StreakFreshnessCommand,
  type StreakFreshnessEvent,
} from "@/lib/events/tribe-event-streak-freshness";
import {
  compareOccurrencesByStart,
  mergeSavedOccurrences,
} from "@/lib/events/tribe-events-calendar-grid";
import {
  deleteTribeEventRequest,
  fetchTribeEventAttendanceStreakRequest,
  saveTribeEventAttendanceRequest,
  saveTribeEventRequest,
  type TribeEventSavePayload,
  type TribeEventStreakReadResult,
  type TribeEventStreakRefresh,
} from "@/lib/events/tribe-events-api-client";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceStreakResult,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";

type UseTribeEventMutationsInput = {
  /** Viewer streak rendered by the server (null when there is none). */
  attendanceStreak: TribeEventAttendanceStreakResult | null;
  /**
   * Next instant (ISO 8601) at which the server expects the streak to change,
   * as rendered by the route; null when unknown.
   */
  attendanceStreakNextRefreshAt?: string | null;
  /**
   * Token of the server render that produced the streak (for example
   * `attendanceStreakComputedAt`). A new token always replaces the local
   * streak and its next refresh instant, even when the server values are
   * equal to the previous render's (for example `null` twice).
   */
  attendanceStreakSourceVersion?: string | null;
  /** Occurrences rendered by the server for the visible month. */
  events: TribeEventOccurrenceResult[];
  /** Visible `YYYY-MM` month, sent so saves return that month's occurrences. */
  month: string;
  /**
   * Called when the server rejects an answer because the occurrence already
   * ended (the local clock lagged behind), so the UI can show it finished.
   */
  onOccurrenceEnded?: (occurrence: TribeEventOccurrenceResult) => void;
  tribeSlug: string;
};

type VisibleEventsState = {
  events: TribeEventOccurrenceResult[];
  sourceEvents: TribeEventOccurrenceResult[];
};

/**
 * Server render the local streak state derives from. Local state only applies
 * while the route keeps rendering the same source.
 */
type StreakSource = {
  nextRefreshAt: string | null;
  streak: TribeEventAttendanceStreakResult | null;
  version: string | null;
};

type AttendanceStreakState = {
  source: StreakSource;
  streak: TribeEventAttendanceStreakResult | null;
};

type StreakNextRefreshState = {
  nextRefreshAt: string | null;
  source: StreakSource;
};

type StreakRequest = {
  requestSequence: number;
  source: StreakSource;
};

type OccurrencesUpdater = (
  currentEvents: TribeEventOccurrenceResult[]
) => TribeEventOccurrenceResult[];

/**
 * Client state and mutations of the tribe events calendar.
 */
export type TribeEventMutations = {
  /** Viewer streak, refreshed by creations, edits, and deletions of a series. */
  attendanceStreak: TribeEventAttendanceStreakResult | null;
  /**
   * Next instant (ISO 8601) at which the streak can change: the server value,
   * replaced by the one each streak read, creation, edit, or deletion
   * returns. Callers validate it before scheduling a refresh.
   */
  attendanceStreakNextRefreshAt: string | null;
  deleteEvent: (occurrence: TribeEventOccurrenceResult) => Promise<boolean>;
  isDeletingEvent: boolean;
  isSavingAttendance: boolean;
  isSavingEvent: boolean;
  /**
   * Reads the streak again (for example when an occurrence on screen
   * finishes). Failures keep the streak on screen without user feedback.
   * While a creation, edit, deletion, or attendance answer is uncommitted the
   * read is deferred until every one of them settles, so it never observes
   * pre-commit data.
   */
  refreshAttendanceStreak: () => void;
  saveEvent: (
    payload: TribeEventSavePayload,
    editingOccurrence: TribeEventOccurrenceResult | null
  ) => Promise<boolean>;
  setAttendance: (
    occurrence: TribeEventOccurrenceResult,
    status: TribeEventAttendanceOption | null
  ) => Promise<boolean>;
  /** Occurrences on screen, sorted by start, including local mutations. */
  visibleEvents: TribeEventOccurrenceResult[];
};

const COPY = {
  attendanceFailure: "No pudimos guardar tu respuesta.",
  attendanceSaved: "Respuesta guardada.",
  deleteFailure: "No pudimos eliminar el evento.",
  deleteSuccess: "Evento eliminado.",
  eventSaveFailure: "No pudimos guardar el evento.",
  eventSaveFallback: "Evento guardado.",
} as const;

/**
 * Reads the real clock, kept outside render so returned instants are compared
 * with the time their response arrived.
 */
function readCurrentTime(): number {
  return Date.now();
}

/**
 * Clears the timeout stored in a ref, if any, and empties the ref.
 */
function clearScheduledTimeout(timeoutRef: { current: ReturnType<typeof setTimeout> | null }) {
  if (timeoutRef.current !== null) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

/**
 * Tells whether two streak sources come from the same server render: same
 * render token and the same server values.
 */
function isSameStreakSource(source: StreakSource, otherSource: StreakSource): boolean {
  return (
    source.version === otherSource.version &&
    source.streak === otherSource.streak &&
    source.nextRefreshAt === otherSource.nextRefreshAt
  );
}

/**
 * Owns the occurrences on screen and the save, delete, and attendance
 * requests. Each mutation applies the route handler's minimal response to the
 * local list instead of refreshing the route, and a ref-based guard drops
 * duplicate submissions while a request of the same kind is in flight.
 *
 * When the route renders a new `events` array (month navigation), local
 * mutations are discarded in favour of the fresh server data. The viewer
 * streak and its next refresh instant follow the same rule, keyed by the
 * server render (`attendanceStreakSourceVersion` plus the server values), so
 * every new render replaces local state even when its values repeat. Among
 * responses, the most recently started one that carries each field wins.
 *
 * When to read the streak again is decided by the pure state machine in
 * `lib/events/tribe-event-streak-freshness.ts`; this hook only feeds it
 * events and executes its commands (start or abort the read, schedule or
 * cancel a delayed retry). Reads never overlap uncommitted creations, edits,
 * deletions, or attendance answers; an interrupted read is only covered by a
 * committed streak when no other mutation overlapped; and a returned instant
 * that already passed reads right away and then retries with a bounded
 * backoff while the server keeps returning it.
 *
 * @param input - Server occurrences, streak, its next refresh instant and
 *   render token, visible month, tribe slug, and the callback for answers the
 *   server rejected because the occurrence ended.
 * @returns Visible occurrences and streak, pending flags, and mutation callbacks that
 * resolve to `true` when the change was stored.
 */
export function useTribeEventMutations({
  attendanceStreak,
  attendanceStreakNextRefreshAt = null,
  attendanceStreakSourceVersion = null,
  events,
  month,
  onOccurrenceEnded,
  tribeSlug,
}: UseTribeEventMutationsInput): TribeEventMutations {
  const streakSource: StreakSource = {
    nextRefreshAt: attendanceStreakNextRefreshAt,
    streak: attendanceStreak,
    version: attendanceStreakSourceVersion,
  };
  const [visibleEventsState, setVisibleEventsState] = useState<VisibleEventsState>({
    events,
    sourceEvents: events,
  });
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceStreakState, setAttendanceStreakState] = useState<AttendanceStreakState>({
    source: streakSource,
    streak: attendanceStreak,
  });
  const [streakNextRefreshState, setStreakNextRefreshState] = useState<StreakNextRefreshState>({
    nextRefreshAt: attendanceStreakNextRefreshAt,
    source: streakSource,
  });
  // Latest server render and slug, read by reads that start from a deferred
  // settle or a delayed retry scheduled by an older render.
  const latestStreakSourceRef = useRef(streakSource);
  const latestTribeSlugRef = useRef(tribeSlug);
  // Increases on every request that can refresh the streak, ordering them by
  // start time.
  const streakRequestSequenceRef = useRef(0);
  // Sequence of the newest request whose streak landed on screen. It only
  // advances when a response actually carries a usable streak, so a slower,
  // older response never overwrites the streak of a newer successful one.
  const appliedStreakRequestSequenceRef = useRef(0);
  // Same guard for the next refresh instant, which advances independently
  // because a response can carry it while omitting the streak (and vice versa).
  const appliedStreakNextRefreshRequestSequenceRef = useRef(0);
  // Freshness state machine (pending mutations, read in flight or needed,
  // passed deadline retries). Kept in a ref: it drives side effects only.
  const streakFreshnessStateRef = useRef(INITIAL_STREAK_FRESHNESS_STATE);
  // Delayed retry of a passed next refresh instant, if any.
  const scheduledStreakReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);
  const isSavingEventRef = useRef(false);
  const isDeletingEventRef = useRef(false);
  const isSavingAttendanceRef = useRef(false);
  // In-flight streak refresh, aborted when a newer refresh or a mutation
  // starts, or the calendar unmounts, so a stale read never lands on screen.
  const streakRefreshControllerRef = useRef<AbortController | null>(null);
  const unsortedVisibleEvents =
    visibleEventsState.sourceEvents === events ? visibleEventsState.events : events;
  // The endpoint returns occurrences ordered, but the agenda groups by day and
  // relies on the order inside each day, so sort defensively on the client.
  const visibleEvents = useMemo(
    () => [...unsortedVisibleEvents].sort(compareOccurrencesByStart),
    [unsortedVisibleEvents]
  );

  const visibleAttendanceStreak = isSameStreakSource(attendanceStreakState.source, streakSource)
    ? attendanceStreakState.streak
    : attendanceStreak;
  const visibleStreakNextRefreshAt = isSameStreakSource(
    streakNextRefreshState.source,
    streakSource
  )
    ? streakNextRefreshState.nextRefreshAt
    : attendanceStreakNextRefreshAt;

  const startStreakRequest = (): StreakRequest => {
    streakRequestSequenceRef.current += 1;

    return {
      requestSequence: streakRequestSequenceRef.current,
      source: latestStreakSourceRef.current,
    };
  };

  const abortStreakRead = () => {
    streakRefreshControllerRef.current?.abort();
    streakRefreshControllerRef.current = null;
  };

  /**
   * Feeds one event to the freshness state machine and executes the commands
   * it emits, in order.
   */
  const dispatchStreakFreshness = (event: StreakFreshnessEvent) => {
    const transition = transitionStreakFreshness(streakFreshnessStateRef.current, event);

    streakFreshnessStateRef.current = transition.state;
    transition.commands.forEach(runStreakFreshnessCommand);
  };

  const runStreakFreshnessCommand = (command: StreakFreshnessCommand) => {
    switch (command.type) {
      case STREAK_FRESHNESS_COMMAND.startRead:
        startStreakRead();
        return;
      case STREAK_FRESHNESS_COMMAND.abortRead:
        abortStreakRead();
        return;
      case STREAK_FRESHNESS_COMMAND.scheduleRead:
        clearScheduledTimeout(scheduledStreakReadTimeoutRef);
        scheduledStreakReadTimeoutRef.current = setTimeout(() => {
          scheduledStreakReadTimeoutRef.current = null;
          refreshAttendanceStreak();
        }, command.delayMs);
        return;
      case STREAK_FRESHNESS_COMMAND.cancelScheduledRead:
        clearScheduledTimeout(scheduledStreakReadTimeoutRef);
    }
  };

  const applyStreakRefresh = (request: StreakRequest, refresh: TribeEventStreakRefresh) => {
    if (
      refresh.attendanceStreak === undefined ||
      request.requestSequence < appliedStreakRequestSequenceRef.current
    ) {
      return;
    }

    appliedStreakRequestSequenceRef.current = request.requestSequence;

    // Tagged with the server render seen when the request started: if the
    // route renders a new one meanwhile (navigation), the fresher server
    // value wins, the same way new server events replace local mutations.
    setAttendanceStreakState({
      source: request.source,
      streak: refresh.attendanceStreak,
    });
  };

  /**
   * Stores the next refresh instant a streak read or a series mutation
   * returned, tagged with the server render seen when the request started and
   * ordered by request sequence (same rules as the streak). An absent instant
   * keeps the one already watched. The state machine then decides whether an
   * instant already reached by the real clock needs a read or a delayed retry.
   */
  const applyStreakNextRefresh = (request: StreakRequest, read: TribeEventStreakReadResult) => {
    if (
      read.attendanceStreakNextRefreshAt === undefined ||
      request.requestSequence < appliedStreakNextRefreshRequestSequenceRef.current
    ) {
      return;
    }

    appliedStreakNextRefreshRequestSequenceRef.current = request.requestSequence;

    setStreakNextRefreshState({
      nextRefreshAt: read.attendanceStreakNextRefreshAt,
      source: request.source,
    });

    if (isSameStreakSource(request.source, latestStreakSourceRef.current)) {
      dispatchStreakFreshness({
        nextRefreshAt: read.attendanceStreakNextRefreshAt,
        nowTime: readCurrentTime(),
        type: STREAK_FRESHNESS_EVENT.deadlineReturned,
      });
    }
  };

  /**
   * Runs one streak read, replacing the one in flight. Only the current read
   * reports back to the state machine; an aborted one is ignored.
   */
  const startStreakRead = () => {
    abortStreakRead();

    const controller = new AbortController();
    const streakRequest = startStreakRequest();
    const isCurrentRead = () =>
      streakRefreshControllerRef.current === controller && !controller.signal.aborted;

    streakRefreshControllerRef.current = controller;

    fetchTribeEventAttendanceStreakRequest({
      signal: controller.signal,
      tribeSlug: latestTribeSlugRef.current,
    })
      .then((refresh) => {
        if (!isCurrentRead()) {
          return;
        }

        streakRefreshControllerRef.current = null;
        dispatchStreakFreshness({ type: STREAK_FRESHNESS_EVENT.readSettled });
        applyStreakRefresh(streakRequest, refresh);
        applyStreakNextRefresh(streakRequest, refresh);
      })
      .catch(() => {
        // Deliberate fallback: an aborted or failed background read keeps the
        // streak on screen. The route handler logs its own failures, and a
        // passive refresh the viewer did not trigger must not raise a toast.
        if (isCurrentRead()) {
          streakRefreshControllerRef.current = null;
          dispatchStreakFreshness({ type: STREAK_FRESHNESS_EVENT.readSettled });
        }
      });
  };

  const streakSourceVersion = streakSource.version;

  useEffect(() => {
    latestTribeSlugRef.current = tribeSlug;
  }, [tribeSlug]);

  useEffect(() => {
    // A new server render replaces the local streak, so a retry of a passed
    // instant from the previous render no longer applies.
    latestStreakSourceRef.current = {
      nextRefreshAt: attendanceStreakNextRefreshAt,
      streak: attendanceStreak,
      version: streakSourceVersion,
    };
    const transition = transitionStreakFreshness(streakFreshnessStateRef.current, {
      type: STREAK_FRESHNESS_EVENT.sourceChanged,
    });

    streakFreshnessStateRef.current = transition.state;

    if (transition.commands.length > 0) {
      clearScheduledTimeout(scheduledStreakReadTimeoutRef);
    }
  }, [attendanceStreak, attendanceStreakNextRefreshAt, streakSourceVersion]);

  useEffect(() => {
    isUnmountedRef.current = false;

    return () => {
      isUnmountedRef.current = true;
      streakRefreshControllerRef.current?.abort();
      clearScheduledTimeout(scheduledStreakReadTimeoutRef);
    };
  }, []);

  const refreshAttendanceStreak: TribeEventMutations["refreshAttendanceStreak"] = () => {
    if (isUnmountedRef.current) {
      return;
    }

    dispatchStreakFreshness({ type: STREAK_FRESHNESS_EVENT.readRequested });
  };

  /**
   * Registers a creation, edit, deletion, or attendance answer that can change
   * the streak. The state machine aborts a read in flight (it started before
   * this mutation commits) and remembers it.
   */
  const beginStreakMutation = () => {
    dispatchStreakFreshness({ type: STREAK_FRESHNESS_EVENT.mutationStarted });

    return startStreakRequest();
  };

  /**
   * Marks a mutation as settled. Once no mutation is pending, the state
   * machine runs the read still needed against committed data.
   *
   * @param hasCommittedStreak - True when the successful response carried a
   *   post-commit streak.
   */
  const settleStreakMutation = (hasCommittedStreak: boolean) => {
    dispatchStreakFreshness({
      hasCommittedStreak,
      type: STREAK_FRESHNESS_EVENT.mutationSettled,
    });
  };

  const replaceVisibleEvents = (updater: OccurrencesUpdater) => {
    setVisibleEventsState((currentState) => ({
      events: updater(currentState.sourceEvents === events ? currentState.events : events),
      sourceEvents: events,
    }));
  };

  const saveEvent: TribeEventMutations["saveEvent"] = async (
    payload,
    editingOccurrence
  ) => {
    if (isSavingEventRef.current) {
      return false;
    }

    isSavingEventRef.current = true;
    setIsSavingEvent(true);

    const streakRequest = beginStreakMutation();
    let hasCommittedStreak = false;

    try {
      const result = await saveTribeEventRequest({
        eventId: editingOccurrence?.eventId ?? null,
        month,
        payload,
        tribeSlug,
      });

      if (!result.isSuccess) {
        toast.error(result.message ?? COPY.eventSaveFailure);
        return false;
      }

      const savedEventId =
        editingOccurrence?.eventId ?? result.occurrences[0]?.eventId ?? null;

      if (savedEventId) {
        replaceVisibleEvents((currentEvents) =>
          mergeSavedOccurrences(currentEvents, result.occurrences, savedEventId)
        );
      }

      applyStreakRefresh(streakRequest, result);
      applyStreakNextRefresh(streakRequest, result);
      hasCommittedStreak = result.attendanceStreak !== undefined;

      toast.success(result.message ?? COPY.eventSaveFallback);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(COPY.eventSaveFailure);
      return false;
    } finally {
      isSavingEventRef.current = false;
      setIsSavingEvent(false);
      settleStreakMutation(hasCommittedStreak);
    }
  };

  const deleteEvent: TribeEventMutations["deleteEvent"] = async (occurrence) => {
    if (isDeletingEventRef.current) {
      return false;
    }

    isDeletingEventRef.current = true;
    setIsDeletingEvent(true);

    const streakRequest = beginStreakMutation();
    let hasCommittedStreak = false;

    try {
      const result = await deleteTribeEventRequest({
        eventId: occurrence.eventId,
        tribeSlug,
      });

      if (!result.isSuccess) {
        toast.error(result.message ?? COPY.deleteFailure);
        return false;
      }

      replaceVisibleEvents((currentEvents) =>
        currentEvents.filter(
          (currentOccurrence) => currentOccurrence.eventId !== occurrence.eventId
        )
      );
      applyStreakRefresh(streakRequest, result);
      applyStreakNextRefresh(streakRequest, result);
      hasCommittedStreak = result.attendanceStreak !== undefined;
      toast.success(result.message ?? COPY.deleteSuccess);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(COPY.deleteFailure);
      return false;
    } finally {
      isDeletingEventRef.current = false;
      setIsDeletingEvent(false);
      settleStreakMutation(hasCommittedStreak);
    }
  };

  const setAttendance: TribeEventMutations["setAttendance"] = async (
    occurrence,
    status
  ) => {
    if (isSavingAttendanceRef.current) {
      return false;
    }

    isSavingAttendanceRef.current = true;
    setIsSavingAttendance(true);
    // Attendance responses carry no streak, so settling always lets a
    // deferred or interrupted read run against the committed answer.
    beginStreakMutation();

    try {
      const result = await saveTribeEventAttendanceRequest({
        occurrence,
        status,
        tribeSlug,
      });

      if (!result.isSuccess) {
        toast.error(result.message ?? COPY.attendanceFailure);

        if (result.isOccurrenceEnded) {
          onOccurrenceEnded?.(occurrence);
        }

        return false;
      }

      replaceVisibleEvents((currentEvents) =>
        currentEvents.map((currentOccurrence) =>
          currentOccurrence.occurrenceKey === occurrence.occurrenceKey
            ? { ...currentOccurrence, attendance: result.attendance }
            : currentOccurrence
        )
      );
      toast.success(result.message ?? COPY.attendanceSaved);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(COPY.attendanceFailure);
      return false;
    } finally {
      isSavingAttendanceRef.current = false;
      setIsSavingAttendance(false);
      settleStreakMutation(false);
    }
  };

  return {
    attendanceStreak: visibleAttendanceStreak,
    attendanceStreakNextRefreshAt: visibleStreakNextRefreshAt,
    deleteEvent,
    isDeletingEvent,
    isSavingAttendance,
    isSavingEvent,
    refreshAttendanceStreak,
    saveEvent,
    setAttendance,
    visibleEvents,
  };
}
