"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  INITIAL_OCCURRENCES_FRESHNESS_STATE,
  OCCURRENCES_FRESHNESS_COMMAND,
  OCCURRENCES_FRESHNESS_EVENT,
  OCCURRENCES_MUTATION_OUTCOME,
  OCCURRENCES_READ_OUTCOME,
  transitionOccurrencesFreshness,
  type OccurrencesFreshnessCommand,
  type OccurrencesFreshnessEvent,
  type OccurrencesMutationOutcome,
  type OccurrencesReadOutcome,
} from "@/lib/events/tribe-event-occurrences-freshness";
import {
  INITIAL_STREAK_FRESHNESS_STATE,
  STREAK_FRESHNESS_COMMAND,
  STREAK_FRESHNESS_EVENT,
  STREAK_MUTATION_OUTCOME,
  STREAK_READ_OUTCOME,
  transitionStreakFreshness,
  type StreakFreshnessCommand,
  type StreakFreshnessEvent,
  type StreakMutationOutcome,
} from "@/lib/events/tribe-event-streak-freshness";
import {
  compareOccurrencesByStart,
  mergeSavedOccurrences,
} from "@/lib/events/tribe-events-calendar-grid";
import {
  clearTribeEventOccurrenceExceptionRequest,
  deleteTribeEventRequest,
  fetchTribeEventAttendanceStreakRequest,
  fetchTribeEventOccurrencesRequest,
  saveTribeEventAttendanceRequest,
  saveTribeEventOccurrenceExceptionRequest,
  saveTribeEventRequest,
  type TribeEventMutationFailure,
  type TribeEventSavePayload,
  type TribeEventStreakReadResult,
  type TribeEventStreakRefresh,
} from "@/lib/events/tribe-events-api-client";
import type { TribeEventOccurrenceExceptionRequestBody } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-exception-request-schemas";
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

/** Server render seen when a request that can refresh the streak started. */
type StreakRequest = {
  source: StreakSource;
};

/**
 * Applies the streak fields of a settled mutation response, when the state
 * machine allows it.
 */
type MutationStreakApplier = () => void;

/** Streak outcome of a series mutation response plus the applier of its fields. */
type SeriesMutationStreak = {
  apply: MutationStreakApplier;
  outcome: StreakMutationOutcome;
};

type OccurrencesUpdater = (
  currentEvents: TribeEventOccurrenceResult[]
) => TribeEventOccurrenceResult[];

/**
 * Client state and mutations of the tribe events calendar.
 */
