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
  /** Occurrences rendered by the server for the visible month. */
  events: TribeEventOccurrenceResult[];
  /** Visible `YYYY-MM` month, sent so saves return that month's occurrences. */
  month: string;
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

type OccurrencesUpdater = (
  currentEvents: TribeEventOccurrenceResult[]
) => TribeEventOccurrenceResult[];

/**
 * Client state and mutations of the tribe events calendar.
 */
export type TribeEventMutations = {
  /** Viewer streak, refreshed by creations, edits, and deletions of a series. */
  attendanceStreak: TribeEventAttendanceStreakResult | null;
  deleteEvent: (occurrence: TribeEventOccurrenceResult) => Promise<boolean>;
  isDeletingEvent: boolean;
  isSavingAttendance: boolean;
  isSavingEvent: boolean;
  /**
   * Reads the streak again (for example when an occurrence on screen
   * finishes). Failures keep the streak on screen without user feedback.
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
 * with the value the route recomputed, only the most recently started
 * request whose response carries a streak wins, and a response without a
 * streak (including rejected or failed mutations) keeps the one on screen and
 * never discards an earlier refresh still in flight.
 *
 * @param input - Server occurrences and streak, visible month, and tribe slug.
 * @returns Visible occurrences and streak, pending flags, and mutation callbacks that
 * resolve to `true` when the change was stored.
 */
export function useTribeEventMutations({
  attendanceStreak,
  events,
  month,
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
  // Increases on every request that can refresh the streak, ordering them by
  // start time. Issuing a request never invalidates another one in flight: a
  // rejected or failed mutation must not discard a valid refresh.
  const streakRequestSequenceRef = useRef(0);
  // Sequence of the newest request whose streak landed on screen. It only
  // advances when a response actually carries a usable streak, so a slower,
  // older response never overwrites the streak of a newer successful one.
  const appliedStreakRequestSequenceRef = useRef(0);
  const isSavingEventRef = useRef(false);
  const isDeletingEventRef = useRef(false);
  const isSavingAttendanceRef = useRef(false);
  // In-flight streak refresh, aborted when a newer refresh starts or the
  // calendar unmounts so a stale read never lands on screen.
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

  const startStreakRequest = () => {
    streakRequestSequenceRef.current += 1;

    return {
      requestSequence: streakRequestSequenceRef.current,
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

  useEffect(
    () => () => {
      streakRefreshControllerRef.current?.abort();
    },
    []
  );

  const refreshAttendanceStreak: TribeEventMutations["refreshAttendanceStreak"] = () => {
    streakRefreshControllerRef.current?.abort();

    const controller = new AbortController();
    const streakRequest = startStreakRequest();

    streakRefreshControllerRef.current = controller;

    fetchTribeEventAttendanceStreakRequest({ signal: controller.signal, tribeSlug })
      .then((refresh) => {
        if (!controller.signal.aborted) {
          applyStreakRefresh(streakRequest, refresh);
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

    const streakRequest = startStreakRequest();

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

      toast.success(result.message ?? COPY.eventSaveFallback);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(COPY.eventSaveFailure);
      return false;
    } finally {
      isSavingEventRef.current = false;
      setIsSavingEvent(false);
    }
  };

  const deleteEvent: TribeEventMutations["deleteEvent"] = async (occurrence) => {
    if (isDeletingEventRef.current) {
      return false;
    }

    isDeletingEventRef.current = true;
    setIsDeletingEvent(true);

    const streakRequest = startStreakRequest();

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
      toast.success(result.message ?? COPY.deleteSuccess);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(COPY.deleteFailure);
      return false;
    } finally {
      isDeletingEventRef.current = false;
      setIsDeletingEvent(false);
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
