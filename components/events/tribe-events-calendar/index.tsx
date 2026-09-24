"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn, toast, useIsMobile } from "beez-ui";

import { TribeEventAgendaItem } from "@/components/events/tribe-event-agenda-item";
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
  type TribeEventOccurrenceExceptionPayload,
} from "@/components/events/tribe-event-occurrence-exception-dialog";
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
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { advanceMinuteClockTo, useMinuteClock } from "@/hooks/use-minute-clock";
import { useOccurrenceFinishWatcher } from "@/hooks/use-occurrence-finish-watcher";
import { useTribeEventAttendanceReport } from "@/hooks/use-tribe-event-attendance-report";
import { useTribeEventMutations } from "@/hooks/use-tribe-event-mutations";
import { useTribeEventProposals } from "@/hooks/use-tribe-event-proposals";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import {
  formatBuenosAiresTime,
  getBuenosAiresDateKey,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";
import {
  readAttendanceStreakComputedTime,
  readAttendanceStreakNextRefreshTime,
} from "@/lib/events/tribe-event-attendance-streak-dto";
import { isOccurrenceCancelled } from "@/lib/events/tribe-event-occurrence-exception-copy";
import {
  getOccurrencePhaseChangeTimes,
  isOccurrencePast,
} from "@/lib/events/tribe-event-occurrence-timing";
import {
  filterOccurrencesByEventType,
  toggleEventTypeSelection,
} from "@/lib/events/tribe-event-type-filter";
import type { TribeEventProposalPayload } from "@/lib/events/tribe-event-proposals-api-client";
import {
  createCalendarDays,
  groupAgendaDays,
  groupOccurrencesByDay,
} from "@/lib/events/tribe-events-calendar-grid";
import {
  buildTribeEventAttendanceExportUrl,
  buildTribeEventsRoute,
} from "@/lib/events/tribe-events-routes";
import { HORIZONTAL_SWIPE_DIRECTION } from "@/lib/gestures/horizontal-swipe";
import { copyTextToClipboard } from "@/lib/browser-clipboard";
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
  tribeSlug: string;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

type ExceptionDialogSession = {
  mode: TribeEventOccurrenceExceptionMode;
  occurrence: TribeEventOccurrenceResult;
  session: number;
} | null;

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
const TIME_LABEL_SUFFIX = " Buenos Aires";
const COPY = {
  filteredEmpty: "No hay eventos de los tipos elegidos este mes.",
  linkCopied: "Link copiado.",
  linkCopyFailure: "No pudimos copiar el link.",
} as const;

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
  const router = useRouter();
  const viewerTimeZone = useViewerTimeZone();
  const {
    applyEventOccurrences,
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
    // Every server render stamps a new instant, so it replaces local streak state.
    attendanceStreakSourceVersion: attendanceStreakComputedAt,
    events,
    month: month.current,
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
    initialPendingCount: pendingProposalCount,
    month: month.current,
    onEventCreated: applyEventOccurrences,
    tribeSlug,
  });
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
  const filteredEvents = useMemo(
    () => filterOccurrencesByEventType(visibleEvents, selectedEventTypes),
    [selectedEventTypes, visibleEvents]
  );
  const [formSession, setFormSession] = useState<EventFormSession>({
    mode: FORM_MODE.closed,
  });
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
  const [pendingDeleteOccurrence, setPendingDeleteOccurrence] =
    useState<TribeEventOccurrenceResult | null>(null);
  const formSessionCounterRef = useRef(0);
  const [arePastEventsVisible, setArePastEventsVisible] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // Occurrence whose "Asistentes" tab is open; the report only loads for it.
  const [attendeesOccurrenceKey, setAttendeesOccurrenceKey] = useState<string | null>(null);

  const currentMonth = month.current;
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
  const todayHref = buildTribeEventsRoute(
    tribeSlug,
    nowTime === null
      ? { eventTypes: selectedEventTypes }
      : { eventTypes: selectedEventTypes, month: getBuenosAiresMonthKey(new Date(nowTime)) }
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

  const previousMonthHref = buildTribeEventsRoute(tribeSlug, {
    eventTypes: selectedEventTypes,
    month: month.previous,
  });
  const nextMonthHref = buildTribeEventsRoute(tribeSlug, {
    eventTypes: selectedEventTypes,
    month: month.next,
  });

  // The filter is client-side: toggling a chip never refetches; the URL
  // mirrors it (replaceState) so it can be shared and survives month links.
  const setSelectedEventTypes = (nextTypes: readonly TribeEventType[]) => {
    setEventTypeSelection({ selectedTypes: nextTypes, sourceTypes: initialEventTypes });
    replaceCurrentUrlSearchParamValues(TRIBE_EVENTS_ROUTE_QUERY.type, nextTypes);
  };
  // Phones flip months with a horizontal swipe over the grid or the agenda,
  // landing on the same routes as the header chevrons.
  const monthSwipeHandlers = useHorizontalSwipe((direction) => {
    router.push(
      direction === HORIZONTAL_SWIPE_DIRECTION.next ? nextMonthHref : previousMonthHref
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

  const openProposalsPanel = () => {
    setIsProposalsPanelOpen(true);
    proposals.loadProposals();
  };

  const submitProposal = async (payload: TribeEventProposalPayload) => {
    if (await proposals.createProposal(payload)) {
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

  const submitOccurrenceException = async (payload: TribeEventOccurrenceExceptionPayload) => {
    if (!exceptionDialog) {
      return;
    }

    if (await saveOccurrenceException(exceptionDialog.occurrence, payload)) {
      setExceptionDialog(null);
    }
  };

  const renderEmptyState = () => {
    if (visibleEvents.length > 0) {
      return <p className={styles.TribeEventsCalendar__filteredEmpty}>{COPY.filteredEmpty}</p>;
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

  const renderAgendaItem = (occurrence: TribeEventOccurrenceResult) => (
    <TribeEventAgendaItem
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
        onSelectDay={setSelectedDayKey}
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

  return (
    <main className={styles.TribeEventsCalendar}>
      <TribeEventsCalendarHeader
        canManageEvents={canManageEvents}
        canProposeEvents={canProposeEvents}
        month={month.current}
        nextMonthHref={nextMonthHref}
        pendingProposalCount={proposals.pendingCount}
        previousMonthHref={previousMonthHref}
        timeLabel={timeLabel}
        todayHref={todayHref}
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
        onChooseViewMode={setChosenViewMode}
        onCreateEvent={() => openCreateForm()}
        onOpenProposals={openProposalsPanel}
        onProposeEvent={openProposalForm}
      />

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

      <div className={styles.TribeEventsCalendar__swipeArea} {...monthSwipeHandlers}>
        {shouldRenderBothViews ? (
          <>
            <div
              className={cn(
                styles.TribeEventsCalendar__autoView,
                styles["TribeEventsCalendar__autoView--calendar"]
              )}
            >
              {renderCalendarView()}
            </div>
            <div
              className={cn(
                styles.TribeEventsCalendar__autoView,
                styles["TribeEventsCalendar__autoView--list"]
              )}
            >
              {renderListView()}
            </div>
          </>
        ) : viewMode === TRIBE_EVENTS_VIEW_MODE.calendar ? (
          renderCalendarView()
        ) : (
          renderListView()
        )}
      </div>

      <TribeEventDetailDialog
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
          onSubmit={(payload) => {
            void submitOccurrenceException(payload);
          }}
        />
      ) : null}

      {canProposeEvents ? (
        <TribeEventProposalFormDialog
          isOpen={isProposalFormOpen}
          isSubmitting={proposals.isSubmitting}
          key={proposalFormSession}
          onClose={() => setIsProposalFormOpen(false)}
          onSubmit={(payload) => {
            void submitProposal(payload);
          }}
        />
      ) : null}

      {canManageEvents || canProposeEvents ? (
        <TribeEventProposalsPanel
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
