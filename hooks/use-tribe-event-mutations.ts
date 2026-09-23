"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  compareOccurrencesByStart,
  mergeSavedOccurrences,
} from "@/lib/events/tribe-events-calendar-grid";
import {
  deleteTribeEventRequest,
  saveTribeEventAttendanceRequest,
  saveTribeEventRequest,
  type TribeEventSavePayload,
} from "@/lib/events/tribe-events-api-client";
import type {
  TribeEventAttendanceOption,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";

type UseTribeEventMutationsInput = {
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

type OccurrencesUpdater = (
  currentEvents: TribeEventOccurrenceResult[]
) => TribeEventOccurrenceResult[];

/**
 * Client state and mutations of the tribe events calendar.
 */
export type TribeEventMutations = {
  deleteEvent: (occurrence: TribeEventOccurrenceResult) => Promise<boolean>;
  isDeletingEvent: boolean;
  isSavingAttendance: boolean;
  isSavingEvent: boolean;
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
 * mutations are discarded in favour of the fresh server data.
 *
 * @param input - Server occurrences, visible month, and tribe slug.
 * @returns Visible occurrences, pending flags, and mutation callbacks that
 * resolve to `true` when the change was stored.
 */
export function useTribeEventMutations({
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
  const isSavingEventRef = useRef(false);
  const isDeletingEventRef = useRef(false);
  const isSavingAttendanceRef = useRef(false);
  const unsortedVisibleEvents =
    visibleEventsState.sourceEvents === events ? visibleEventsState.events : events;
  // The endpoint returns occurrences ordered, but the agenda groups by day and
  // relies on the order inside each day, so sort defensively on the client.
  const visibleEvents = useMemo(
    () => [...unsortedVisibleEvents].sort(compareOccurrencesByStart),
    [unsortedVisibleEvents]
  );

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
    deleteEvent,
    isDeletingEvent,
    isSavingAttendance,
    isSavingEvent,
    saveEvent,
    setAttendance,
    visibleEvents,
  };
}
