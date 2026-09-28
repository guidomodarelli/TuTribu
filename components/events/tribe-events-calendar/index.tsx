"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn, toast, AnimatedCollapse, copyTextToClipboard } from "beez-ui";
import { useIsMobile, useHorizontalSwipe, useIsHydrated, useViewerTimeZone, HORIZONTAL_SWIPE_DIRECTION } from "beez-ui/hooks";

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

/**
 * Client container of the tribe events page. It owns view state (mode,
 * selected day and occurrence, dialogs) and delegates data mutations to
 * `useTribeEventMutations`; every visual block is a presentational component.
 */
export function TribeEventsCalendar({
  attendanceStreak: serverAttendanceStreak = null,
  attendanceStreakComputedAt = null,
  attendanceStreakNextRefreshAt: serverAttendanceStreakNextRefreshAt = null,
  events,
  initialEventTypes = NO_EVENT_TYPES,
  initialOccurrenceKey = null,
  month,
  pendingProposalCount = 0,
  recordedOccurrenceKeys = NO_RECORDED_OCCURRENCES,
  tribeSlug,
  viewerPermissions,
}: TribeEventsCalendarProps) {
  // The month grid needs horizontal room, so phones default to the agenda
  // list until the viewer picks a mode explicitly.
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
  const viewerTimeZone = useViewerTimeZone();
  // A new deep link from the route (another `event` query) replaces the
  // local selection, the same way new server events replace local mutations.
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
  // The server renders the first month; later months are loaded in place
  // from the events endpoint, so only the month listing below changes.
  const serverMonthListing = useMemo(
    () => ({ events, month, recordedOccurrenceKeys }),
    [events, month, recordedOccurrenceKeys]
  );
  const {
    listing: monthListing,
    loadingMonth,
    navigateToMonth,
  } = useTribeEventsMonthNavigation({
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
  const visibleMonth = monthListing.month;
  const {
    applyEventOccurrences,
    beginSeriesMutation,
    clearOccurrenceException,
    attendanceStreak,
    attendanceStreakNextRefreshAt,
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
  } = useTribeEventMutations({
    attendanceStreak: serverAttendanceStreak,
    attendanceStreakNextRefreshAt: serverAttendanceStreakNextRefreshAt,
    // Every server render stamps a new instant, so it replaces local streak
    // state; a month loaded on the client keeps it (the streak spans months).
    attendanceStreakSourceVersion: attendanceStreakComputedAt,
    events: monthListing.events,
    month: visibleMonth.current,
    // The server checks the exact time: when it already considers the
    // occurrence ended, move the clock to that end so the UI shows it
    // finished without reloading the route, even if the local clock lags.
    onOccurrenceEnded: (occurrence) =>
      advanceMinuteClockTo(getTribeEventOccurrenceEndTime(occurrence)),
    tribeSlug,
  });
  // Besides the minute ticks, the clock wakes up exactly when an occurrence on
  // screen opens its join window, starts, or ends, so "Unirme", "En vivo",
  // and the attendance answers change in the same second the server does.
  // The server also hands the next instant at which the streak can change,
  // which covers occurrences outside the visible month (one that started last
  // month and is still running is not listed here, since the month matches
  // occurrences by start). The clock wakes up then too.
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
  const proposals = useTribeEventProposals({
    beginSeriesMutation,
    initialPendingCount: pendingProposalCount,
    month: visibleMonth.current,
    onEventCreated: applyEventOccurrences,
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
  // A new type filter from the route (month navigation keeps it in the
  // links) replaces the local selection, like the deep-linked occurrence.
  const [eventTypeSelection, setEventTypeSelection] = useState<EventTypeSelectionState>({
    selectedTypes: initialEventTypes,
    sourceTypes: initialEventTypes,
  });
  const selectedEventTypes =
    eventTypeSelection.sourceTypes === initialEventTypes
      ? eventTypeSelection.selectedTypes
      : initialEventTypes;
  const listedRecordedKeys = monthListing.recordedOccurrenceKeys;
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
  const [formSession, setFormSession] = useState<EventFormSession>({
    mode: FORM_MODE.closed,
  });
  const [pendingDeleteOccurrence, setPendingDeleteOccurrence] =
    useState<TribeEventOccurrenceResult | null>(null);
  const formSessionCounterRef = useRef(0);
  const [arePastEventsVisible, setArePastEventsVisible] = useState(false);
  const [daySelection, setDaySelection] = useState<DaySelectionState>({
    dayKey: null,
    month: visibleMonth.current,
  });

  const currentMonth = visibleMonth.current;
  const monthTransitionDirection = useMonthTransitionDirection(tribeSlug, currentMonth);
  // A day tapped in another month is not on this grid, so it falls back to today.
  const selectedDayKey = daySelection.month === currentMonth ? daySelection.dayKey : null;
  const selectDay = (dayKey: string) => {
    setDaySelection({ dayKey, month: currentMonth });
  };
  const calendarDays = useMemo(() => createCalendarDays(currentMonth), [currentMonth]);
  const occurrencesByDay = useMemo(() => groupOccurrencesByDay(filteredEvents), [filteredEvents]);
  const canManageEvents = viewerPermissions.canManageEvents;
  const canProposeEvents = viewerPermissions.canProposeEvents;
  const selectedOccurrence =
    visibleEvents.find((occurrence) => occurrence.occurrenceKey === selectedOccurrenceKey) ??
    null;
  const { reload: reloadAttendanceReport, reportState: attendanceReportState } =
    useTribeEventAttendanceReport({
      isEnabled:
        canManageEvents &&
        selectedOccurrence !== null &&
        attendeesOccurrenceKey === selectedOccurrence.occurrenceKey,
      occurrence: selectedOccurrence,
      tribeSlug,
    });
  const todayKey = nowTime === null ? null : getBuenosAiresDateKey(new Date(nowTime));
  const timeLabel =
    nowTime === null ? null : formatBuenosAiresTime(new Date(nowTime)) + TIME_LABEL_SUFFIX;
  // The phone grid shows dots per day and lists the tapped day under the
  // grid; until the viewer taps one, today's agenda is shown when it belongs
  // to the visible month.
  const isTodayInMonth = calendarDays.some(
    (day) => day.isCurrentMonth && day.dateKey === todayKey
  );
  const activeDayKey = selectedDayKey ?? (isTodayInMonth ? todayKey : null);
  const isPast = (occurrence: TribeEventOccurrenceResult): boolean =>
    nowTime !== null && isOccurrencePast(occurrence, nowTime);
  // A cancelled date is never "the next event": nobody will meet then.
  const nextOccurrence =
    nowTime === null
      ? null
      : (filteredEvents.find(
          (occurrence) => !isPast(occurrence) && !isOccurrenceCancelled(occurrence)
        ) ?? null);
  const pastEvents = filteredEvents.filter(isPast);
  const upcomingEvents = filteredEvents.filter((occurrence) => !isPast(occurrence));
  // Past occurrences collapse only while the month still has something ahead;
  // browsing an old month shows everything, since all of it is history.
  const shouldCollapsePastEvents = pastEvents.length > 0 && upcomingEvents.length > 0;
  const agendaEvents =
    shouldCollapsePastEvents && !arePastEventsVisible ? upcomingEvents : filteredEvents;
  const agendaDays = useMemo(() => groupAgendaDays(agendaEvents), [agendaEvents]);
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

  // The open detail is mirrored in the `event` query so the URL can be shared;
  // replaceState keeps it out of the history stack and never refetches. The
  // rendered month is written too: a monthless deep link (`?event=` only)
  // renders the occurrence's month, so dropping `event` alone would leave a
  // bare URL that reopens on the current month instead of the one on screen.
  // Changing or closing the detail also forgets the "Asistentes" tab: closing
  // unmounts the tabs without reporting a tab change, and the dialog always
  // reopens on "Detalle", so the report must stay user-triggered.
  const setSelectedOccurrenceKey = (occurrenceKey: string | null) => {
    setAttendeesOccurrenceKey(null);
    setOccurrenceSelection({
      occurrenceKey,
      sourceOccurrenceKey: initialOccurrenceKey,
    });
    replaceCurrentUrlSearchParams({
      [TRIBE_EVENTS_ROUTE_QUERY.event]: occurrenceKey,
      [TRIBE_EVENTS_ROUTE_QUERY.month]: currentMonth,
    });
  };

  // The route lists a deep-linked occurrence in the month where it is shown
  // now, which can differ from the link's `month` when the date was moved
  // after the link was shared. Writing the rendered month back keeps the
  // address bar (and any link copied from it) pointing at that month.
  useEffect(() => {
    if (initialOccurrenceKey !== null) {
      replaceCurrentUrlSearchParams({ [TRIBE_EVENTS_ROUTE_QUERY.month]: currentMonth });
    }
  }, [currentMonth, initialOccurrenceKey]);

  // Real links, so a new tab or a page without JavaScript still opens the
  // month; the header handles plain clicks in place.
  const previousMonthHref = buildTribeEventsRoute(tribeSlug, {
    eventTypes: selectedEventTypes,
    month: visibleMonth.previous,
  });
  const nextMonthHref = buildTribeEventsRoute(tribeSlug, {
    eventTypes: selectedEventTypes,
    month: visibleMonth.next,
  });

  // The filter is client-side: toggling a chip never refetches; the URL
  // mirrors it (replaceState) so it can be shared and survives month links.
  const setSelectedEventTypes = (nextTypes: readonly TribeEventType[]) => {
    setEventTypeSelection({ selectedTypes: nextTypes, sourceTypes: initialEventTypes });
    replaceCurrentUrlSearchParamValues(TRIBE_EVENTS_ROUTE_QUERY.type, nextTypes);
  };
  // Phones flip months with a horizontal swipe over the grid or the agenda,
  // loading the same months as the header chevrons.
  const monthSwipeHandlers = useHorizontalSwipe((direction) => {
    navigateToMonth(
      direction === HORIZONTAL_SWIPE_DIRECTION.next ? visibleMonth.next : visibleMonth.previous
    );
  });

  const selectOccurrence = (occurrence: TribeEventOccurrenceResult) => {
    setSelectedOccurrenceKey(occurrence.occurrenceKey);
  };

  const copyOccurrenceLink = async (occurrence: TribeEventOccurrenceResult) => {
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
  };

  const openCreateForm = (initialValues?: TribeEventFormInitialValues) => {
    formSessionCounterRef.current += 1;
    setFormSession({
      initialValues,
      mode: FORM_MODE.create,
      session: formSessionCounterRef.current,
    });
  };

  const openTemplateForm = (template: TribeEventTemplate) => {
    openCreateForm({
      durationMinutes: template.durationMinutes,
      eventType: template.eventType,
      recurrenceFrequency: template.recurrenceFrequency,
      title: template.title,
    });
  };

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

  // "Revisar y aprobar" reuses the event form, prefilled with the proposal.
  const openApprovalForm = (proposal: TribeEventProposalResult) => {
    formSessionCounterRef.current += 1;
    setIsProposalsPanelOpen(false);
    setFormSession({
      initialValues: {
        description: proposal.description ?? undefined,
        durationMinutes: proposal.durationMinutes,
        eventType: proposal.eventType,
        startsAt: proposal.startsAt,
        title: proposal.title,
      },
      mode: FORM_MODE.approve,
      proposal,
      session: formSessionCounterRef.current,
    });
  };

  const openExceptionDialog = (
    mode: TribeEventOccurrenceExceptionMode,
    occurrence: TribeEventOccurrenceResult
  ) => {
    formSessionCounterRef.current += 1;
    setExceptionDialog({ mode, occurrence, session: formSessionCounterRef.current });
  };

  const submitOccurrenceException = async (
    submission: TribeEventOccurrenceExceptionSubmission
  ) => {
    if (!exceptionDialog) {
      return;
    }

    if (await saveOccurrenceException(exceptionDialog.occurrence, submission)) {
      setExceptionDialog(null);
    }
  };

  const renderEmptyState = () => {
    if (visibleEvents.length > 0) {
      return (
        <p className={styles.TribeEventsCalendar__filteredEmpty} role={ROLE_STATUS}>
          {COPY.filteredEmpty}
        </p>
      );
    }

    return canManageEvents ? (
      <TribeEventsEmptyState templates={TRIBE_EVENT_TEMPLATES} onUseTemplate={openTemplateForm} />
    ) : (
      <TribeEventsEmptyState onProposeEvent={canProposeEvents ? openProposalForm : undefined} />
    );
  };

  const openEditForm = (occurrence: TribeEventOccurrenceResult) => {
    formSessionCounterRef.current += 1;
    setSelectedOccurrenceKey(null);
    setFormSession({
      mode: FORM_MODE.edit,
      occurrence,
      session: formSessionCounterRef.current,
    });
  };

  const closeForm = () => {
    setFormSession({ mode: FORM_MODE.closed });
  };

  const submitEventForm = async (payload: TribeEventFormPayload) => {
    if (formSession.mode === FORM_MODE.closed) {
      return;
    }

    if (formSession.mode === FORM_MODE.approve) {
      if (await proposals.approveProposal(formSession.proposal, payload)) {
        closeForm();
      }

      return;
    }

    const isSaved = await saveEvent(
      payload,
      formSession.mode === FORM_MODE.edit ? formSession.occurrence : null
    );

    if (isSaved) {
      closeForm();
    }
  };

  const confirmDeleteEvent = async () => {
    if (!pendingDeleteOccurrence) {
      return;
    }

    const isDeleted = await deleteEvent(pendingDeleteOccurrence);

    if (isDeleted) {
      setSelectedOccurrenceKey(null);
      setPendingDeleteOccurrence(null);
    }
  };

  const saveAttendance = (
    occurrence: TribeEventOccurrenceResult,
    status: TribeEventAttendanceOption | null
  ) => {
    void setAttendance(occurrence, status);
  };

  // Every load or save in the detail dialog updates the agenda badge without a
  // reload. The functional update reads the latest keys (a load answer can
  // arrive after other renders) and keeps the state when nothing changed.
  const setOccurrenceRecordingAvailability = (occurrenceKey: string, hasRecording: boolean) => {
    setRecordedOccurrenceState((currentState) => {
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
    });
  };

  const renderAgendaItem = (occurrence: TribeEventOccurrenceResult) => (
    <TribeEventAgendaItem
      hasRecording={recordedKeys.has(occurrence.occurrenceKey)}
      key={occurrence.occurrenceKey}
      nowTime={nowTime}
      occurrence={occurrence}
      viewerTimeZone={viewerTimeZone}
      onSelect={selectOccurrence}
    />
  );

  const renderCalendarView = () => (
    <>
      <TribeEventsMonthGrid
        activeDayKey={activeDayKey}
        calendarDays={calendarDays}
        nowTime={nowTime}
        occurrencesByDay={occurrencesByDay}
        renderOccurrence={renderAgendaItem}
        todayKey={todayKey}
        onSelectDay={selectDay}
        onSelectOccurrence={selectOccurrence}
      />
      {filteredEvents.length === 0 ? renderEmptyState() : null}
    </>
  );

  const renderListView = () =>
    filteredEvents.length === 0 ? (
      renderEmptyState()
    ) : (
      <TribeEventsAgenda
        agendaDays={agendaDays}
        arePastEventsVisible={arePastEventsVisible}
        pastEventsCount={pastEvents.length}
        renderOccurrence={renderAgendaItem}
        shouldCollapsePastEvents={shouldCollapsePastEvents}
        todayKey={todayKey}
        onTogglePastEvents={() => setArePastEventsVisible((currentValue) => !currentValue)}
      />
    );

  const chooseViewMode = (nextViewMode: TribeEventsViewMode) => {
    if (nextViewMode !== viewMode) {
      setEnteredView({ month: currentMonth, viewMode: nextViewMode });
    }

    setChosenViewMode(nextViewMode);
  };

  const renderView = (renderedViewMode: TribeEventsViewMode) =>
    renderedViewMode === TRIBE_EVENTS_VIEW_MODE.calendar ? renderCalendarView() : renderListView();

  return (
    <main className={styles.TribeEventsCalendar}>
      <TribeEventsCalendarHeader
        canManageEvents={canManageEvents}
        canProposeEvents={canProposeEvents}
        month={currentMonth}
        monthTransitionDirection={monthTransitionDirection}
        nextMonth={visibleMonth.next}
        nextMonthHref={nextMonthHref}
        pendingProposalCount={proposals.pendingCount}
        previousMonth={visibleMonth.previous}
        previousMonthHref={previousMonthHref}
        timeLabel={timeLabel}
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
        viewMode={viewMode}
        shouldAnimateViewMode={chosenViewMode !== null}
        onChooseViewMode={chooseViewMode}
        onCreateEvent={() => openCreateForm()}
        onNavigateMonth={navigateToMonth}
        onOpenProposals={openProposalsPanel}
        onProposeEvent={openProposalForm}
        onSubscribeCalendar={openCalendarFeed}
      />

      {/* The block only exists once the clock is known (after hydration), so it
          grows into place instead of pushing the month down in a single jump. */}
      <AnimatedCollapse isOpen={nextOccurrence !== null && nowTime !== null}>
        {nextOccurrence && nowTime !== null ? (
          <TribeNextEvent
            attendanceStreak={attendanceStreak}
            isSavingAttendance={isSavingAttendance}
            nowTime={nowTime}
            occurrence={nextOccurrence}
            viewerTimeZone={viewerTimeZone}
            onSeeDetail={selectOccurrence}
            onSetAttendance={saveAttendance}
          />
        ) : null}
      </AnimatedCollapse>

      {loadingMonth === null ? null : (
        <p className={styles.TribeEventsCalendar__monthStatus} role={ROLE_STATUS}>
          {COPY.monthLoading}
        </p>
      )}
      {/* The previous month stays on screen, dimmed, until the next one arrives. */}
      <div
        aria-busy={loadingMonth !== null}
        className={cn(
          styles.TribeEventsCalendar__swipeArea,
          loadingMonth !== null && styles["TribeEventsCalendar__swipeArea--loading"]
        )}
        {...monthSwipeHandlers}
      >
        {/* Keyed by month so a new month replays its directional entrance. */}
        <div
          className={styles.TribeEventsCalendar__monthView}
          data-month-transition={monthTransitionDirection}
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
              {renderView(renderedViewMode)}
            </div>
          ))}
        </div>
      </div>

      <TribeEventDetailDialog
        activityPanel={
          selectedOccurrence ? (
            <TribeEventOccurrenceActivity
              isFinished={isPast(selectedOccurrence)}
              key={selectedOccurrence.occurrenceKey}
              occurrence={selectedOccurrence}
              tribeSlug={tribeSlug}
              onRecordingAvailabilityChange={setOccurrenceRecordingAvailability}
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
              reportState={attendanceReportState}
              onRetry={reloadAttendanceReport}
            />
          ) : null
        }
        canManageEvents={canManageEvents}
        isPast={selectedOccurrence ? isPast(selectedOccurrence) : false}
        isSavingAttendance={isSavingAttendance}
        isSavingException={isSavingException}
        occurrence={selectedOccurrence}
        tribeSlug={tribeSlug}
        viewerTimeZone={viewerTimeZone}
        onCancelOccurrence={(occurrence) =>
          openExceptionDialog(TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled, occurrence)
        }
        onClose={() => setSelectedOccurrenceKey(null)}
        onMoveOccurrence={(occurrence) =>
          openExceptionDialog(TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved, occurrence)
        }
        onRestoreOccurrence={(occurrence) => {
          void clearOccurrenceException(occurrence);
        }}
        onCopyLink={(occurrence) => {
          void copyOccurrenceLink(occurrence);
        }}
        onDelete={(occurrence) => {
          setSelectedOccurrenceKey(null);
          setPendingDeleteOccurrence(occurrence);
        }}
        onEdit={openEditForm}
        onSetAttendance={saveAttendance}
        onToggleAttendees={(isOpen) =>
          setAttendeesOccurrenceKey(isOpen ? selectedOccurrenceKey : null)
        }
      />

      <TribeEventFormDialog
        editingOccurrence={formSession.mode === FORM_MODE.edit ? formSession.occurrence : null}
        initialValues={
          formSession.mode === FORM_MODE.create || formSession.mode === FORM_MODE.approve
            ? formSession.initialValues
            : undefined
        }
        isOpen={formSession.mode !== FORM_MODE.closed}
        isSaving={
          formSession.mode === FORM_MODE.approve ? proposals.isSubmitting : isSavingEvent
        }
        purpose={
          formSession.mode === FORM_MODE.approve
            ? TRIBE_EVENT_FORM_PURPOSE.approve
            : TRIBE_EVENT_FORM_PURPOSE.save
        }
        key={formSession.mode === FORM_MODE.closed ? FORM_MODE.closed : formSession.session}
        onClose={closeForm}
        onSubmit={(payload) => {
          void submitEventForm(payload);
        }}
      />

      {exceptionDialog ? (
        <TribeEventOccurrenceExceptionDialog
          isSaving={isSavingException}
          key={exceptionDialog.session}
          mode={exceptionDialog.mode}
          occurrence={exceptionDialog.occurrence}
          onClose={() => setExceptionDialog(null)}
          onSubmit={(submission) => {
            void submitOccurrenceException(submission);
          }}
        />
      ) : null}

      {canProposeEvents ? (
        <TribeEventProposalFormDialog
          isOpen={isProposalFormOpen}
          isSubmitting={proposals.isSubmitting}
          key={proposalFormSession}
          onClose={() => setIsProposalFormOpen(false)}
          onSubmit={(submission) => {
            void submitProposal(submission);
          }}
        />
      ) : null}

      {canManageEvents || canProposeEvents ? (
        <TribeEventProposalsPanel
          canManageEvents={canManageEvents}
          isOpen={isProposalsPanelOpen}
          isSubmitting={proposals.isSubmitting}
          loadState={proposals.loadState}
          onClose={() => setIsProposalsPanelOpen(false)}
          onReject={proposals.rejectProposal}
          onRetry={proposals.loadProposals}
          onReview={openApprovalForm}
          onWithdraw={(proposal) => {
            void proposals.withdrawProposal(proposal);
          }}
        />
      ) : null}

      <TribeEventCalendarFeedDialog
        feedUrl={calendarFeed.feedUrl}
        isOpen={isCalendarFeedOpen}
        isSubmitting={calendarFeed.isSubmitting}
        loadState={calendarFeed.loadState}
        onClose={closeCalendarFeed}
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
        occurrence={pendingDeleteOccurrence}
        onCancel={() => setPendingDeleteOccurrence(null)}
        onConfirm={() => {
          void confirmDeleteEvent();
        }}
      />
    </main>
  );
}
