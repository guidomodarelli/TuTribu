"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, useIsMobile } from "beez-ui";

import { TribeEventAgendaItem } from "@/components/events/tribe-event-agenda-item";
import { TribeEventAttendeesPanel } from "@/components/events/tribe-event-attendees-panel";
import { TribeEventDeleteDialog } from "@/components/events/tribe-event-delete-dialog";
import { TribeEventDetailDialog } from "@/components/events/tribe-event-detail-dialog";
import {
  TribeEventFormDialog,
  type TribeEventFormInitialValues,
  type TribeEventFormPayload,
} from "@/components/events/tribe-event-form-dialog";
import { TribeEventsAgenda } from "@/components/events/tribe-events-agenda";
import {
  TRIBE_EVENTS_VIEW_MODE,
  TribeEventsCalendarHeader,
  type TribeEventsViewMode,
} from "@/components/events/tribe-events-calendar-header";
import { TribeEventsEmptyState } from "@/components/events/tribe-events-empty-state";
import { TribeEventsMonthGrid } from "@/components/events/tribe-events-month-grid";
import { TribeNextEvent } from "@/components/events/tribe-next-event";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useTribeEventAttendanceReport } from "@/hooks/use-tribe-event-attendance-report";
import { useTribeEventMutations } from "@/hooks/use-tribe-event-mutations";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import {
  formatBuenosAiresTime,
  getBuenosAiresDateKey,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";
import { isOccurrencePast } from "@/lib/events/tribe-event-occurrence-timing";
import { buildTribeEventAttendanceExportUrl } from "@/lib/events/tribe-events-api-client";
import {
  createCalendarDays,
  groupAgendaDays,
  groupOccurrencesByDay,
} from "@/lib/events/tribe-events-calendar-grid";
import { buildTribeEventsRoute } from "@/lib/events/tribe-events-routes";
import { HORIZONTAL_SWIPE_DIRECTION } from "@/lib/gestures/horizontal-swipe";
import { copyTextToClipboard } from "@/lib/browser-clipboard";
import { replaceCurrentUrlSearchParam } from "@/lib/browser-navigation";
import {
  TRIBE_EVENT_TEMPLATES,
  type TribeEventTemplate,
} from "@/src/modules/events/constants/tribe-event-templates";
import { TRIBE_EVENTS_ROUTE_QUERY } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceStreakResult,
  TribeEventMonthResult,
  TribeEventOccurrenceResult,
  TribeEventViewerPermissionsResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventsCalendarProps = {
  /** Viewer-only attendance streak, computed on the server (null if none). */
  attendanceStreak?: TribeEventAttendanceStreakResult | null;
  events: TribeEventOccurrenceResult[];
  /** Deep-linked occurrence whose detail opens on load (validated server-side). */
  initialOccurrenceKey?: string | null;
  month: TribeEventMonthResult;
  tribeSlug: string;
  viewerPermissions: TribeEventViewerPermissionsResult;
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
    };

const FORM_MODE = {
  closed: "closed",
  create: "create",
  edit: "edit",
} as const;
const TIME_LABEL_SUFFIX = " Buenos Aires";
const COPY = {
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
  attendanceStreak = null,
  events,
  initialOccurrenceKey = null,
  month,
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
  const nowTime = useMinuteClock();
  const router = useRouter();
  const viewerTimeZone = useViewerTimeZone();
  const {
    deleteEvent,
    isDeletingEvent,
    isSavingAttendance,
    isSavingEvent,
    saveEvent,
    setAttendance,
    visibleEvents,
  } = useTribeEventMutations({ events, month: month.current, tribeSlug });
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
  const occurrencesByDay = useMemo(() => groupOccurrencesByDay(visibleEvents), [visibleEvents]);
  const canManageEvents = viewerPermissions.canManageEvents;
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
  const nextOccurrence =
    nowTime === null
      ? null
      : (visibleEvents.find((occurrence) => !isPast(occurrence)) ?? null);
  const pastEvents = visibleEvents.filter(isPast);
  const upcomingEvents = visibleEvents.filter((occurrence) => !isPast(occurrence));
  // Past occurrences collapse only while the month still has something ahead;
  // browsing an old month shows everything, since all of it is history.
  const shouldCollapsePastEvents = pastEvents.length > 0 && upcomingEvents.length > 0;
  const agendaEvents =
    shouldCollapsePastEvents && !arePastEventsVisible ? upcomingEvents : visibleEvents;
  const agendaDays = useMemo(() => groupAgendaDays(agendaEvents), [agendaEvents]);
  // Before hydration there is no clock, so "Hoy" leaves the month to the
  // route (which defaults to the current Buenos Aires month) instead of
  // computing one on the server that could differ from the client's.
  const todayHref = buildTribeEventsRoute(
    tribeSlug,
    nowTime === null ? {} : { month: getBuenosAiresMonthKey(new Date(nowTime)) }
  );

  // The open detail is mirrored in the `event` query so the URL can be shared;
  // replaceState keeps it out of the history stack and never refetches.
  // Changing or closing the detail also forgets the "Asistentes" tab: closing
  // unmounts the tabs without reporting a tab change, and the dialog always
  // reopens on "Detalle", so the report must stay user-triggered.
  const setSelectedOccurrenceKey = (occurrenceKey: string | null) => {
    setAttendeesOccurrenceKey(null);
    setOccurrenceSelection({
      occurrenceKey,
      sourceOccurrenceKey: initialOccurrenceKey,
    });
    replaceCurrentUrlSearchParam(TRIBE_EVENTS_ROUTE_QUERY.event, occurrenceKey);
  };

  const previousMonthHref = buildTribeEventsRoute(tribeSlug, { month: month.previous });
  const nextMonthHref = buildTribeEventsRoute(tribeSlug, { month: month.next });
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
      recurrenceFrequency: template.recurrenceFrequency,
      title: template.title,
    });
  };

  const renderEmptyState = () =>
    canManageEvents ? (
      <TribeEventsEmptyState templates={TRIBE_EVENT_TEMPLATES} onUseTemplate={openTemplateForm} />
    ) : (
      <TribeEventsEmptyState />
    );

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
      {visibleEvents.length === 0 ? renderEmptyState() : null}
    </>
  );

  const renderListView = () =>
    visibleEvents.length === 0 ? (
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
        month={month.current}
        nextMonthHref={nextMonthHref}
        previousMonthHref={previousMonthHref}
        timeLabel={timeLabel}
        todayHref={todayHref}
        viewMode={viewMode}
        onChooseViewMode={setChosenViewMode}
        onCreateEvent={() => openCreateForm()}
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
            <div className={styles["TribeEventsCalendar__autoView--calendar"]}>
              {renderCalendarView()}
            </div>
            <div className={styles["TribeEventsCalendar__autoView--list"]}>
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
                occurrenceStartsAt: selectedOccurrence.startsAt,
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
        occurrence={selectedOccurrence}
        tribeSlug={tribeSlug}
        viewerTimeZone={viewerTimeZone}
        onClose={() => setSelectedOccurrenceKey(null)}
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
          formSession.mode === FORM_MODE.create ? formSession.initialValues : undefined
        }
        isOpen={formSession.mode !== FORM_MODE.closed}
        isSaving={isSavingEvent}
        key={formSession.mode === FORM_MODE.closed ? FORM_MODE.closed : formSession.session}
        onClose={closeForm}
        onSubmit={(payload) => {
          void submitEventForm(payload);
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
