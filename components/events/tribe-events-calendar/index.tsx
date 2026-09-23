"use client";

import { useMemo, useRef, useState } from "react";
import { useIsMobile } from "beez-ui";

import { TribeEventAgendaItem } from "@/components/events/tribe-event-agenda-item";
import { TribeEventDeleteDialog } from "@/components/events/tribe-event-delete-dialog";
import { TribeEventDetailDialog } from "@/components/events/tribe-event-detail-dialog";
import {
  TribeEventFormDialog,
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
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useTribeEventMutations } from "@/hooks/use-tribe-event-mutations";
import {
  formatBuenosAiresTime,
  getBuenosAiresDateKey,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";
import {
  getOccurrenceEndTime,
  isOccurrencePast,
} from "@/lib/events/tribe-event-occurrence-timing";
import {
  createCalendarDays,
  groupAgendaDays,
  groupOccurrencesByDay,
} from "@/lib/events/tribe-events-calendar-grid";
import { buildTribeEventsRoute } from "@/lib/events/tribe-events-routes";
import type {
  TribeEventAttendanceStatus,
  TribeEventMonthResult,
  TribeEventOccurrenceResult,
  TribeEventViewerPermissionsResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventsCalendarProps = {
  events: TribeEventOccurrenceResult[];
  month: TribeEventMonthResult;
  tribeSlug: string;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

type EventFormSession =
  | { mode: typeof FORM_MODE.closed }
  | { mode: typeof FORM_MODE.create; session: number }
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

/**
 * Client container of the tribe events page. It owns view state (mode,
 * selected day and occurrence, dialogs) and delegates data mutations to
 * `useTribeEventMutations`; every visual block is a presentational component.
 */
export function TribeEventsCalendar({
  events,
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
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<string | null>(null);
  const [pendingDeleteOccurrence, setPendingDeleteOccurrence] =
    useState<TribeEventOccurrenceResult | null>(null);
  const formSessionCounterRef = useRef(0);
  const [arePastEventsVisible, setArePastEventsVisible] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const currentMonth = month.current;
  const calendarDays = useMemo(() => createCalendarDays(currentMonth), [currentMonth]);
  const occurrencesByDay = useMemo(() => groupOccurrencesByDay(visibleEvents), [visibleEvents]);
  const canManageEvents = viewerPermissions.canManageEvents;
  const selectedOccurrence =
    visibleEvents.find((occurrence) => occurrence.occurrenceKey === selectedOccurrenceKey) ??
    null;
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
  const nextOccurrence =
    nowTime === null
      ? null
      : (visibleEvents.find((occurrence) => getOccurrenceEndTime(occurrence) >= nowTime) ??
        null);
  const isPast = (occurrence: TribeEventOccurrenceResult): boolean =>
    nowTime !== null && isOccurrencePast(occurrence, nowTime);
  const pastEvents = visibleEvents.filter(isPast);
  const upcomingEvents = visibleEvents.filter((occurrence) => !isPast(occurrence));
  // Past occurrences collapse only while the month still has something ahead;
  // browsing an old month shows everything, since all of it is history.
  const shouldCollapsePastEvents = pastEvents.length > 0 && upcomingEvents.length > 0;
  const agendaEvents =
    shouldCollapsePastEvents && !arePastEventsVisible ? upcomingEvents : visibleEvents;
  const agendaDays = useMemo(() => groupAgendaDays(agendaEvents), [agendaEvents]);

  const selectOccurrence = (occurrence: TribeEventOccurrenceResult) => {
    setSelectedOccurrenceKey(occurrence.occurrenceKey);
  };

  const openCreateForm = () => {
    formSessionCounterRef.current += 1;
    setFormSession({ mode: FORM_MODE.create, session: formSessionCounterRef.current });
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
    status: TribeEventAttendanceStatus | null
  ) => {
    void setAttendance(occurrence, status);
  };

  const renderAgendaItem = (occurrence: TribeEventOccurrenceResult) => (
    <TribeEventAgendaItem
      key={occurrence.occurrenceKey}
      nowTime={nowTime}
      occurrence={occurrence}
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
      {visibleEvents.length === 0 ? <TribeEventsEmptyState /> : null}
    </>
  );

  const renderListView = () =>
    visibleEvents.length === 0 ? (
      <TribeEventsEmptyState />
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
        nextMonthHref={buildTribeEventsRoute(tribeSlug, { month: month.next })}
        previousMonthHref={buildTribeEventsRoute(tribeSlug, { month: month.previous })}
        timeLabel={timeLabel}
        todayHref={buildTribeEventsRoute(tribeSlug, {
          month: getBuenosAiresMonthKey(new Date()),
        })}
        viewMode={viewMode}
        onChooseViewMode={setChosenViewMode}
        onCreateEvent={openCreateForm}
      />

      {nextOccurrence ? (
        <TribeNextEvent
          isSavingAttendance={isSavingAttendance}
          occurrence={nextOccurrence}
          onSeeDetail={selectOccurrence}
          onSetAttendance={saveAttendance}
        />
      ) : null}

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

      <TribeEventDetailDialog
        canManageEvents={canManageEvents}
        isPast={selectedOccurrence ? isPast(selectedOccurrence) : false}
        isSavingAttendance={isSavingAttendance}
        occurrence={selectedOccurrence}
        tribeSlug={tribeSlug}
        onClose={() => setSelectedOccurrenceKey(null)}
        onDelete={(occurrence) => {
          setSelectedOccurrenceKey(null);
          setPendingDeleteOccurrence(occurrence);
        }}
        onEdit={openEditForm}
        onSetAttendance={saveAttendance}
      />

      <TribeEventFormDialog
        editingOccurrence={formSession.mode === FORM_MODE.edit ? formSession.occurrence : null}
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
