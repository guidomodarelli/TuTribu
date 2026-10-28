"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn, toast, AnimatedCollapse, copyTextToClipboard } from "@golfo/ui";
import { useIsMobile, useHorizontalSwipe, useIsHydrated, useViewerTimeZone, HORIZONTAL_SWIPE_DIRECTION } from "@golfo/ui/hooks";

import { TribeEventAgendaItem } from "@/components/events/tribe-event-agenda-item";
import { TribeEventCalendarFeedDialog } from "@/components/events/tribe-event-calendar-feed-dialog";
import { TribeEventAttendeesPanel } from "@/components/events/tribe-event-attendees-panel";
import { TribeEventDeleteDialog } from "@/components/events/tribe-event-delete-dialog";
import { TribeEventDetailDialog } from "@/components/events/tribe-event-detail-dialog";
import {
  TRIBE_EVENT_FORM_PURPOSE,
  TribeEventFormDialog,
  type TribeEventFormInitialValues,
  type TribeEventFormPayload,
} from "@/components/events/tribe-event-form-dialog";
import {
  TribeEventOccurrenceExceptionDialog,
  type TribeEventOccurrenceExceptionMode,
} from "@/components/events/tribe-event-occurrence-exception-dialog";
import { TribeEventOccurrenceActivity } from "@/components/events/tribe-event-occurrence-activity";
import { TribeEventProposalFormDialog } from "@/components/events/tribe-event-proposal-form-dialog";
import { TribeEventProposalsPanel } from "@/components/events/tribe-event-proposals-panel";
import { TribeEventsAgenda } from "@/components/events/tribe-events-agenda";
import {
  TRIBE_EVENTS_VIEW_MODE,
  TribeEventsCalendarHeader,
  type TribeEventsViewMode,
} from "@/components/events/tribe-events-calendar-header";
import { TribeEventsEmptyState } from "@/components/events/tribe-events-empty-state";
import { TribeEventsMonthGrid } from "@/components/events/tribe-events-month-grid";
import { TribeEventsTypeFilter } from "@/components/events/tribe-events-type-filter";
import { TribeNextEvent } from "@/components/events/tribe-next-event";
import { advanceMinuteClockTo, useMinuteClock } from "@/hooks/use-minute-clock";
import { useOccurrenceFinishWatcher } from "@/hooks/use-occurrence-finish-watcher";
import { useTribeEventAttendanceReport } from "@/hooks/use-tribe-event-attendance-report";
import { useTribeEventCalendarFeed } from "@/hooks/use-tribe-event-calendar-feed";
import { useTribeEventMutations } from "@/hooks/use-tribe-event-mutations";
import { useTribeEventProposals } from "@/hooks/use-tribe-event-proposals";
import { useTribeEventsMonthNavigation } from "@/hooks/use-tribe-events-month-navigation";
import {
  formatBuenosAiresTime,
  getBuenosAiresDateKey,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";
import {
  readAttendanceStreakComputedTime,
  readAttendanceStreakNextRefreshTime,
} from "@/lib/events/tribe-event-attendance-streak-dto";
import type {
  TribeEventOccurrenceExceptionSubmission,
  TribeEventProposalSubmission,
} from "@/lib/events/tribe-event-form-submissions";
import { isOccurrenceCancelled } from "@/lib/events/tribe-event-occurrence-exception-copy";
import {
  getOccurrencePhaseChangeTimes,
  isOccurrencePast,
} from "@/lib/events/tribe-event-occurrence-timing";
import {
  filterOccurrencesByEventType,
  toggleEventTypeSelection,
} from "@/lib/events/tribe-event-type-filter";
import {
  createCalendarDays,
  groupAgendaDays,
  groupOccurrencesByDay,
} from "@/lib/events/tribe-events-calendar-grid";
import {
  buildTribeEventAttendanceExportUrl,
  buildTribeEventsRoute,
} from "@/lib/events/tribe-events-routes";
import {
  replaceCurrentUrlSearchParamValues,
  replaceCurrentUrlSearchParams,
} from "@/lib/browser-navigation";
import {
  TRIBE_EVENT_TEMPLATES,
  type TribeEventTemplate,
} from "@/src/modules/events/constants/tribe-event-templates";
import {
  TRIBE_EVENTS_ROUTE_QUERY,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import { getTribeEventOccurrenceEndTime } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceStreakResult,
  TribeEventMonthResult,
  TribeEventOccurrenceResult,
  TribeEventProposalResult,
  TribeEventType,
  TribeEventViewerPermissionsResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";
import { useMonthTransitionDirection } from "./use-month-transition-direction";

type TribeEventsCalendarProps = {
  /** Viewer-only attendance streak, computed on the server (null if none). */
  attendanceStreak?: TribeEventAttendanceStreakResult | null;
  /** ISO instant at which the server computed `attendanceStreak`. */
  attendanceStreakComputedAt?: string | null;
  /**
   * ISO instant at which the streak can change next: the nearest end of a
   * running or upcoming occurrence of the tribe, even outside this month.
   */
  attendanceStreakNextRefreshAt?: string | null;
  events: TribeEventOccurrenceResult[];
  /** Type filter from the URL (`type`), already validated by the page. */
  initialEventTypes?: readonly TribeEventType[];
  /** Deep-linked occurrence whose detail opens on load (validated server-side). */
  initialOccurrenceKey?: string | null;
  month: TribeEventMonthResult;
  /** Pending member proposals (managers only; 0 otherwise). */
  pendingProposalCount?: number;
  /** Listed occurrences with a published recording ("Grabación disponible"). */
  recordedOccurrenceKeys?: readonly string[];
  tribeSlug: string;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

type ExceptionDialogSession = {
  mode: TribeEventOccurrenceExceptionMode;
  occurrence: TribeEventOccurrenceResult;
  session: number;
} | null;

/**
 * Occurrences with a recording: the server listing plus the local changes
 * made from the detail dialog. A new listing from the route replaces them.
 */
type RecordedOccurrenceState = {
  keys: ReadonlySet<string>;
  sourceKeys: readonly string[];
};

type EventTypeSelectionState = {
  selectedTypes: readonly TribeEventType[];
  sourceTypes: readonly TribeEventType[];
};

type EventFormSession =
  | { mode: typeof FORM_MODE.closed }
  | {
      initialValues?: TribeEventFormInitialValues;
      mode: typeof FORM_MODE.create;
      session: number;
    }
  | {
      mode: typeof FORM_MODE.edit;
      occurrence: TribeEventOccurrenceResult;
      session: number;
    }
  | {
      initialValues: TribeEventFormInitialValues;
      mode: typeof FORM_MODE.approve;
      proposal: TribeEventProposalResult;
      session: number;
    };

const FORM_MODE = {
  approve: "approve",
  closed: "closed",
  create: "create",
  edit: "edit",
} as const;
const NO_EVENT_TYPES: readonly TribeEventType[] = [];
/** Pre-hydration views, in DOM order; CSS shows the one that fits the viewport. */
const AUTO_VIEW_MODES: readonly TribeEventsViewMode[] = [
  TRIBE_EVENTS_VIEW_MODE.calendar,
  TRIBE_EVENTS_VIEW_MODE.list,
];
/** Modifier that hides each pre-hydration view on the viewports it does not fit. */
const AUTO_VIEW_CLASS_NAME: Record<TribeEventsViewMode, string | undefined> = {
  [TRIBE_EVENTS_VIEW_MODE.calendar]: styles["TribeEventsCalendar__autoView--calendar"],
  [TRIBE_EVENTS_VIEW_MODE.list]: styles["TribeEventsCalendar__autoView--list"],
};
const ROLE_STATUS = "status";
const NO_RECORDED_OCCURRENCES: readonly string[] = [];
const TIME_LABEL_SUFFIX = " Buenos Aires";
const COPY = {
  filteredEmpty: "No hay eventos de los tipos elegidos este mes.",
  monthLoading: "Cargando los eventos del mes…",
  linkCopied: "Link copiado.",
  linkCopyFailure: "No pudimos copiar el link.",
} as const;

/** View the viewer switched to, and the month where that switch happened. */
type EnteredViewState = {
  month: string;
  viewMode: TribeEventsViewMode;
};

/** Day tapped in the phone grid, remembered only for the month it belongs to. */
type DaySelectionState = {
  dayKey: string | null;
  month: string;
};

type OccurrenceSelectionState = {
  occurrenceKey: string | null;
  sourceOccurrenceKey: string | null;
};

type TribeEventMutations = ReturnType<typeof useTribeEventMutations>;
type TribeEventProposalsState = ReturnType<typeof useTribeEventProposals>;

/**
 * View mode of the page. The month grid needs horizontal room, so phones
 * default to the agenda list until the viewer picks a mode explicitly.
 *
 * @returns The current mode, the views to render and the mode chooser.
 */
function useCalendarViewMode() {
  const isMobile = useIsMobile();
  const isHydrated = useIsHydrated();
  const [chosenViewMode, setChosenViewMode] = useState<TribeEventsViewMode | null>(null);
  const viewMode =
    chosenViewMode ?? (isMobile ? TRIBE_EVENTS_VIEW_MODE.list : TRIBE_EVENTS_VIEW_MODE.calendar);
  // `useIsMobile` cannot know the viewport on the server, so until hydration
  // both views are rendered and a CSS media query shows the right one. That
  // avoids flashing the desktop grid on phones before the client takes over.
  const shouldRenderBothViews = chosenViewMode === null && !isHydrated;
  // Only a view the viewer switched to plays its entrance; the view picked
  // automatically at hydration was already on screen, and a new month plays
  // its own directional entrance instead.
  const [enteredView, setEnteredView] = useState<EnteredViewState | null>(null);
  const renderedViewModes = shouldRenderBothViews ? AUTO_VIEW_MODES : [viewMode];

  const chooseViewMode = (nextViewMode: TribeEventsViewMode, currentMonth: string) => {
    if (nextViewMode !== viewMode) {
      setEnteredView({ month: currentMonth, viewMode: nextViewMode });
    }

    setChosenViewMode(nextViewMode);
  };

  return {
    chooseViewMode,
    chosenViewMode,
    enteredView,
    renderedViewModes,
    shouldRenderBothViews,
    viewMode,
  };
}

/**
 * Open detail and its "Asistentes" tab. A new deep link from the route
 * (another `event` query) replaces the local selection, the same way new
 * server events replace local mutations.
 *
 * @param initialOccurrenceKey - Deep-linked occurrence of the route.
 * @returns Selected occurrence key, the open report key and their setters.
 */
function useOccurrenceSelection(initialOccurrenceKey: string | null) {
  const [occurrenceSelection, setOccurrenceSelection] = useState<OccurrenceSelectionState>({
    occurrenceKey: initialOccurrenceKey,
    sourceOccurrenceKey: initialOccurrenceKey,
  });
  const selectedOccurrenceKey =
    occurrenceSelection.sourceOccurrenceKey === initialOccurrenceKey
      ? occurrenceSelection.occurrenceKey
      : initialOccurrenceKey;
  // Occurrence whose "Asistentes" tab is open; the report only loads for it.
  const [attendeesOccurrenceKey, setAttendeesOccurrenceKey] = useState<string | null>(null);

  return {
    attendeesOccurrenceKey,
    selectedOccurrenceKey,
    setAttendeesOccurrenceKey,
    setOccurrenceSelection,
  };
}

type CalendarMonthDataInput = Pick<
  TribeEventsCalendarProps,
  "attendanceStreakComputedAt" | "events" | "month" | "tribeSlug"
> & {
  initialOccurrenceKey: string | null;
  recordedOccurrenceKeys: readonly string[];
  serverAttendanceStreak: TribeEventAttendanceStreakResult | null;
  serverAttendanceStreakNextRefreshAt: string | null;
  setAttendeesOccurrenceKey: (occurrenceKey: string | null) => void;
  setOccurrenceSelection: (selection: OccurrenceSelectionState) => void;
};

/**
 * Month listing and its mutations. The server renders the first month;
 * later months are loaded in place from the events endpoint, so only the
 * month listing changes.
 */
function useCalendarMonthData({
  attendanceStreakComputedAt,
  events,
  initialOccurrenceKey,
  month,
  recordedOccurrenceKeys,
  serverAttendanceStreak,
  serverAttendanceStreakNextRefreshAt,
  setAttendeesOccurrenceKey,
  setOccurrenceSelection,
  tribeSlug,
}: CalendarMonthDataInput) {
  const serverMonthListing = useMemo(
    () => ({ events, month, recordedOccurrenceKeys }),
    [events, month, recordedOccurrenceKeys]
  );
  const monthNavigation = useTribeEventsMonthNavigation({
    // Another month never lists the open occurrence, so its detail closes
    // (the loaded month is pushed without `event`) and "Asistentes" resets.
    onMonthLoaded: () => {
      setAttendeesOccurrenceKey(null);
      setOccurrenceSelection({
        occurrenceKey: null,
        sourceOccurrenceKey: initialOccurrenceKey,
      });
    },
    serverListing: serverMonthListing,
    tribeSlug,
  });
  const mutations = useTribeEventMutations({
    attendanceStreak: serverAttendanceStreak,
    attendanceStreakNextRefreshAt: serverAttendanceStreakNextRefreshAt,
    // Every server render stamps a new instant, so it replaces local streak
    // state; a month loaded on the client keeps it (the streak spans months).
    attendanceStreakSourceVersion: attendanceStreakComputedAt,
    events: monthNavigation.listing.events,
    month: monthNavigation.listing.month.current,
    // The server checks the exact time: when it already considers the
    // occurrence ended, move the clock to that end so the UI shows it
    // finished without reloading the route, even if the local clock lags.
    onOccurrenceEnded: (occurrence) =>
      advanceMinuteClockTo(getTribeEventOccurrenceEndTime(occurrence)),
    tribeSlug,
  });

  return { monthNavigation, mutations };
}

/**
 * Minute clock of the page. Besides the minute ticks, the clock wakes up
 * exactly when an occurrence on screen opens its join window, starts, or
 * ends, so "Unirme", "En vivo", and the attendance answers change in the
 * same second the server does. The server also hands the next instant at
 * which the streak can change, which covers occurrences outside the visible
 * month (one that started last month and is still running is not listed
 * here, since the month matches occurrences by start). The clock wakes up
 * then too.
 */
function useCalendarClock({
  attendanceStreakComputedAt,
  mutations,
}: {
  attendanceStreakComputedAt: string | null;
  mutations: TribeEventMutations;
}) {
  const { attendanceStreakNextRefreshAt, refreshAttendanceStreak, visibleEvents } = mutations;
  const streakNextRefreshTime = readAttendanceStreakNextRefreshTime(
    attendanceStreakNextRefreshAt
  );
  const streakRefreshTimes = useMemo(
    () => (streakNextRefreshTime === null ? [] : [streakNextRefreshTime]),
    [streakNextRefreshTime]
  );
  const phaseChangeTimes = useMemo(
    () => [...visibleEvents.flatMap(getOccurrencePhaseChangeTimes), ...streakRefreshTimes],
    [streakRefreshTimes, visibleEvents]
  );
  const nowTime = useMinuteClock(phaseChangeTimes);
  // The streak counts the last finished occurrences, so the one that just
  // ended may change it: read it again once, without reloading the route.
  // An occurrence that ended between the server snapshot and hydration is
  // caught on the first clock value by comparing it with the snapshot instant.
  useOccurrenceFinishWatcher({
    extraFinishTimes: streakRefreshTimes,
    nowTime,
    occurrences: visibleEvents,
    onOccurrenceFinished: refreshAttendanceStreak,
    serverSnapshotTime: readAttendanceStreakComputedTime(attendanceStreakComputedAt),
  });

  return nowTime;
}

type CalendarDialogsInput = {
  attendanceStreakComputedAt: string | null;
  currentMonth: string;
  mutations: TribeEventMutations;
  pendingProposalCount: number;
  tribeSlug: string;
};

/** Proposals, calendar feed and occurrence exception dialogs with their open state. */
function useCalendarDialogs({
  attendanceStreakComputedAt,
  currentMonth,
  mutations,
  pendingProposalCount,
  tribeSlug,
}: CalendarDialogsInput) {
  const proposals = useTribeEventProposals({
    beginSeriesMutation: mutations.beginSeriesMutation,
    initialPendingCount: pendingProposalCount,
    month: currentMonth,
    onEventCreated: mutations.applyEventOccurrences,
    // Every server render stamps a new instant, so it replaces the local count.
    pendingCountSourceVersion: attendanceStreakComputedAt,
    tribeSlug,
  });
  const calendarFeed = useTribeEventCalendarFeed({ tribeSlug });
  const [isCalendarFeedOpen, setIsCalendarFeedOpen] = useState(false);
  const [isProposalFormOpen, setIsProposalFormOpen] = useState(false);
  const [proposalFormSession, setProposalFormSession] = useState(0);
  const [isProposalsPanelOpen, setIsProposalsPanelOpen] = useState(false);
  const [exceptionDialog, setExceptionDialog] = useState<ExceptionDialogSession>(null);

  const openProposalForm = () => {
    setProposalFormSession((currentSession) => currentSession + 1);
    setIsProposalFormOpen(true);
  };

  const openCalendarFeed = () => {
    setIsCalendarFeedOpen(true);
    calendarFeed.loadSubscription();
  };

  // The issued link is shown once: closing the dialog forgets it.
  const closeCalendarFeed = () => {
    setIsCalendarFeedOpen(false);
    calendarFeed.reset();
  };

  const openProposalsPanel = () => {
    setIsProposalsPanelOpen(true);
    proposals.loadProposals();
  };

  const submitProposal = async (submission: TribeEventProposalSubmission) => {
    if (await proposals.createProposal(submission)) {
      setIsProposalFormOpen(false);
    }
  };

  return {
    calendarFeed,
    closeCalendarFeed,
    exceptionDialog,
    isCalendarFeedOpen,
    isProposalFormOpen,
    isProposalsPanelOpen,
    openCalendarFeed,
    openProposalForm,
    openProposalsPanel,
    proposalFormSession,
    proposals,
    setExceptionDialog,
    setIsProposalFormOpen,
    setIsProposalsPanelOpen,
    submitProposal,
  };
}

type CalendarDialogsState = ReturnType<typeof useCalendarDialogs>;

/**
 * Type filter and recording badges. A new type filter from the route (month
 * navigation keeps it in the links) replaces the local selection, like the
 * deep-linked occurrence; a new listing replaces the local recording keys.
 */
function useCalendarFilters({
  initialEventTypes,
  listedRecordedKeys,
  visibleEvents,
}: {
  initialEventTypes: readonly TribeEventType[];
  listedRecordedKeys: readonly string[];
  visibleEvents: TribeEventOccurrenceResult[];
}) {
  const [eventTypeSelection, setEventTypeSelection] = useState<EventTypeSelectionState>({
    selectedTypes: initialEventTypes,
    sourceTypes: initialEventTypes,
  });
  const selectedEventTypes =
    eventTypeSelection.sourceTypes === initialEventTypes
      ? eventTypeSelection.selectedTypes
      : initialEventTypes;
  const serverRecordedKeys = useMemo(() => new Set(listedRecordedKeys), [listedRecordedKeys]);
  const [recordedOccurrenceState, setRecordedOccurrenceState] = useState<RecordedOccurrenceState>(
    () => ({ keys: serverRecordedKeys, sourceKeys: listedRecordedKeys })
  );
  const recordedKeys =
    recordedOccurrenceState.sourceKeys === listedRecordedKeys
      ? recordedOccurrenceState.keys
      : serverRecordedKeys;
  const filteredEvents = useMemo(
    () => filterOccurrencesByEventType(visibleEvents, selectedEventTypes),
    [selectedEventTypes, visibleEvents]
  );

  // The filter is client-side: toggling a chip never refetches; the URL
  // mirrors it (replaceState) so it can be shared and survives month links.
  const setSelectedEventTypes = (nextTypes: readonly TribeEventType[]) => {
    setEventTypeSelection({ selectedTypes: nextTypes, sourceTypes: initialEventTypes });
    replaceCurrentUrlSearchParamValues(TRIBE_EVENTS_ROUTE_QUERY.type, nextTypes);
  };

  // Every load or save in the detail dialog updates the agenda badge without a
  // reload. The functional update reads the latest keys (a load answer can
  // arrive after other renders) and keeps the state when nothing changed.
  const setOccurrenceRecordingAvailability = (occurrenceKey: string, hasRecording: boolean) => {
    setRecordedOccurrenceState((currentState) =>
      applyRecordingAvailability({
        currentState,
        hasRecording,
        listedRecordedKeys,
        occurrenceKey,
        serverRecordedKeys,
      })
    );
  };

  return {
    filteredEvents,
    recordedKeys,
    selectedEventTypes,
    setOccurrenceRecordingAvailability,
    setSelectedEventTypes,
  };
}

/** Recording keys after one occurrence gained or lost its recording. */
function applyRecordingAvailability({
  currentState,
  hasRecording,
  listedRecordedKeys,
  occurrenceKey,
  serverRecordedKeys,
}: {
  currentState: RecordedOccurrenceState;
  hasRecording: boolean;
  listedRecordedKeys: readonly string[];
  occurrenceKey: string;
  serverRecordedKeys: ReadonlySet<string>;
}): RecordedOccurrenceState {
  const currentKeys =
    currentState.sourceKeys === listedRecordedKeys ? currentState.keys : serverRecordedKeys;

  if (currentKeys.has(occurrenceKey) === hasRecording && currentKeys === currentState.keys) {
    return currentState;
  }

  const nextKeys = new Set(currentKeys);

  if (hasRecording) {
    nextKeys.add(occurrenceKey);
  } else {
    nextKeys.delete(occurrenceKey);
  }

  return { keys: nextKeys, sourceKeys: listedRecordedKeys };
}

type EventFormSessionsInput = {
  dialogs: CalendarDialogsState;
  mutations: TribeEventMutations;
  /** Closes the detail (and forgets its URL entry). */
  onCloseDetail: () => void;
};

/**
 * Event form (create, edit, approve), exception dialog sessions and the
 * delete confirmation. Session ids only grow, so every opening starts a
 * fresh dialog.
 */
function useEventFormSessions({ dialogs, mutations, onCloseDetail }: EventFormSessionsInput) {
  const [formSession, setFormSession] = useState<EventFormSession>({
    mode: FORM_MODE.closed,
  });
  const [pendingDeleteOccurrence, setPendingDeleteOccurrence] =
    useState<TribeEventOccurrenceResult | null>(null);
  const formSessionCounterRef = useRef(0);

  const nextSession = () => {
    formSessionCounterRef.current += 1;
    return formSessionCounterRef.current;
  };

  const openCreateForm = (initialValues?: TribeEventFormInitialValues) => {
    setFormSession({ initialValues, mode: FORM_MODE.create, session: nextSession() });
  };

  // "Revisar y aprobar" reuses the event form, prefilled with the proposal.
  const openApprovalForm = (proposal: TribeEventProposalResult) => {
    const session = nextSession();

    dialogs.setIsProposalsPanelOpen(false);
    setFormSession({
      initialValues: buildApprovalInitialValues(proposal),
      mode: FORM_MODE.approve,
      proposal,
      session,
    });
  };

  const openExceptionDialog = (
    mode: TribeEventOccurrenceExceptionMode,
    occurrence: TribeEventOccurrenceResult
  ) => {
    dialogs.setExceptionDialog({ mode, occurrence, session: nextSession() });
  };

  const openEditForm = (occurrence: TribeEventOccurrenceResult) => {
    const session = nextSession();

    onCloseDetail();
    setFormSession({ mode: FORM_MODE.edit, occurrence, session });
  };

  const closeForm = () => {
    setFormSession({ mode: FORM_MODE.closed });
  };

  const submitEventForm = async (payload: TribeEventFormPayload) => {
    if (await saveFormSession(formSession, payload, { mutations, proposals: dialogs.proposals })) {
      closeForm();
    }
  };

  const confirmDeleteEvent = async () => {
    if (!pendingDeleteOccurrence) {
      return;
    }

    if (await mutations.deleteEvent(pendingDeleteOccurrence)) {
      onCloseDetail();
      setPendingDeleteOccurrence(null);
    }
  };

  return {
    closeForm,
    confirmDeleteEvent,
    formSession,
    openApprovalForm,
    openCreateForm,
    openEditForm,
    openExceptionDialog,
    pendingDeleteOccurrence,
    setPendingDeleteOccurrence,
    submitEventForm,
  };
}

/** Event form values prefilled from a member proposal. */
function buildApprovalInitialValues(proposal: TribeEventProposalResult): TribeEventFormInitialValues {
  return {
    description: proposal.description ?? undefined,
    durationMinutes: proposal.durationMinutes,
    eventType: proposal.eventType,
    startsAt: proposal.startsAt,
    title: proposal.title,
  };
}

/**
 * Saves the open event form: approving publishes the proposal, otherwise
 * the event is created or the edited series is saved.
 *
 * @returns Whether the form can close.
 */
async function saveFormSession(
  formSession: EventFormSession,
  payload: TribeEventFormPayload,
  { mutations, proposals }: { mutations: TribeEventMutations; proposals: TribeEventProposalsState }
): Promise<boolean> {
  if (formSession.mode === FORM_MODE.closed) {
    return false;
  }

  if (formSession.mode === FORM_MODE.approve) {
    return proposals.approveProposal(formSession.proposal, payload);
  }

  return mutations.saveEvent(
    payload,
    formSession.mode === FORM_MODE.edit ? formSession.occurrence : null
  );
}

/**
 * Selected day of the phone grid and the agenda split. The phone grid shows
 * dots per day and lists the tapped day under the grid; until the viewer
 * taps one, today's agenda is shown when it belongs to the visible month.
 */
function useCalendarDayState({
  currentMonth,
  filteredEvents,
  nowTime,
  tribeSlug,
}: {
  currentMonth: string;
  filteredEvents: TribeEventOccurrenceResult[];
  nowTime: number | null;
  tribeSlug: string;
}) {
  const [arePastEventsVisible, setArePastEventsVisible] = useState(false);
  const [daySelection, setDaySelection] = useState<DaySelectionState>({
    dayKey: null,
    month: currentMonth,
  });
  const monthTransitionDirection = useMonthTransitionDirection(tribeSlug, currentMonth);
  // A day tapped in another month is not on this grid, so it falls back to today.
  const selectedDayKey = daySelection.month === currentMonth ? daySelection.dayKey : null;
  const selectDay = (dayKey: string) => {
    setDaySelection({ dayKey, month: currentMonth });
  };
  const calendarDays = useMemo(() => createCalendarDays(currentMonth), [currentMonth]);
  const occurrencesByDay = useMemo(() => groupOccurrencesByDay(filteredEvents), [filteredEvents]);
  const todayKey = nowTime === null ? null : getBuenosAiresDateKey(new Date(nowTime));
  const isTodayInMonth = calendarDays.some(
    (day) => day.isCurrentMonth && day.dateKey === todayKey
  );

  return {
    activeDayKey: selectedDayKey ?? (isTodayInMonth ? todayKey : null),
    arePastEventsVisible,
    calendarDays,
    monthTransitionDirection,
    occurrencesByDay,
    selectDay,
    setArePastEventsVisible,
    todayKey,
  };
}

/**
 * Agenda of the visible month. Past occurrences collapse only while the
 * month still has something ahead; browsing an old month shows everything,
 * since all of it is history. A cancelled date is never "the next event":
 * nobody will meet then.
 */
function useCalendarAgenda({
  arePastEventsVisible,
  filteredEvents,
  nowTime,
}: {
  arePastEventsVisible: boolean;
  filteredEvents: TribeEventOccurrenceResult[];
  nowTime: number | null;
}) {
  const isPast = (occurrence: TribeEventOccurrenceResult): boolean =>
    nowTime !== null && isOccurrencePast(occurrence, nowTime);
  const nextOccurrence =
    nowTime === null
      ? null
      : (filteredEvents.find(
          (occurrence) => !isPast(occurrence) && !isOccurrenceCancelled(occurrence)
        ) ?? null);
  const pastEvents = filteredEvents.filter(isPast);
  const upcomingEvents = filteredEvents.filter((occurrence) => !isPast(occurrence));
  const shouldCollapsePastEvents = pastEvents.length > 0 && upcomingEvents.length > 0;
  const agendaEvents =
    shouldCollapsePastEvents && !arePastEventsVisible ? upcomingEvents : filteredEvents;
  const agendaDays = useMemo(() => groupAgendaDays(agendaEvents), [agendaEvents]);

  return { agendaDays, isPast, nextOccurrence, pastEventsCount: pastEvents.length, shouldCollapsePastEvents };
}

/**
 * Address bar and swipe navigation of the visible month. The route lists a
 * deep-linked occurrence in the month where it is shown now, which can
 * differ from the link's `month` when the date was moved after the link was
 * shared. Writing the rendered month back keeps the address bar (and any
 * link copied from it) pointing at that month. Phones flip months with a
 * horizontal swipe over the grid or the agenda, loading the same months as
 * the header chevrons.
 */
function useMonthLocation({
  currentMonth,
  initialOccurrenceKey,
  navigateToMonth,
  visibleMonth,
}: {
  currentMonth: string;
  initialOccurrenceKey: string | null;
  navigateToMonth: (month: string) => void;
  visibleMonth: TribeEventMonthResult;
}) {
  useEffect(() => {
    if (initialOccurrenceKey !== null) {
      replaceCurrentUrlSearchParams({ [TRIBE_EVENTS_ROUTE_QUERY.month]: currentMonth });
    }
  }, [currentMonth, initialOccurrenceKey]);

  return useHorizontalSwipe((direction) => {
    navigateToMonth(
      direction === HORIZONTAL_SWIPE_DIRECTION.next ? visibleMonth.next : visibleMonth.previous
    );
  });
}

/** Copies the shareable link of an occurrence and reports the outcome. */
async function copyOccurrenceLink(tribeSlug: string, occurrence: TribeEventOccurrenceResult) {
  const occurrenceUrl =
    window.location.origin +
    buildTribeEventsRoute(tribeSlug, {
      month: getBuenosAiresMonthKey(occurrence.startsAt),
      occurrenceKey: occurrence.occurrenceKey,
    });

  if (await copyTextToClipboard(occurrenceUrl)) {
    toast.success(COPY.linkCopied);
  } else {
    toast.error(COPY.linkCopyFailure);
  }
}

type CalendarViewModeState = ReturnType<typeof useCalendarViewMode>;
type CalendarFiltersState = ReturnType<typeof useCalendarFilters>;
type CalendarDayState = ReturnType<typeof useCalendarDayState>;
type CalendarAgendaState = ReturnType<typeof useCalendarAgenda>;
type EventFormSessionsState = ReturnType<typeof useEventFormSessions>;

type TribeEventsCalendarTopProps = {
  dayState: CalendarDayState;
  dialogs: CalendarDialogsState;
  filters: CalendarFiltersState;
  forms: EventFormSessionsState;
  navigateToMonth: (month: string) => void;
  nowTime: number | null;
  tribeSlug: string;
  viewerPermissions: TribeEventViewerPermissionsResult;
  viewModeState: CalendarViewModeState;
  visibleMonth: TribeEventMonthResult;
};

/**
 * Header of the page with real month links, so a new tab or a page without
 * JavaScript still opens the month; the header handles plain clicks in place.
 */
function TribeEventsCalendarTop({
  dayState,
  dialogs,
  filters,
  forms,
  navigateToMonth,
  nowTime,
  tribeSlug,
  viewerPermissions,
  viewModeState,
  visibleMonth,
}: TribeEventsCalendarTopProps) {
  const { selectedEventTypes, setSelectedEventTypes } = filters;
  // Before hydration there is no clock, so "Hoy" leaves the month to the
  // route (which defaults to the current Buenos Aires month) instead of
  // computing one on the server that could differ from the client's.
  const todayMonth = nowTime === null ? null : getBuenosAiresMonthKey(new Date(nowTime));
  const todayHref = buildTribeEventsRoute(
    tribeSlug,
    todayMonth === null
      ? { eventTypes: selectedEventTypes }
      : { eventTypes: selectedEventTypes, month: todayMonth }
  );

  return (
    <TribeEventsCalendarHeader
      canManageEvents={viewerPermissions.canManageEvents}
      canProposeEvents={viewerPermissions.canProposeEvents}
      month={visibleMonth.current}
      monthTransitionDirection={dayState.monthTransitionDirection}
      nextMonth={visibleMonth.next}
      nextMonthHref={buildTribeEventsRoute(tribeSlug, {
        eventTypes: selectedEventTypes,
        month: visibleMonth.next,
      })}
      pendingProposalCount={dialogs.proposals.pendingCount}
      previousMonth={visibleMonth.previous}
      previousMonthHref={buildTribeEventsRoute(tribeSlug, {
        eventTypes: selectedEventTypes,
        month: visibleMonth.previous,
      })}
      timeLabel={
        nowTime === null ? null : formatBuenosAiresTime(new Date(nowTime)) + TIME_LABEL_SUFFIX
      }
      todayHref={todayHref}
      todayMonth={todayMonth}
      typeFilter={
        <TribeEventsTypeFilter
          selectedTypes={selectedEventTypes}
          onClear={() => setSelectedEventTypes(NO_EVENT_TYPES)}
          onToggleType={(eventType) =>
            setSelectedEventTypes(toggleEventTypeSelection(selectedEventTypes, eventType))
          }
        />
      }
      viewMode={viewModeState.viewMode}
      shouldAnimateViewMode={viewModeState.chosenViewMode !== null}
      onChooseViewMode={(nextViewMode) =>
        viewModeState.chooseViewMode(nextViewMode, visibleMonth.current)
      }
      onCreateEvent={() => forms.openCreateForm()}
      onNavigateMonth={navigateToMonth}
      onOpenProposals={dialogs.openProposalsPanel}
      onProposeEvent={dialogs.openProposalForm}
      onSubscribeCalendar={dialogs.openCalendarFeed}
    />
  );
}

type CalendarEmptyStateProps = {
  hasEvents: boolean;
  onOpenTemplate: (template: TribeEventTemplate) => void;
  onProposeEvent: () => void;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

/** Empty month: templates for managers, a proposal shortcut for members, or a filter notice. */
function CalendarEmptyState({
  hasEvents,
  onOpenTemplate,
  onProposeEvent,
  viewerPermissions,
}: CalendarEmptyStateProps) {
  if (hasEvents) {
    return (
      <p className={styles.TribeEventsCalendar__filteredEmpty} role={ROLE_STATUS}>
        {COPY.filteredEmpty}
      </p>
    );
  }

  return viewerPermissions.canManageEvents ? (
    <TribeEventsEmptyState templates={TRIBE_EVENT_TEMPLATES} onUseTemplate={onOpenTemplate} />
  ) : (
    <TribeEventsEmptyState
      onProposeEvent={viewerPermissions.canProposeEvents ? onProposeEvent : undefined}
    />
  );
}

type CalendarViewProps = {
  agenda: CalendarAgendaState;
  dayState: CalendarDayState;
  emptyState: ReactNode;
  filteredEvents: TribeEventOccurrenceResult[];
  nowTime: number | null;
  onSelectOccurrence: (occurrence: TribeEventOccurrenceResult) => void;
  renderAgendaItem: (occurrence: TribeEventOccurrenceResult) => ReactNode;
  viewMode: TribeEventsViewMode;
};

/** Month grid or agenda list of the visible month. */
function CalendarView({
  agenda,
  dayState,
  emptyState,
  filteredEvents,
  nowTime,
  onSelectOccurrence,
  renderAgendaItem,
  viewMode,
}: CalendarViewProps) {
  if (viewMode === TRIBE_EVENTS_VIEW_MODE.calendar) {
    return (
      <>
        <TribeEventsMonthGrid
          activeDayKey={dayState.activeDayKey}
          calendarDays={dayState.calendarDays}
          nowTime={nowTime}
          occurrencesByDay={dayState.occurrencesByDay}
          renderOccurrence={renderAgendaItem}
          todayKey={dayState.todayKey}
          onSelectDay={dayState.selectDay}
          onSelectOccurrence={onSelectOccurrence}
        />
        {filteredEvents.length === 0 ? emptyState : null}
      </>
    );
  }

  return filteredEvents.length === 0 ? (
    emptyState
  ) : (
    <TribeEventsAgenda
      agendaDays={agenda.agendaDays}
      arePastEventsVisible={dayState.arePastEventsVisible}
      pastEventsCount={agenda.pastEventsCount}
      renderOccurrence={renderAgendaItem}
      shouldCollapsePastEvents={agenda.shouldCollapsePastEvents}
      todayKey={dayState.todayKey}
      onTogglePastEvents={() => dayState.setArePastEventsVisible((currentValue) => !currentValue)}
    />
  );
}

type CalendarMonthViewsProps = Omit<CalendarViewProps, "viewMode"> & {
  currentMonth: string;
  isLoadingMonth: boolean;
  monthSwipeHandlers: ReturnType<typeof useHorizontalSwipe>;
  viewModeState: CalendarViewModeState;
};

/** Swipeable area with the views of the visible month, dimmed while the next one loads. */
function CalendarMonthViews({
  currentMonth,
  isLoadingMonth,
  monthSwipeHandlers,
  viewModeState,
  ...viewProps
}: CalendarMonthViewsProps) {
  const { enteredView, renderedViewModes, shouldRenderBothViews } = viewModeState;

  return (
    <>
      {isLoadingMonth ? (
        <p className={styles.TribeEventsCalendar__monthStatus} role={ROLE_STATUS}>
          {COPY.monthLoading}
        </p>
      ) : null}
      {/* The previous month stays on screen, dimmed, until the next one arrives. */}
      <div
        aria-busy={isLoadingMonth}
        className={cn(
          styles.TribeEventsCalendar__swipeArea,
          isLoadingMonth && styles["TribeEventsCalendar__swipeArea--loading"]
        )}
        {...monthSwipeHandlers}
      >
        {/* Keyed by month so a new month replays its directional entrance. */}
        <div
          className={styles.TribeEventsCalendar__monthView}
          data-month-transition={viewProps.dayState.monthTransitionDirection}
          key={currentMonth}
        >
          {/* Keyed views in one list: hydration drops the hidden view but keeps
              the visible one mounted, so it is not rebuilt or re-animated. */}
          {renderedViewModes.map((renderedViewMode) => (
            <div
              className={
                shouldRenderBothViews
                  ? cn(styles.TribeEventsCalendar__autoView, AUTO_VIEW_CLASS_NAME[renderedViewMode])
                  : cn(
                      styles.TribeEventsCalendar__view,
                      enteredView?.viewMode === renderedViewMode &&
                        enteredView.month === currentMonth &&
                        styles["TribeEventsCalendar__view--entering"]
                    )
              }
              key={renderedViewMode}
            >
              <CalendarView {...viewProps} viewMode={renderedViewMode} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

type CalendarDetailProps = {
  attendanceReport: ReturnType<typeof useTribeEventAttendanceReport>;
  filters: CalendarFiltersState;
  forms: EventFormSessionsState;
  isPast: (occurrence: TribeEventOccurrenceResult) => boolean;
  mutations: TribeEventMutations;
  onCloseDetail: () => void;
  saveAttendance: (occurrence: TribeEventOccurrenceResult, status: TribeEventAttendanceOption | null) => void;
  selectedOccurrence: TribeEventOccurrenceResult | null;
  setAttendeesOpen: (isOpen: boolean) => void;
  tribeSlug: string;
  viewerPermissions: TribeEventViewerPermissionsResult;
  viewerTimeZone: string | null;
};

/** Detail dialog of the selected occurrence, with its activity and "Asistentes" panels. */
function CalendarDetail({
  attendanceReport,
  filters,
  forms,
  isPast,
  mutations,
  onCloseDetail,
  saveAttendance,
  selectedOccurrence,
  setAttendeesOpen,
  tribeSlug,
  viewerPermissions,
  viewerTimeZone,
}: CalendarDetailProps) {
  const canManageEvents = viewerPermissions.canManageEvents;

  return (
    <TribeEventDetailDialog
      activityPanel={
        selectedOccurrence ? (
          <TribeEventOccurrenceActivity
            isFinished={isPast(selectedOccurrence)}
            key={selectedOccurrence.occurrenceKey}
            occurrence={selectedOccurrence}
            tribeSlug={tribeSlug}
            onRecordingAvailabilityChange={filters.setOccurrenceRecordingAvailability}
          />
        ) : null
      }
      attendeesPanel={
        canManageEvents && selectedOccurrence ? (
          <TribeEventAttendeesPanel
            exportUrl={buildTribeEventAttendanceExportUrl({
              eventId: selectedOccurrence.eventId,
              occurrenceStartsAt: selectedOccurrence.originalStartsAt,
              tribeSlug,
            })}
            reportState={attendanceReport.reportState}
            onRetry={attendanceReport.reload}
          />
        ) : null
      }
      canManageEvents={canManageEvents}
      isPast={selectedOccurrence ? isPast(selectedOccurrence) : false}
      isSavingAttendance={mutations.isSavingAttendance}
      isSavingException={mutations.isSavingException}
      occurrence={selectedOccurrence}
      tribeSlug={tribeSlug}
      viewerTimeZone={viewerTimeZone}
      onCancelOccurrence={(occurrence) =>
        forms.openExceptionDialog(TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled, occurrence)
      }
      onClose={onCloseDetail}
      onMoveOccurrence={(occurrence) =>
        forms.openExceptionDialog(TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved, occurrence)
      }
      onRestoreOccurrence={(occurrence) => {
        void mutations.clearOccurrenceException(occurrence);
      }}
      onCopyLink={(occurrence) => {
        void copyOccurrenceLink(tribeSlug, occurrence);
      }}
      onDelete={(occurrence) => {
        onCloseDetail();
        forms.setPendingDeleteOccurrence(occurrence);
      }}
      onEdit={forms.openEditForm}
      onSetAttendance={saveAttendance}
      onToggleAttendees={setAttendeesOpen}
    />
  );
}

type CalendarFormDialogsProps = {
  dialogs: CalendarDialogsState;
  forms: EventFormSessionsState;
  mutations: TribeEventMutations;
};

/** Event form (create, edit or approve) and the single-date exception dialog. */
function CalendarFormDialogs({ dialogs, forms, mutations }: CalendarFormDialogsProps) {
  const { formSession } = forms;
  const { exceptionDialog } = dialogs;

  const submitOccurrenceException = async (
    submission: TribeEventOccurrenceExceptionSubmission
  ) => {
    if (!exceptionDialog) {
      return;
    }

    if (await mutations.saveOccurrenceException(exceptionDialog.occurrence, submission)) {
      dialogs.setExceptionDialog(null);
    }
  };

  return (
    <>
      <TribeEventFormDialog
        editingOccurrence={formSession.mode === FORM_MODE.edit ? formSession.occurrence : null}
        initialValues={
          formSession.mode === FORM_MODE.create || formSession.mode === FORM_MODE.approve
            ? formSession.initialValues
            : undefined
        }
        isOpen={formSession.mode !== FORM_MODE.closed}
        isSaving={
          formSession.mode === FORM_MODE.approve ? dialogs.proposals.isSubmitting : mutations.isSavingEvent
        }
        purpose={
          formSession.mode === FORM_MODE.approve
            ? TRIBE_EVENT_FORM_PURPOSE.approve
            : TRIBE_EVENT_FORM_PURPOSE.save
        }
        key={formSession.mode === FORM_MODE.closed ? FORM_MODE.closed : formSession.session}
        onClose={forms.closeForm}
        onSubmit={(payload) => {
          void forms.submitEventForm(payload);
        }}
      />

      {exceptionDialog ? (
        <TribeEventOccurrenceExceptionDialog
          isSaving={mutations.isSavingException}
          key={exceptionDialog.session}
          mode={exceptionDialog.mode}
          occurrence={exceptionDialog.occurrence}
          onClose={() => dialogs.setExceptionDialog(null)}
          onSubmit={(submission) => {
            void submitOccurrenceException(submission);
          }}
        />
      ) : null}
    </>
  );
}

type CalendarProposalDialogsProps = {
  dialogs: CalendarDialogsState;
  forms: EventFormSessionsState;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

/** Proposal form for members and the proposals panel. */
function CalendarProposalDialogs({ dialogs, forms, viewerPermissions }: CalendarProposalDialogsProps) {
  const { canManageEvents, canProposeEvents } = viewerPermissions;
  const { proposals } = dialogs;

  return (
    <>
      {canProposeEvents ? (
        <TribeEventProposalFormDialog
          isOpen={dialogs.isProposalFormOpen}
          isSubmitting={proposals.isSubmitting}
          key={dialogs.proposalFormSession}
          onClose={() => dialogs.setIsProposalFormOpen(false)}
          onSubmit={(submission) => {
            void dialogs.submitProposal(submission);
          }}
        />
      ) : null}

      {canManageEvents || canProposeEvents ? (
        <TribeEventProposalsPanel
          canManageEvents={canManageEvents}
          isOpen={dialogs.isProposalsPanelOpen}
          isSubmitting={proposals.isSubmitting}
          loadState={proposals.loadState}
          onClose={() => dialogs.setIsProposalsPanelOpen(false)}
          onReject={proposals.rejectProposal}
          onRetry={proposals.loadProposals}
          onReview={forms.openApprovalForm}
          onWithdraw={(proposal) => {
            void proposals.withdrawProposal(proposal);
          }}
        />
      ) : null}
    </>
  );
}

type CalendarFeedAndDeleteDialogsProps = {
  dialogs: CalendarDialogsState;
  forms: EventFormSessionsState;
  isDeletingEvent: boolean;
};

/** Calendar subscription dialog and the delete confirmation. */
function CalendarFeedAndDeleteDialogs({ dialogs, forms, isDeletingEvent }: CalendarFeedAndDeleteDialogsProps) {
  const { calendarFeed } = dialogs;

  return (
    <>
      <TribeEventCalendarFeedDialog
        feedUrl={calendarFeed.feedUrl}
        isOpen={dialogs.isCalendarFeedOpen}
        isSubmitting={calendarFeed.isSubmitting}
        loadState={calendarFeed.loadState}
        onClose={dialogs.closeCalendarFeed}
        onCopyLink={() => {
          void calendarFeed.copyFeedUrl();
        }}
        onGenerate={() => {
          void calendarFeed.generateLink();
        }}
        onRetry={calendarFeed.loadSubscription}
        onRevoke={() => {
          void calendarFeed.revokeLink();
        }}
      />

      <TribeEventDeleteDialog
        isDeleting={isDeletingEvent}
        occurrence={forms.pendingDeleteOccurrence}
        onCancel={() => forms.setPendingDeleteOccurrence(null)}
        onConfirm={() => {
          void forms.confirmDeleteEvent();
        }}
      />
    </>
  );
}

type TribeEventsCalendarCoreInput = TribeEventsCalendarProps & {
  attendanceStreakComputedAt: string | null;
  initialEventTypes: readonly TribeEventType[];
  initialOccurrenceKey: string | null;
  pendingProposalCount: number;
  recordedOccurrenceKeys: readonly string[];
  serverAttendanceStreak: TribeEventAttendanceStreakResult | null;
  serverAttendanceStreakNextRefreshAt: string | null;
};

/** View mode, selection, month data, clock, dialogs and filters of the page. */
function useCalendarCore(input: TribeEventsCalendarCoreInput) {
  const { attendanceStreakComputedAt, initialOccurrenceKey, tribeSlug } = input;
  const viewModeState = useCalendarViewMode();
  const viewerTimeZone = useViewerTimeZone();
  const selection = useOccurrenceSelection(initialOccurrenceKey);
  const { monthNavigation, mutations } = useCalendarMonthData({
    ...input,
    setAttendeesOccurrenceKey: selection.setAttendeesOccurrenceKey,
    setOccurrenceSelection: selection.setOccurrenceSelection,
  });
  const visibleMonth = monthNavigation.listing.month;
  const nowTime = useCalendarClock({ attendanceStreakComputedAt, mutations });
  const dialogs = useCalendarDialogs({
    attendanceStreakComputedAt,
    currentMonth: visibleMonth.current,
    mutations,
    pendingProposalCount: input.pendingProposalCount,
    tribeSlug,
  });
  const filters = useCalendarFilters({
    initialEventTypes: input.initialEventTypes,
    listedRecordedKeys: monthNavigation.listing.recordedOccurrenceKeys,
    visibleEvents: mutations.visibleEvents,
  });

  return {
    dialogs,
    filters,
    monthNavigation,
    mutations,
    nowTime,
    selection,
    viewerTimeZone,
    viewModeState,
    visibleMonth,
  };
}

type CalendarCore = ReturnType<typeof useCalendarCore>;

/**
 * Detail selection actions. The open detail is mirrored in the `event` query
 * so the URL can be shared; replaceState keeps it out of the history stack
 * and never refetches. The rendered month is written too: a monthless deep
 * link (`?event=` only) renders the occurrence's month, so dropping `event`
 * alone would leave a bare URL that reopens on the current month instead of
 * the one on screen. Changing or closing the detail also forgets the
 * "Asistentes" tab: closing unmounts the tabs without reporting a tab
 * change, and the dialog always reopens on "Detalle", so the report must
 * stay user-triggered.
 */
function createDetailActions(core: CalendarCore, initialOccurrenceKey: string | null) {
  const setSelectedOccurrenceKey = (occurrenceKey: string | null) => {
    core.selection.setAttendeesOccurrenceKey(null);
    core.selection.setOccurrenceSelection({
      occurrenceKey,
      sourceOccurrenceKey: initialOccurrenceKey,
    });
    replaceCurrentUrlSearchParams({
      [TRIBE_EVENTS_ROUTE_QUERY.event]: occurrenceKey,
      [TRIBE_EVENTS_ROUTE_QUERY.month]: core.visibleMonth.current,
    });
  };

  return {
    closeDetail: () => setSelectedOccurrenceKey(null),
    saveAttendance: (
      occurrence: TribeEventOccurrenceResult,
      status: TribeEventAttendanceOption | null
    ) => {
      void core.mutations.setAttendance(occurrence, status);
    },
    selectOccurrence: (occurrence: TribeEventOccurrenceResult) =>
      setSelectedOccurrenceKey(occurrence.occurrenceKey),
    setAttendeesOpen: (isOpen: boolean) =>
      core.selection.setAttendeesOccurrenceKey(isOpen ? core.selection.selectedOccurrenceKey : null),
  };
}

/** Client state of the events page, composed from the hooks above in a fixed order. */
function useTribeEventsCalendar(input: TribeEventsCalendarCoreInput) {
  const core = useCalendarCore(input);
  const { dialogs, filters, mutations, nowTime, selection, visibleMonth } = core;
  const actions = createDetailActions(core, input.initialOccurrenceKey);
  const forms = useEventFormSessions({ dialogs, mutations, onCloseDetail: actions.closeDetail });
  const dayState = useCalendarDayState({
    currentMonth: visibleMonth.current,
    filteredEvents: filters.filteredEvents,
    nowTime,
    tribeSlug: input.tribeSlug,
  });
  const selectedOccurrence =
    mutations.visibleEvents.find(
      (occurrence) => occurrence.occurrenceKey === selection.selectedOccurrenceKey
    ) ?? null;
  const attendanceReport = useTribeEventAttendanceReport({
    isEnabled:
      input.viewerPermissions.canManageEvents &&
      selectedOccurrence !== null &&
      selection.attendeesOccurrenceKey === selectedOccurrence.occurrenceKey,
    occurrence: selectedOccurrence,
    tribeSlug: input.tribeSlug,
  });
  const agenda = useCalendarAgenda({
    arePastEventsVisible: dayState.arePastEventsVisible,
    filteredEvents: filters.filteredEvents,
    nowTime,
  });
  const monthSwipeHandlers = useMonthLocation({
    currentMonth: visibleMonth.current,
    initialOccurrenceKey: input.initialOccurrenceKey,
    navigateToMonth: core.monthNavigation.navigateToMonth,
    visibleMonth,
  });

  return {
    ...core,
    actions,
    agenda,
    attendanceReport,
    dayState,
    forms,
    monthSwipeHandlers,
    selectedOccurrence,
  };
}

type TribeEventsCalendarState = ReturnType<typeof useTribeEventsCalendar>;

type TribeEventsCalendarLayoutProps = Pick<TribeEventsCalendarProps, "tribeSlug" | "viewerPermissions"> & {
  calendar: TribeEventsCalendarState;
};

/** Page layout: header, next event, month views and every dialog. */
function TribeEventsCalendarLayout({ calendar, tribeSlug, viewerPermissions }: TribeEventsCalendarLayoutProps) {
  const { actions, agenda, dialogs, filters, forms, mutations, nowTime, viewerTimeZone } = calendar;

  return (
    <main className={styles.TribeEventsCalendar}>
      <TribeEventsCalendarTop
        dayState={calendar.dayState}
        dialogs={dialogs}
        filters={filters}
        forms={forms}
        navigateToMonth={calendar.monthNavigation.navigateToMonth}
        nowTime={nowTime}
        tribeSlug={tribeSlug}
        viewerPermissions={viewerPermissions}
        viewModeState={calendar.viewModeState}
        visibleMonth={calendar.visibleMonth}
      />
      <CalendarNextEvent calendar={calendar} />
      <CalendarMonthViews
        agenda={agenda}
        currentMonth={calendar.visibleMonth.current}
        dayState={calendar.dayState}
        emptyState={
          <CalendarEmptyState
            hasEvents={mutations.visibleEvents.length > 0}
            viewerPermissions={viewerPermissions}
            onOpenTemplate={(template) => forms.openCreateForm(buildTemplateInitialValues(template))}
            onProposeEvent={dialogs.openProposalForm}
          />
        }
        filteredEvents={filters.filteredEvents}
        isLoadingMonth={calendar.monthNavigation.loadingMonth !== null}
        monthSwipeHandlers={calendar.monthSwipeHandlers}
        nowTime={nowTime}
        renderAgendaItem={(occurrence) => (
          <TribeEventAgendaItem
            hasRecording={filters.recordedKeys.has(occurrence.occurrenceKey)}
            key={occurrence.occurrenceKey}
            nowTime={nowTime}
            occurrence={occurrence}
            viewerTimeZone={viewerTimeZone}
            onSelect={actions.selectOccurrence}
          />
        )}
        viewModeState={calendar.viewModeState}
        onSelectOccurrence={actions.selectOccurrence}
      />
      <CalendarDetail
        attendanceReport={calendar.attendanceReport}
        filters={filters}
        forms={forms}
        isPast={agenda.isPast}
        mutations={mutations}
        saveAttendance={actions.saveAttendance}
        selectedOccurrence={calendar.selectedOccurrence}
        setAttendeesOpen={actions.setAttendeesOpen}
        tribeSlug={tribeSlug}
        viewerPermissions={viewerPermissions}
        viewerTimeZone={viewerTimeZone}
        onCloseDetail={actions.closeDetail}
      />
      <CalendarFormDialogs dialogs={dialogs} forms={forms} mutations={mutations} />
      <CalendarProposalDialogs dialogs={dialogs} forms={forms} viewerPermissions={viewerPermissions} />
      <CalendarFeedAndDeleteDialogs
        dialogs={dialogs}
        forms={forms}
        isDeletingEvent={mutations.isDeletingEvent}
      />
    </main>
  );
}

/**
 * Highlight of the next occurrence. The block only exists once the clock is
 * known (after hydration), so it grows into place instead of pushing the
 * month down in a single jump.
 */
function CalendarNextEvent({ calendar }: { calendar: TribeEventsCalendarState }) {
  const { actions, mutations, nowTime } = calendar;
  const { nextOccurrence } = calendar.agenda;

  return (
    <AnimatedCollapse isOpen={nextOccurrence !== null && nowTime !== null}>
      {nextOccurrence && nowTime !== null ? (
        <TribeNextEvent
          attendanceStreak={mutations.attendanceStreak}
          isSavingAttendance={mutations.isSavingAttendance}
          nowTime={nowTime}
          occurrence={nextOccurrence}
          viewerTimeZone={calendar.viewerTimeZone}
          onSeeDetail={actions.selectOccurrence}
          onSetAttendance={actions.saveAttendance}
        />
      ) : null}
    </AnimatedCollapse>
  );
}

/** Event form values prefilled from a template. */
function buildTemplateInitialValues(template: TribeEventTemplate): TribeEventFormInitialValues {
  return {
    durationMinutes: template.durationMinutes,
    eventType: template.eventType,
    recurrenceFrequency: template.recurrenceFrequency,
    title: template.title,
  };
}

/**
 * Client container of the tribe events page. It owns view state (mode,
 * selected day and occurrence, dialogs) and delegates data mutations to
 * `useTribeEventMutations`; every visual block is a presentational component.
 */
export function TribeEventsCalendar({
  attendanceStreak: serverAttendanceStreak = null,
  attendanceStreakComputedAt = null,
  attendanceStreakNextRefreshAt: serverAttendanceStreakNextRefreshAt = null,
  initialEventTypes = NO_EVENT_TYPES,
  initialOccurrenceKey = null,
  pendingProposalCount = 0,
  recordedOccurrenceKeys = NO_RECORDED_OCCURRENCES,
  ...props
}: TribeEventsCalendarProps) {
  const calendar = useTribeEventsCalendar({
    ...props,
    attendanceStreakComputedAt,
    initialEventTypes,
    initialOccurrenceKey,
    pendingProposalCount,
    recordedOccurrenceKeys,
    serverAttendanceStreak,
    serverAttendanceStreakNextRefreshAt,
  });

  return (
    <TribeEventsCalendarLayout
      calendar={calendar}
      tribeSlug={props.tribeSlug}
      viewerPermissions={props.viewerPermissions}
    />
  );
}
