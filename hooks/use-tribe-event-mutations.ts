"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "beez-ui";

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

type AttendanceStreakState = {
  sourceStreak: TribeEventAttendanceStreakResult | null;
  streak: TribeEventAttendanceStreakResult | null;
};

type StreakNextRefreshState = {
  nextRefreshAt: string | null;
  sourceNextRefreshAt: string | null;
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
   * While a creation, edit, or deletion is uncommitted the read is deferred
   * until every one of them settles, so it never observes pre-commit data.
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
 * Owns the occurrences on screen and the save, delete, and attendance
 * requests. Each mutation applies the route handler's minimal response to the
 * local list instead of refreshing the route, and a ref-based guard drops
 * duplicate submissions while a request of the same kind is in flight.
 *
 * When the route renders a new `events` array (month navigation), local
 * mutations are discarded in favour of the fresh server data. The viewer
 * streak follows the same rule: creations, edits, and deletions replace it
 * with the value the route recomputed after committing, and among mutations
 * the most recently started one whose response carries a streak wins. The
 * next refresh instant follows the same ordering, tracked on its own: a
 * response may carry one field and omit the other.
 * Streak reads never race a mutation: starting a mutation aborts a read in
 * flight (it began before the commit), and a read requested while a mutation
 * is uncommitted is deferred until every mutation settles. Once they settle,
 * a deferred read always runs, and an aborted one runs again unless a
 * mutation already returned a post-commit streak, which covers it. Responses
 * without a streak (rejected or failed mutations) keep the one on screen.
 *
 * @param input - Server occurrences, streak and its next refresh instant,
 *   visible month, tribe slug, and the callback for answers the server
 *   rejected because the occurrence ended.
 * @returns Visible occurrences and streak, pending flags, and mutation callbacks that
 * resolve to `true` when the change was stored.
 */
export function useTribeEventMutations({
  attendanceStreak,
  attendanceStreakNextRefreshAt = null,
  events,
  month,
  onOccurrenceEnded,
  tribeSlug,
}: UseTribeEventMutationsInput): TribeEventMutations {
  const [visibleEventsState, setVisibleEventsState] = useState<VisibleEventsState>({
    events,
    sourceEvents: events,
  });
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceStreakState, setAttendanceStreakState] = useState<AttendanceStreakState>({
    sourceStreak: attendanceStreak,
    streak: attendanceStreak,
  });
  const [streakNextRefreshState, setStreakNextRefreshState] = useState<StreakNextRefreshState>({
    nextRefreshAt: attendanceStreakNextRefreshAt,
    sourceNextRefreshAt: attendanceStreakNextRefreshAt,
  });
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
  // Creations, edits, and deletions not settled yet. While any is pending a
  // streak read could observe pre-commit data, so reads wait for them.
  const pendingStreakMutationCountRef = useRef(0);
  // A read was requested while a mutation was pending. It always runs once
  // they settle: the mutation may have computed its streak before the
  // occurrence that asked for the read finished.
  const isStreakReadDeferredRef = useRef(false);
  // A read in flight was aborted by a starting mutation. It runs again once
  // mutations settle unless one of them returned a post-commit streak.
  const isStreakReadInterruptedRef = useRef(false);
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

  const visibleAttendanceStreak =
    attendanceStreakState.sourceStreak === attendanceStreak
      ? attendanceStreakState.streak
      : attendanceStreak;
  const visibleStreakNextRefreshAt =
    streakNextRefreshState.sourceNextRefreshAt === attendanceStreakNextRefreshAt
      ? streakNextRefreshState.nextRefreshAt
      : attendanceStreakNextRefreshAt;

  const startStreakRequest = () => {
    streakRequestSequenceRef.current += 1;

    return {
      requestSequence: streakRequestSequenceRef.current,
      sourceNextRefreshAt: attendanceStreakNextRefreshAt,
      sourceStreak: attendanceStreak,
    };
  };

  const applyStreakRefresh = (
    request: ReturnType<typeof startStreakRequest>,
    refresh: TribeEventStreakRefresh
  ) => {
    if (
      refresh.attendanceStreak === undefined ||
      request.requestSequence < appliedStreakRequestSequenceRef.current
    ) {
      return;
    }

    appliedStreakRequestSequenceRef.current = request.requestSequence;

    // Tagged with the server streak seen when the request started: if the
    // route renders a new one meanwhile (navigation), the fresher server
    // value wins, the same way new server events replace local mutations.
    setAttendanceStreakState({
      sourceStreak: request.sourceStreak,
      streak: refresh.attendanceStreak,
    });
  };

  /**
   * Stores the next refresh instant a streak read or a series mutation
   * returned, tagged with the server value seen when the request started and
   * ordered by request sequence (same rules as the streak). An absent instant
   * keeps the one already watched.
   */
  const applyStreakNextRefresh = (
    request: ReturnType<typeof startStreakRequest>,
    read: TribeEventStreakReadResult
  ) => {
    if (
      read.attendanceStreakNextRefreshAt === undefined ||
      request.requestSequence < appliedStreakNextRefreshRequestSequenceRef.current
    ) {
      return;
    }

    appliedStreakNextRefreshRequestSequenceRef.current = request.requestSequence;

    setStreakNextRefreshState({
      nextRefreshAt: read.attendanceStreakNextRefreshAt,
      sourceNextRefreshAt: request.sourceNextRefreshAt,
    });
  };

  useEffect(() => {
    isUnmountedRef.current = false;

    return () => {
      isUnmountedRef.current = true;
      streakRefreshControllerRef.current?.abort();
    };
  }, []);

  const refreshAttendanceStreak: TribeEventMutations["refreshAttendanceStreak"] = () => {
    if (isUnmountedRef.current) {
      return;
    }

    if (pendingStreakMutationCountRef.current > 0) {
      isStreakReadDeferredRef.current = true;
      return;
    }

    streakRefreshControllerRef.current?.abort();

    const controller = new AbortController();
    const streakRequest = startStreakRequest();

    streakRefreshControllerRef.current = controller;

    fetchTribeEventAttendanceStreakRequest({ signal: controller.signal, tribeSlug })
      .then((refresh) => {
        if (!controller.signal.aborted) {
          applyStreakRefresh(streakRequest, refresh);
          applyStreakNextRefresh(streakRequest, refresh);
        }
      })
      .catch(() => {
        // Deliberate fallback: an aborted or failed background read keeps the
        // streak on screen. The route handler logs its own failures, and a
        // passive refresh the viewer did not trigger must not raise a toast.
      })
      .finally(() => {
        if (streakRefreshControllerRef.current === controller) {
          streakRefreshControllerRef.current = null;
        }
      });
  };

  /**
   * Registers a creation, edit, or deletion that can change the streak. A
   * read in flight started before this mutation commits, so it is aborted and
   * remembered for `settleStreakMutation`.
   */
  const beginStreakMutation = () => {
    const streakRefreshController = streakRefreshControllerRef.current;

    if (streakRefreshController) {
      streakRefreshController.abort();
      streakRefreshControllerRef.current = null;
      isStreakReadInterruptedRef.current = true;
    }

    pendingStreakMutationCountRef.current += 1;

    return startStreakRequest();
  };

  /**
   * Marks a mutation as settled. A post-commit streak in its response covers
   * an interrupted read; once no mutation is pending, a deferred read, or an
   * interrupted one nobody covered, runs against committed data.
   *
   * @param refresh - Streak carried by a successful response, or undefined
   *   when the mutation failed or was rejected.
   */
  const settleStreakMutation = (refresh: TribeEventStreakRefresh | undefined) => {
    if (refresh?.attendanceStreak !== undefined) {
      isStreakReadInterruptedRef.current = false;
    }

    pendingStreakMutationCountRef.current -= 1;

    if (pendingStreakMutationCountRef.current > 0) {
      return;
    }

    const shouldReadStreak =
      isStreakReadDeferredRef.current || isStreakReadInterruptedRef.current;

    isStreakReadDeferredRef.current = false;
    isStreakReadInterruptedRef.current = false;

    if (shouldReadStreak) {
      refreshAttendanceStreak();
    }
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
    let streakRefresh: TribeEventStreakRefresh | undefined;

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
      streakRefresh = result;

      toast.success(result.message ?? COPY.eventSaveFallback);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(COPY.eventSaveFailure);
      return false;
    } finally {
      isSavingEventRef.current = false;
      setIsSavingEvent(false);
      settleStreakMutation(streakRefresh);
    }
  };

  const deleteEvent: TribeEventMutations["deleteEvent"] = async (occurrence) => {
    if (isDeletingEventRef.current) {
      return false;
    }

    isDeletingEventRef.current = true;
    setIsDeletingEvent(true);

    const streakRequest = beginStreakMutation();
    let streakRefresh: TribeEventStreakRefresh | undefined;

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
      streakRefresh = result;
      toast.success(result.message ?? COPY.deleteSuccess);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(COPY.deleteFailure);
      return false;
    } finally {
      isDeletingEventRef.current = false;
      setIsDeletingEvent(false);
      settleStreakMutation(streakRefresh);
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