export type TribeEventMutations = {
  /**
   * Replaces the occurrences of one series with a fresh set from the server
   * (for example after approving a proposal).
   */
  applyEventOccurrences: (eventId: string, occurrences: TribeEventOccurrenceResult[]) => void;
  /** "Restaurar fecha": removes the exception of the occurrence. */
  clearOccurrenceException: (occurrence: TribeEventOccurrenceResult) => Promise<boolean>;
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
  isSavingException: boolean;
  /** "Cancelar esta fecha" / "Mover esta fecha". */
  saveOccurrenceException: (
    occurrence: TribeEventOccurrenceResult,
    body: Omit<TribeEventOccurrenceExceptionRequestBody, "originalStartsAt">
  ) => Promise<boolean>;
  /**
   * Reads the streak again (for example when an occurrence on screen
   * finishes). Failures keep the streak on screen without user feedback and
   * retry with a bounded backoff.
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
  exceptionFailure: "No pudimos actualizar la fecha.",
  exceptionSaved: "Fecha actualizada.",
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
 * Classifies a mutation failure the route answered: a rejection stored
 * nothing, while an ambiguous failure may hide a committed mutation.
 */
function readFailedMutationOutcome(
  failure: Pick<TribeEventMutationFailure, "isOutcomeAmbiguous">
): OccurrencesMutationOutcome {
  return failure.isOutcomeAmbiguous
    ? OCCURRENCES_MUTATION_OUTCOME.ambiguous
    : OCCURRENCES_MUTATION_OUTCOME.rejected;
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
 * every new render replaces local state even when its values repeat.
 *
 * When to read the streak again is decided by the pure state machine in
 * `lib/events/tribe-event-streak-freshness.ts`; this hook only feeds it
 * events and executes its commands (start or abort the read, schedule or
 * cancel a delayed retry). Reads never overlap uncommitted creations, edits,
 * deletions, or attendance answers; a mutation response only lands on
 * screen when that mutation was pending alone and carried both the streak
 * and its next refresh instant, and any overlap, omitted field, or failure
 * turns into a single read once every mutation settles; and a returned
 * instant that already passed reads right away and then retries with a
 * bounded backoff while the server keeps returning it. A read that fails (error
 * status, unusable body, or network failure) retries with the same bounded
 * backoff, and so does a partial read (it returned the streak without its next
 * refresh instant). On unmount the state machine is disposed: it aborts the
 * read in flight, cancels the scheduled one, and a mutation that settles
 * afterwards never starts a read nor applies its streak.
 *
 * The occurrences on screen follow the same idea through
 * `lib/events/tribe-event-occurrences-freshness.ts`: every mutation applies
 * its own response right away, but when mutations overlap (an edit and an
 * attendance answer read their summaries in separate transactions, so their
 * responses cannot be ordered) or a new server render arrives while one is
 * pending, the visible month is read once every mutation settles and that
 * read replaces the occurrences on screen. A mutation whose outcome is
 * ambiguous (network failure, timeout, unreadable body, or 5xx) may have
 * committed without its response landing, so it also requires that read even
 * when it was pending alone; a rejection with a readable body (4xx) stored
 * nothing and reads nothing. A month read that fails (error
 * status, unusable body, or network failure) retries with the same bounded
 * backoff as the streak and then stops; on unmount the scheduled retry is
 * cancelled.
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
  const [isSavingException, setIsSavingException] = useState(false);
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
  // Freshness state machine (pending mutations, read in flight or needed,
  // passed deadline retries). Kept in a ref: it drives side effects only.
  const streakFreshnessStateRef = useRef(INITIAL_STREAK_FRESHNESS_STATE);
  // Delayed retry of a passed next refresh instant, if any.
  const scheduledStreakReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingEventRef = useRef(false);
  const isDeletingEventRef = useRef(false);
  const isSavingAttendanceRef = useRef(false);
  const isSavingExceptionRef = useRef(false);
  // In-flight streak refresh, aborted when a newer refresh or a mutation
  // starts, or the calendar unmounts, so a stale read never lands on screen.
  const streakRefreshControllerRef = useRef<AbortController | null>(null);
  // Occurrences freshness state machine (pending mutations, overlap, month
  // read in flight or required), the month read in flight, and the latest
  // server occurrences and month that a read starting later must target.
  const occurrencesFreshnessStateRef = useRef(INITIAL_OCCURRENCES_FRESHNESS_STATE);
  const occurrencesReadControllerRef = useRef<AbortController | null>(null);
  // Delayed retry of a month read that settled without usable data, if any.
  const scheduledOccurrencesReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSourceEventsRef = useRef(events);
  const latestMonthRef = useRef(month);
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

  const startStreakRequest = (): StreakRequest => ({ source: latestStreakSourceRef.current });

  const abortStreakRead = () => {
    streakRefreshControllerRef.current?.abort();
    streakRefreshControllerRef.current = null;
  };

  /**
   * Feeds one event to the freshness state machine and executes the commands
   * it emits, in order.
   *
   * @param event - Event for the state machine.
   * @param applyMutationStreak - Applies the settled mutation response when
   *   the state machine emits `apply-mutation-streak`.
   */
  const dispatchStreakFreshness = (
    event: StreakFreshnessEvent,
    applyMutationStreak?: MutationStreakApplier
  ) => {
    const transition = transitionStreakFreshness(streakFreshnessStateRef.current, event);

    streakFreshnessStateRef.current = transition.state;
    transition.commands.forEach((command) =>
      runStreakFreshnessCommand(command, applyMutationStreak)
    );
  };

  const runStreakFreshnessCommand = (
    command: StreakFreshnessCommand,
    applyMutationStreak?: MutationStreakApplier
  ) => {
    switch (command.type) {
      case STREAK_FRESHNESS_COMMAND.applyMutationStreak:
        applyMutationStreak?.();
        return;
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

  /**
   * Stores the streak a read or an applied mutation response returned. Reads
   * never overlap mutations and a mutation response only arrives here when
   * that mutation was pending alone, so responses need no ordering.
   */
  const applyStreakRefresh = (request: StreakRequest, refresh: TribeEventStreakRefresh) => {
    if (refresh.attendanceStreak === undefined) {
      return;
    }

    // Tagged with the server render seen when the request started: if the
    // route renders a new one meanwhile (navigation), the fresher server
    // value wins, the same way new server events replace local mutations.
    setAttendanceStreakState({
      source: request.source,
      streak: refresh.attendanceStreak,
    });
  };

  /**
   * Stores the next refresh instant a streak read or an applied series
   * mutation returned, tagged with the server render seen when the request
   * started (same rules as the streak). An absent instant in a read keeps the
   * one already watched. The state machine then decides whether an
   * instant already reached by the real clock needs a read or a delayed retry.
   */
  const applyStreakNextRefresh = (request: StreakRequest, read: TribeEventStreakReadResult) => {
    if (read.attendanceStreakNextRefreshAt === undefined) {
      return;
    }

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
      .then((read) => {
        if (!isCurrentRead()) {
          return;
        }

        streakRefreshControllerRef.current = null;

        if (!read.isSuccess) {
          // The streak on screen stays and the state machine schedules a
          // bounded retry; a passive refresh must not raise a toast.
          dispatchStreakFreshness({
            outcome: STREAK_READ_OUTCOME.failed,
            type: STREAK_FRESHNESS_EVENT.readSettled,
          });
          return;
        }

        // A partial read (no usable next refresh instant) still shows its
        // streak, but the instant on screen may already have passed, so the
        // state machine retries it with the bounded backoff.
        dispatchStreakFreshness({
          outcome: read.isPartial ? STREAK_READ_OUTCOME.partial : STREAK_READ_OUTCOME.succeeded,
          type: STREAK_FRESHNESS_EVENT.readSettled,
        });
        applyStreakRefresh(streakRequest, read);

        if (!read.isPartial) {
          applyStreakNextRefresh(streakRequest, read);
        }
      })
      .catch(() => {
        // Deliberate fallback: an aborted read is stale and is ignored; a
        // network failure of the current read keeps the streak on screen and
        // retries with the bounded backoff. The route handler logs its own
        // failures, and a passive refresh must not raise a toast.
        if (isCurrentRead()) {
          streakRefreshControllerRef.current = null;
          dispatchStreakFreshness({
            outcome: STREAK_READ_OUTCOME.failed,
            type: STREAK_FRESHNESS_EVENT.readSettled,
          });
        }
      });
  };

  const abortOccurrencesRead = () => {
    occurrencesReadControllerRef.current?.abort();
    occurrencesReadControllerRef.current = null;
  };

  /**
   * Reads the visible month again, replacing the read in flight. Its
   * occurrences only land while the route keeps rendering the server
   * occurrences seen when it started; a failure keeps the occurrences on
   * screen and the state machine schedules a bounded retry.
   */
  const startOccurrencesRead = () => {
    abortOccurrencesRead();

    const controller = new AbortController();
    const sourceEvents = latestSourceEventsRef.current;
    const isCurrentRead = () =>
      occurrencesReadControllerRef.current === controller && !controller.signal.aborted;
    const settleOccurrencesRead = (outcome: OccurrencesReadOutcome) => {
      occurrencesReadControllerRef.current = null;
      dispatchOccurrencesFreshness({ outcome, type: OCCURRENCES_FRESHNESS_EVENT.readSettled });
    };

    occurrencesReadControllerRef.current = controller;

    fetchTribeEventOccurrencesRequest({
      month: latestMonthRef.current,
      signal: controller.signal,
      tribeSlug: latestTribeSlugRef.current,
    })
      .then((read) => {
        if (!isCurrentRead()) {
          return;
        }

        settleOccurrencesRead(
          read.isSuccess ? OCCURRENCES_READ_OUTCOME.succeeded : OCCURRENCES_READ_OUTCOME.failed
        );

        if (read.isSuccess && latestSourceEventsRef.current === sourceEvents) {
          setVisibleEventsState({ events: read.occurrences, sourceEvents });
        }
      })
      .catch(() => {
        // Deliberate fallback: an aborted read is stale and is ignored; a
        // network failure keeps the occurrences on screen and retries with the
        // bounded backoff. A passive refresh must not raise a toast.
        if (isCurrentRead()) {
          settleOccurrencesRead(OCCURRENCES_READ_OUTCOME.failed);
        }
      });
  };

  /**
   * Feeds one event to the occurrences freshness state machine and executes
   * the commands it emits, in order.
   */
  const dispatchOccurrencesFreshness = (event: OccurrencesFreshnessEvent) => {
    const transition = transitionOccurrencesFreshness(occurrencesFreshnessStateRef.current, event);

    occurrencesFreshnessStateRef.current = transition.state;
    transition.commands.forEach(runOccurrencesFreshnessCommand);
  };

  const runOccurrencesFreshnessCommand = (command: OccurrencesFreshnessCommand) => {
    switch (command.type) {
      case OCCURRENCES_FRESHNESS_COMMAND.startRead:
        startOccurrencesRead();
        return;
      case OCCURRENCES_FRESHNESS_COMMAND.abortRead:
        abortOccurrencesRead();
        return;
      case OCCURRENCES_FRESHNESS_COMMAND.scheduleRead:
        clearScheduledTimeout(scheduledOccurrencesReadTimeoutRef);
        scheduledOccurrencesReadTimeoutRef.current = setTimeout(() => {
          scheduledOccurrencesReadTimeoutRef.current = null;
          dispatchOccurrencesFreshness({ type: OCCURRENCES_FRESHNESS_EVENT.readRetryDue });
        }, command.delayMs);
        return;
      case OCCURRENCES_FRESHNESS_COMMAND.cancelScheduledRead:
        clearScheduledTimeout(scheduledOccurrencesReadTimeoutRef);
    }
  };

  const streakSourceVersion = streakSource.version;

  useEffect(() => {
    latestTribeSlugRef.current = tribeSlug;
  }, [tribeSlug]);

  useEffect(() => {
    latestMonthRef.current = month;
  }, [month]);

  const notifyOccurrencesSourceChanged = useEffectEvent(() => {
    dispatchOccurrencesFreshness({ type: OCCURRENCES_FRESHNESS_EVENT.sourceChanged });
  });

  useEffect(() => {
    if (latestSourceEventsRef.current === events) {
      return;
    }

    // A new server render replaces the local occurrences, and it may predate
    // a pending mutation: the state machine then requires a month read.
    latestSourceEventsRef.current = events;
    notifyOccurrencesSourceChanged();
  }, [events]);

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
    // A remount (Strict Mode replays effects) starts from a fresh state
    // machine, since the previous cleanup disposed it.
    if (streakFreshnessStateRef.current.isDisposed) {
      streakFreshnessStateRef.current = INITIAL_STREAK_FRESHNESS_STATE;
    }

    if (occurrencesFreshnessStateRef.current.isDisposed) {
      occurrencesFreshnessStateRef.current = INITIAL_OCCURRENCES_FRESHNESS_STATE;
    }

    return () => {
      // Disposing makes every later event (a mutation settling after the
      // unmount) a no-op; its commands abort the read in flight and cancel
      // the scheduled one, executed here through the refs they target.
      const transition = transitionStreakFreshness(streakFreshnessStateRef.current, {
        type: STREAK_FRESHNESS_EVENT.disposed,
      });

      streakFreshnessStateRef.current = transition.state;

      if (transition.commands.length > 0) {
        streakRefreshControllerRef.current?.abort();
        streakRefreshControllerRef.current = null;
        clearScheduledTimeout(scheduledStreakReadTimeoutRef);
      }

      // The occurrences state machine is disposed the same way: its commands
      // abort the month read in flight and cancel the scheduled retry.
      occurrencesFreshnessStateRef.current = transitionOccurrencesFreshness(
        occurrencesFreshnessStateRef.current,
        { type: OCCURRENCES_FRESHNESS_EVENT.disposed }
      ).state;
      occurrencesReadControllerRef.current?.abort();
      occurrencesReadControllerRef.current = null;
      clearScheduledTimeout(scheduledOccurrencesReadTimeoutRef);
    };
  }, []);

  const refreshAttendanceStreak: TribeEventMutations["refreshAttendanceStreak"] = () => {
    dispatchStreakFreshness({ type: STREAK_FRESHNESS_EVENT.readRequested });
  };

  /**
   * Registers a creation, edit, deletion, or attendance answer that can change
   * the streak. The state machine aborts a read in flight (it started before
   * this mutation commits) and remembers it.
   */
  const beginStreakMutation = () => {
    dispatchOccurrencesFreshness({ type: OCCURRENCES_FRESHNESS_EVENT.mutationStarted });
    dispatchStreakFreshness({ type: STREAK_FRESHNESS_EVENT.mutationStarted });

    return startStreakRequest();
  };

  /**
   * Marks a mutation as settled in both state machines. The streak one applies
   * its response only when it was pending alone and carried both streak
   * fields; otherwise, once no mutation is pending, it runs the read still
   * needed against committed data. The occurrences one reads the visible month
   * once every mutation settles when the batch overlapped or this mutation's
   * outcome is ambiguous.
   *
   * @param streakOutcome - What the mutation tells about the streak.
   * @param occurrencesOutcome - Whether the mutation applied its response,
   *   was rejected, or may have committed without a usable response.
   * @param applyMutationStreak - Applies the response fields when allowed.
   */
  const settleStreakMutation = (
    streakOutcome: StreakMutationOutcome,
    occurrencesOutcome: OccurrencesMutationOutcome,
    applyMutationStreak?: MutationStreakApplier
  ) => {
    dispatchStreakFreshness(
      { outcome: streakOutcome, type: STREAK_FRESHNESS_EVENT.mutationSettled },
      applyMutationStreak
    );
    dispatchOccurrencesFreshness({
      outcome: occurrencesOutcome,
      type: OCCURRENCES_FRESHNESS_EVENT.mutationSettled,
    });
  };

  /**
   * Classifies a successful series mutation response and builds the applier
   * of its streak fields. It only carries the streak when both the streak and
   * its next refresh instant are present.
   */
  const readSeriesMutationStreak = (
    streakRequest: StreakRequest,
    response: TribeEventStreakReadResult
  ): SeriesMutationStreak => ({
    apply: () => {
      applyStreakRefresh(streakRequest, response);
      applyStreakNextRefresh(streakRequest, response);
    },
    outcome:
      response.attendanceStreak !== undefined &&
      response.attendanceStreakNextRefreshAt !== undefined
        ? STREAK_MUTATION_OUTCOME.carried
        : STREAK_MUTATION_OUTCOME.missing,
  });

  /**
   * Settles a series mutation. A failed or unanswered one counts as a missing
   * streak and reads it again (an ambiguous failure may still have committed).
   *
   * @param seriesMutationStreak - Streak of a successful response, or null.
   * @param occurrencesOutcome - How the mutation settled for the occurrences.
   */
  const settleSeriesStreakMutation = (
    seriesMutationStreak: SeriesMutationStreak | null,
    occurrencesOutcome: OccurrencesMutationOutcome
  ) => {
    settleStreakMutation(
      seriesMutationStreak?.outcome ?? STREAK_MUTATION_OUTCOME.missing,
      occurrencesOutcome,
      seriesMutationStreak?.apply
    );
  };

  const replaceVisibleEvents = (updater: OccurrencesUpdater) => {
    setVisibleEventsState((currentState) => ({
      events: updater(currentState.sourceEvents === events ? currentState.events : events),
      sourceEvents: events,
    }));
  };

  const applyEventOccurrences: TribeEventMutations["applyEventOccurrences"] = (
    eventId,
    occurrences
  ) => {
    replaceVisibleEvents((currentEvents) =>
      mergeSavedOccurrences(currentEvents, occurrences, eventId)
    );
  };

  // Month on screen when a response arrives. A response computed for another
  // month (the viewer navigated while it was in flight) is never merged.
  const isStaleMonth = (requestMonth: string): boolean =>
    latestMonthRef.current !== requestMonth;

  /**
   * Runs one exception request (save or clear) with the shared duplicate
   * guard, toasts, and the incremental patch of the series. A cancelled or
   * moved date changes which occurrences count for the streak and when it
   * changes next, and its response carries no streak, so it takes part in
   * both freshness state machines like the other mutations: the streak is
   * read again once every mutation settles, and the visible month is read
   * again when the batch overlapped or the outcome is ambiguous.
   */
  const runExceptionMutation = async (
    occurrence: TribeEventOccurrenceResult,
    request: (requestMonth: string) => ReturnType<typeof clearTribeEventOccurrenceExceptionRequest>
  ): Promise<boolean> => {
    if (isSavingExceptionRef.current) {
      return false;
    }

    isSavingExceptionRef.current = true;
    setIsSavingException(true);

    const requestMonth = month;

    beginStreakMutation();
    // Stays ambiguous unless the route answers: a network failure or timeout
    // may still have committed the mutation.
    let occurrencesOutcome: OccurrencesMutationOutcome = OCCURRENCES_MUTATION_OUTCOME.ambiguous;

    try {
      const result = await request(requestMonth);

      if (!result.isSuccess) {
        occurrencesOutcome = readFailedMutationOutcome(result);
        toast.error(result.message ?? COPY.exceptionFailure);
        return false;
      }

      if (!isStaleMonth(requestMonth)) {
        applyEventOccurrences(occurrence.eventId, result.occurrences);
      }

      occurrencesOutcome = OCCURRENCES_MUTATION_OUTCOME.applied;
      toast.success(result.message ?? COPY.exceptionSaved);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback;
      // the outcome stays ambiguous and the visible month is read again.
      toast.error(COPY.exceptionFailure);
      return false;
    } finally {
      isSavingExceptionRef.current = false;
      setIsSavingException(false);
      settleStreakMutation(STREAK_MUTATION_OUTCOME.missing, occurrencesOutcome);
    }
  };

  const saveOccurrenceException: TribeEventMutations["saveOccurrenceException"] = (
    occurrence,
    body
  ) =>
    runExceptionMutation(occurrence, (requestMonth) =>
      saveTribeEventOccurrenceExceptionRequest({
        body: { ...body, originalStartsAt: occurrence.originalStartsAt },
        eventId: occurrence.eventId,
        month: requestMonth,
        tribeSlug,
      })
    );

  const clearOccurrenceException: TribeEventMutations["clearOccurrenceException"] = (
    occurrence
  ) =>
    runExceptionMutation(occurrence, (requestMonth) =>
      clearTribeEventOccurrenceExceptionRequest({
        eventId: occurrence.eventId,
        month: requestMonth,
        originalStartsAt: occurrence.originalStartsAt,
        tribeSlug,
      })
    );

  const saveEvent: TribeEventMutations["saveEvent"] = async (
    payload,
    editingOccurrence
  ) => {
    if (isSavingEventRef.current) {
      return false;
    }

    isSavingEventRef.current = true;
    setIsSavingEvent(true);

    const requestMonth = month;
    const streakRequest = beginStreakMutation();
    let seriesMutationStreak: SeriesMutationStreak | null = null;
    // Stays ambiguous unless the route answers: a network failure or timeout
    // may still have committed the mutation.
    let occurrencesOutcome: OccurrencesMutationOutcome = OCCURRENCES_MUTATION_OUTCOME.ambiguous;

    try {
      const result = await saveTribeEventRequest({
        eventId: editingOccurrence?.eventId ?? null,
        month: requestMonth,
        payload,
        tribeSlug,
      });

      if (!result.isSuccess) {
        occurrencesOutcome = readFailedMutationOutcome(result);
        toast.error(result.message ?? COPY.eventSaveFailure);
        return false;
      }

      const savedEventId =
        editingOccurrence?.eventId ?? result.occurrences[0]?.eventId ?? null;

      if (savedEventId && !isStaleMonth(requestMonth)) {
        applyEventOccurrences(savedEventId, result.occurrences);
      }

      seriesMutationStreak = readSeriesMutationStreak(streakRequest, result);
      occurrencesOutcome = OCCURRENCES_MUTATION_OUTCOME.applied;

      toast.success(result.message ?? COPY.eventSaveFallback);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback;
      // the outcome stays ambiguous and the visible month is read again.
      toast.error(COPY.eventSaveFailure);
      return false;
    } finally {
      isSavingEventRef.current = false;
      setIsSavingEvent(false);
      settleSeriesStreakMutation(seriesMutationStreak, occurrencesOutcome);
    }
  };

  const deleteEvent: TribeEventMutations["deleteEvent"] = async (occurrence) => {
    if (isDeletingEventRef.current) {
      return false;
    }

    isDeletingEventRef.current = true;
    setIsDeletingEvent(true);

    const streakRequest = beginStreakMutation();
    let seriesMutationStreak: SeriesMutationStreak | null = null;
    // Stays ambiguous unless the route answers: a network failure or timeout
    // may still have committed the mutation.
    let occurrencesOutcome: OccurrencesMutationOutcome = OCCURRENCES_MUTATION_OUTCOME.ambiguous;

    try {
      const result = await deleteTribeEventRequest({
        eventId: occurrence.eventId,
        tribeSlug,
      });

      if (!result.isSuccess) {
        occurrencesOutcome = readFailedMutationOutcome(result);
        toast.error(result.message ?? COPY.deleteFailure);
        return false;
      }

      replaceVisibleEvents((currentEvents) =>
        currentEvents.filter(
          (currentOccurrence) => currentOccurrence.eventId !== occurrence.eventId
        )
      );
      seriesMutationStreak = readSeriesMutationStreak(streakRequest, result);
      occurrencesOutcome = OCCURRENCES_MUTATION_OUTCOME.applied;
      toast.success(result.message ?? COPY.deleteSuccess);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback;
      // the outcome stays ambiguous and the visible month is read again.
      toast.error(COPY.deleteFailure);
      return false;
    } finally {
      isDeletingEventRef.current = false;
      setIsDeletingEvent(false);
      settleSeriesStreakMutation(seriesMutationStreak, occurrencesOutcome);
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
    // Attendance responses carry no streak: settling lets a deferred or
    // interrupted read run against the committed answer, and overlapping a
    // series mutation keeps that mutation's response off screen.
    beginStreakMutation();
    // Stays ambiguous unless the route answers: a network failure or timeout
    // may still have committed the mutation.
    let occurrencesOutcome: OccurrencesMutationOutcome = OCCURRENCES_MUTATION_OUTCOME.ambiguous;

    try {
      const result = await saveTribeEventAttendanceRequest({
        occurrence,
        status,
        tribeSlug,
      });

      if (!result.isSuccess) {
        occurrencesOutcome = readFailedMutationOutcome(result);
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
      occurrencesOutcome = OCCURRENCES_MUTATION_OUTCOME.applied;
      toast.success(result.message ?? COPY.attendanceSaved);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback;
      // the outcome stays ambiguous and the visible month is read again.
      toast.error(COPY.attendanceFailure);
      return false;
    } finally {
      isSavingAttendanceRef.current = false;
      setIsSavingAttendance(false);
      settleStreakMutation(STREAK_MUTATION_OUTCOME.unaffected, occurrencesOutcome);
    }
  };

  return {
    applyEventOccurrences,
    clearOccurrenceException,
    attendanceStreak: visibleAttendanceStreak,
    attendanceStreakNextRefreshAt: visibleStreakNextRefreshAt,
    deleteEvent,
    isDeletingEvent,
    isSavingAttendance,
    isSavingEvent,
    isSavingException,
    refreshAttendanceStreak,
    saveEvent,
    saveOccurrenceException,
    setAttendance,
    visibleEvents,
  };
}
