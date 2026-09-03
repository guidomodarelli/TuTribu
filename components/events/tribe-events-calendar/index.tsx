"use client";

import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ListIcon,
} from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { TribeEventDeleteDialog } from "@/components/events/tribe-event-delete-dialog";
import { TribeEventDetailDialog } from "@/components/events/tribe-event-detail-dialog";
import {
  TribeEventFormDialog,
  type TribeEventFormPayload,
} from "@/components/events/tribe-event-form-dialog";
import { Link } from "@/components/navigation/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresMonthTitle,
  formatBuenosAiresTime,
  formatBuenosAiresTimeRange,
  getBuenosAiresDateKey,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";
import { ROUTES } from "@/src/constants/routes";
import { BUENOS_AIRES_UTC_OFFSET } from "@/src/constants/date-time";
import {
  TRIBE_EVENT_ATTENDANCE_LABEL,
  TRIBE_EVENT_RECURRENCE_LABEL,
} from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
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

type CalendarMode = (typeof CALENDAR_MODE)[keyof typeof CALENDAR_MODE];

type VisibleEventsState = {
  events: TribeEventOccurrenceResult[];
  sourceEvents: TribeEventOccurrenceResult[];
};

type EventFormSession =
  | { mode: typeof FORM_MODE.closed }
  | { mode: typeof FORM_MODE.create; session: number }
  | {
      mode: typeof FORM_MODE.edit;
      occurrence: TribeEventOccurrenceResult;
      session: number;
    };

type SaveEventResponseBody = {
  message?: string;
  occurrences?: TribeEventOccurrenceResult[];
};

type AttendanceResponseBody = {
  attendance?: TribeEventOccurrenceResult["attendance"];
  message?: string;
};

const CALENDAR_DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CALENDAR_MODE = {
  calendar: "calendar",
  list: "list",
} as const;
const FORM_MODE = {
  closed: "closed",
  create: "create",
  edit: "edit",
} as const;
const CALENDAR = {
  dateInputLength: 10,
  firstCalendarDay: 1,
  firstMonthDayTime: "-01T00:00:00",
  millisecondsPerDay: 86_400_000,
  monthIndexOffset: 1,
  weekLength: 7,
} as const;
const HTTP_REQUEST = {
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  methodDelete: "DELETE",
  methodPatch: "PATCH",
  methodPost: "POST",
  methodPut: "PUT",
} as const;
const EVENT_ENDPOINT = {
  attendancePath: "/attendance",
  eventsPath: "/events",
  monthQuery: "?month=",
  occurrenceQuery: "?occurrence=",
  separator: "/",
} as const;
const ROUTE_QUERY = {
  month: "?month=",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeIcon: "icon",
  sizeSmall: "sm",
  typeButton: "button",
  variantGhost: "ghost",
  variantOutline: "outline",
  variantSecondary: "secondary",
} as const;
const BADGE_VARIANT = {
  default: "default",
  outline: "outline",
  secondary: "secondary",
} as const;
const ATTENDANCE_OPTIONS = [
  TRIBE_EVENT_ATTENDANCE_STATUS.going,
  TRIBE_EVENT_ATTENDANCE_STATUS.notGoing,
] as const;
const COPY = {
  attendanceFailure: "No pudimos guardar tu respuesta.",
  attendanceLegend: "¿Vas a participar?",
  attendanceSaved: "Respuesta guardada.",
  calendarTableLabel: "Calendario mensual de eventos",
  createButton: "Crear evento",
  dateColumn: "Fecha",
  dayButtonLabel: (dayLabel: string, eventCount: number) =>
    `${dayLabel}: ${eventCount} ${eventCount === 1 ? "evento" : "eventos"}`,
  dayEventsLabel: "Eventos del día",
  deleteFailure: "No pudimos eliminar el evento.",
  deleteSuccess: "Evento eliminado.",
  emptyMonth: "No hay eventos este mes.",
  emptyMonthHint: "Cuando se programe un encuentro, va a aparecer acá.",
  eventColumn: "Evento",
  eventSaveFailure: "No pudimos guardar el evento.",
  eventSaveFallback: "Evento guardado.",
  goingColumn: "Asistencia",
  goingBadge: "Vas",
  goingCountSuffixPlural: " van",
  goingCountSuffixSingular: " va",
  hidePastButton: "Ocultar finalizados",
  notGoingBadge: "No vas",
  linkColumn: "Link",
  linkFallback: "Sin link",
  linkOpen: "Abrir link",
  listTableLabel: "Lista de eventos",
  nextEventLabel: "Próximo evento",
  nextMonth: "Mes siguiente",
  pastBadge: "Finalizado",
  previousMonth: "Mes anterior",
  scheduleColumn: "Horario",
  scheduleSeparator: " · ",
  seeDetail: "Ver detalle",
  showPastButton: (pastCount: number) =>
    pastCount === 1 ? "Ver 1 finalizado" : `Ver ${pastCount} finalizados`,
  timeLabelSuffix: " Buenos Aires",
  today: "Hoy",
  todayBadge: "Hoy",
  viewCalendar: "Ver calendario",
  viewList: "Ver lista",
  viewModeLabel: "Vista de eventos",
} as const;
const LINK_ATTRIBUTE = {
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const KEY_PREFIX = {
  week: "week-",
} as const;
const PILL_SEPARATOR = " ";
const DAY_DOTS_MAX = 3;

/**
 * Hydration store: the server snapshot is `false` and the client snapshot is
 * `true`, so the first client render still matches the server markup and the
 * component learns it is hydrated on the very next render without an effect.
 */
function subscribeToNothing() {
  return () => undefined;
}

function getHydratedSnapshot() {
  return true;
}

function getServerHydratedSnapshot() {
  return false;
}

function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  );
}

function buildEventsRoute(tribeSlug: string, month: string): string {
  return ROUTES.tribes.events(tribeSlug) + ROUTE_QUERY.month + month;
}

function buildEventsEndpoint(tribeSlug: string, month?: string): string {
  const base = ROUTES.api.tribes + EVENT_ENDPOINT.separator + tribeSlug + EVENT_ENDPOINT.eventsPath;

  return month ? base + EVENT_ENDPOINT.monthQuery + month : base;
}

function buildEventEndpoint(tribeSlug: string, eventId: string, month?: string): string {
  const base = buildEventsEndpoint(tribeSlug) + EVENT_ENDPOINT.separator + eventId;

  return month ? base + EVENT_ENDPOINT.monthQuery + month : base;
}

function buildAttendanceEndpoint(
  tribeSlug: string,
  eventId: string,
  occurrenceStartsAt?: string
): string {
  const base = buildEventEndpoint(tribeSlug, eventId) + EVENT_ENDPOINT.attendancePath;

  return occurrenceStartsAt
    ? base + EVENT_ENDPOINT.occurrenceQuery + encodeURIComponent(occurrenceStartsAt)
    : base;
}

function createCalendarDays(month: string) {
  const monthStart = new Date(
    month + CALENDAR.firstMonthDayTime + BUENOS_AIRES_UTC_OFFSET
  );
  const year = monthStart.getUTCFullYear();
  const monthIndex = monthStart.getUTCMonth();
  const daysInMonth = new Date(
    Date.UTC(year, monthIndex + CALENDAR.monthIndexOffset, 0)
  ).getUTCDate();
  const leadingDays =
    (monthStart.getUTCDay() + CALENDAR.weekLength - CALENDAR.firstCalendarDay) %
    CALENDAR.weekLength;
  const totalCells =
    Math.ceil((leadingDays + daysInMonth) / CALENDAR.weekLength) *
    CALENDAR.weekLength;
  const firstCellTime =
    monthStart.getTime() - leadingDays * CALENDAR.millisecondsPerDay;

  return Array.from({ length: totalCells }, (_, dayIndex) => {
    const date = new Date(firstCellTime + dayIndex * CALENDAR.millisecondsPerDay);
    const dateKey = date.toISOString().slice(0, CALENDAR.dateInputLength);

    return {
      dateKey,
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === monthIndex,
    };
  });
}

function groupEventsByDay(events: TribeEventOccurrenceResult[]) {
  return events.reduce<Record<string, TribeEventOccurrenceResult[]>>(
    (groupedEvents, occurrence) => {
      const dayKey = getBuenosAiresDateKey(occurrence.startsAt);

      return {
        ...groupedEvents,
        [dayKey]: [...(groupedEvents[dayKey] ?? []), occurrence],
      };
    },
    {}
  );
}

function sortByStart(
  firstOccurrence: TribeEventOccurrenceResult,
  secondOccurrence: TribeEventOccurrenceResult
): number {
  return firstOccurrence.startsAt.localeCompare(secondOccurrence.startsAt);
}

function getOccurrenceEndTime(occurrence: TribeEventOccurrenceResult): number {
  return Date.parse(occurrence.endsAt ?? occurrence.startsAt);
}

function formatGoingCount(goingCount: number): string {
  return (
    String(goingCount) +
    (goingCount === 1 ? COPY.goingCountSuffixSingular : COPY.goingCountSuffixPlural)
  );
}

/**
 * Replaces every occurrence of the saved event with the fresh set returned by
 * the endpoint, keeping the attendance summary of slots that already existed
 * because a series edit does not touch attendance rows.
 */
function mergeSavedOccurrences(
  currentEvents: TribeEventOccurrenceResult[],
  savedOccurrences: TribeEventOccurrenceResult[],
  eventId: string
): TribeEventOccurrenceResult[] {
  const previousAttendance = new Map(
    currentEvents
      .filter((occurrence) => occurrence.eventId === eventId)
      .map((occurrence) => [occurrence.occurrenceKey, occurrence.attendance])
  );

  return [
    ...currentEvents.filter((occurrence) => occurrence.eventId !== eventId),
    ...savedOccurrences.map((occurrence) => ({
      ...occurrence,
      attendance:
        previousAttendance.get(occurrence.occurrenceKey) ?? occurrence.attendance,
    })),
  ].sort(sortByStart);
}

async function readJsonBody<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

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
  const [chosenMode, setChosenMode] = useState<CalendarMode | null>(null);
  const calendarMode =
    chosenMode ?? (isMobile ? CALENDAR_MODE.list : CALENDAR_MODE.calendar);
  // `useIsMobile` cannot know the viewport on the server, so until hydration
  // both views are rendered and a CSS media query shows the right one. That
  // avoids flashing the desktop grid on phones before the client takes over.
  const shouldRenderBothViews = chosenMode === null && !isHydrated;
  const nowTime = useMinuteClock();
  const clock =
    nowTime === null
      ? null
      : {
          nowTime,
          timeLabel: formatBuenosAiresTime(new Date(nowTime)) + COPY.timeLabelSuffix,
        };
  const [visibleEventsState, setVisibleEventsState] = useState<VisibleEventsState>({
    events,
    sourceEvents: events,
  });
  const [formSession, setFormSession] = useState<EventFormSession>({
    mode: FORM_MODE.closed,
  });
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<string | null>(
    null
  );
  const [pendingDeleteOccurrence, setPendingDeleteOccurrence] =
    useState<TribeEventOccurrenceResult | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const isSavingEventRef = useRef(false);
  const formSessionCounterRef = useRef(0);

  const [arePastEventsVisible, setArePastEventsVisible] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const unsortedVisibleEvents =
    visibleEventsState.sourceEvents === events ? visibleEventsState.events : events;
  // The endpoint returns occurrences ordered, but the agenda groups by day and
  // relies on the order inside each day, so sort defensively on the client.
  const visibleEvents = useMemo(
    () => [...unsortedVisibleEvents].sort(sortByStart),
    [unsortedVisibleEvents]
  );
  const currentMonth = month.current;
  const calendarDays = useMemo(() => createCalendarDays(currentMonth), [currentMonth]);
  const eventsByDay = useMemo(() => groupEventsByDay(visibleEvents), [visibleEvents]);
  const canManageEvents = viewerPermissions.canManageEvents;
  const selectedOccurrence =
    visibleEvents.find((occurrence) => occurrence.occurrenceKey === selectedOccurrenceKey) ??
    null;
  const todayKey = clock ? getBuenosAiresDateKey(new Date(clock.nowTime)) : null;
  // The phone grid shows dots per day and lists the tapped day under the
  // grid; until the viewer taps one, today's agenda is shown when it belongs
  // to the visible month.
  const isTodayInMonth = calendarDays.some(
    (day) => day.isCurrentMonth && day.dateKey === todayKey
  );
  const activeDayKey = selectedDayKey ?? (isTodayInMonth ? todayKey : null);
  const activeDayEvents = activeDayKey ? (eventsByDay[activeDayKey] ?? []) : [];
  const nextOccurrence = clock
    ? visibleEvents.find((occurrence) => getOccurrenceEndTime(occurrence) >= clock.nowTime) ??
      null
    : null;

  const isPastOccurrence = (occurrence: TribeEventOccurrenceResult): boolean =>
    clock !== null && getOccurrenceEndTime(occurrence) < clock.nowTime;
  const pastEvents = visibleEvents.filter(isPastOccurrence);
  const upcomingEvents = visibleEvents.filter(
    (occurrence) => !isPastOccurrence(occurrence)
  );
  // Past occurrences collapse only while the month still has something ahead;
  // browsing an old month shows everything, since all of it is history.
  const shouldCollapsePastEvents = pastEvents.length > 0 && upcomingEvents.length > 0;
  const agendaEvents =
    shouldCollapsePastEvents && !arePastEventsVisible ? upcomingEvents : visibleEvents;
  const agendaDays = useMemo(() => {
    const groups = new Map<string, TribeEventOccurrenceResult[]>();

    for (const occurrence of agendaEvents) {
      const dayKey = getBuenosAiresDateKey(occurrence.startsAt);

      groups.set(dayKey, [...(groups.get(dayKey) ?? []), occurrence]);
    }

    return [...groups.entries()].map(([dayKey, dayEvents]) => ({
      dayEvents,
      dayKey,
    }));
  }, [agendaEvents]);

  const chooseCalendarMode = (mode: CalendarMode) => {
    setChosenMode(mode);
  };

  const replaceVisibleEvents = (
    updater: (currentEvents: TribeEventOccurrenceResult[]) => TribeEventOccurrenceResult[]
  ) => {
    setVisibleEventsState((currentVisibleEventsState) => {
      const currentEvents =
        currentVisibleEventsState.sourceEvents === events
          ? currentVisibleEventsState.events
          : events;

      return {
        events: updater(currentEvents),
        sourceEvents: events,
      };
    });
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
    setIsSavingEvent(false);
    isSavingEventRef.current = false;
  };

  const submitEventForm = async (payload: TribeEventFormPayload) => {
    if (isSavingEventRef.current || formSession.mode === FORM_MODE.closed) {
      return;
    }

    isSavingEventRef.current = true;
    setIsSavingEvent(true);

    const editingOccurrence =
      formSession.mode === FORM_MODE.edit ? formSession.occurrence : null;
    const endpoint = editingOccurrence
      ? buildEventEndpoint(tribeSlug, editingOccurrence.eventId, currentMonth)
      : buildEventsEndpoint(tribeSlug, currentMonth);

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType,
        },
        method: editingOccurrence ? HTTP_REQUEST.methodPatch : HTTP_REQUEST.methodPost,
      });
      const result = await readJsonBody<SaveEventResponseBody>(response);

      if (!response.ok || !result.occurrences) {
        toast.error(result.message ?? COPY.eventSaveFailure);
        return;
      }

      const savedOccurrences = result.occurrences;
      const savedEventId =
        editingOccurrence?.eventId ?? savedOccurrences[0]?.eventId ?? null;

      if (savedEventId) {
        replaceVisibleEvents((currentEvents) =>
          mergeSavedOccurrences(currentEvents, savedOccurrences, savedEventId)
        );
      }

      toast.success(result.message ?? COPY.eventSaveFallback);
      closeForm();
    } finally {
      isSavingEventRef.current = false;
      setIsSavingEvent(false);
    }
  };

  const confirmDeleteEvent = async () => {
    if (!pendingDeleteOccurrence || isDeletingEvent) {
      return;
    }

    setIsDeletingEvent(true);

    try {
      const response = await fetch(
        buildEventEndpoint(tribeSlug, pendingDeleteOccurrence.eventId),
        { method: HTTP_REQUEST.methodDelete }
      );
      const result = await readJsonBody<{ message?: string }>(response);

      if (!response.ok) {
        toast.error(result.message ?? COPY.deleteFailure);
        return;
      }

      const deletedEventId = pendingDeleteOccurrence.eventId;

      replaceVisibleEvents((currentEvents) =>
        currentEvents.filter((occurrence) => occurrence.eventId !== deletedEventId)
      );
      setSelectedOccurrenceKey(null);
      setPendingDeleteOccurrence(null);
      toast.success(result.message ?? COPY.deleteSuccess);
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const saveAttendance = async (
    occurrence: TribeEventOccurrenceResult,
    status: TribeEventAttendanceStatus | null
  ) => {
    if (isSavingAttendance) {
      return;
    }

    setIsSavingAttendance(true);

    try {
      const response = status
        ? await fetch(buildAttendanceEndpoint(tribeSlug, occurrence.eventId), {
            body: JSON.stringify({
              occurrenceStartsAt: occurrence.startsAt,
              status,
            }),
            headers: {
              [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType,
            },
            method: HTTP_REQUEST.methodPut,
          })
        : await fetch(
            buildAttendanceEndpoint(tribeSlug, occurrence.eventId, occurrence.startsAt),
            { method: HTTP_REQUEST.methodDelete }
          );
      const result = await readJsonBody<AttendanceResponseBody>(response);

      if (!response.ok || !result.attendance) {
        toast.error(result.message ?? COPY.attendanceFailure);
        return;
      }

      const savedAttendance = result.attendance;

      replaceVisibleEvents((currentEvents) =>
        currentEvents.map((currentOccurrence) =>
          currentOccurrence.occurrenceKey === occurrence.occurrenceKey
            ? { ...currentOccurrence, attendance: savedAttendance }
            : currentOccurrence
        )
      );
      toast.success(result.message ?? COPY.attendanceSaved);
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const renderEmptyState = () => (
    <div className={styles.TribeEventsCalendar__emptyState}>
      <p className={styles.TribeEventsCalendar__emptyTitle}>{COPY.emptyMonth}</p>
      <p className={styles.TribeEventsCalendar__emptyHint}>{COPY.emptyMonthHint}</p>
    </div>
  );

  const renderCalendarView = () => (
    <>
      <Table
        aria-label={COPY.calendarTableLabel}
        className={styles.TribeEventsCalendar__calendarTable}
      >
        <TableHeader>
          <TableRow>
            {CALENDAR_DAY_LABELS.map((dayLabel) => (
              <TableHead
                className={styles.TribeEventsCalendar__dayHeader}
                key={dayLabel}
              >
                {dayLabel}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({
            length: calendarDays.length / CALENDAR.weekLength,
          }).map((_, weekIndex) => (
            <TableRow key={KEY_PREFIX.week + weekIndex}>
              {calendarDays
                .slice(
                  weekIndex * CALENDAR.weekLength,
                  (weekIndex + 1) * CALENDAR.weekLength
                )
                .map((day) => {
                  const isToday = day.dateKey === todayKey;

                  return (
                    <TableCell
                      aria-current={isToday ? "date" : undefined}
                      className={
                        isToday
                          ? styles["TribeEventsCalendar__dayCell--today"]
                          : styles.TribeEventsCalendar__dayCell
                      }
                      key={day.dateKey}
                    >
                      <span
                        className={
                          day.isCurrentMonth
                            ? styles.TribeEventsCalendar__dayNumber
                            : styles.TribeEventsCalendar__dayNumberMuted
                        }
                      >
                        {day.dayNumber}
                        {isToday ? (
                          <span className={styles.TribeEventsCalendar__srOnly}>
                            {PILL_SEPARATOR}
                            {COPY.todayBadge}
                          </span>
                        ) : null}
                      </span>
                      {(eventsByDay[day.dateKey] ?? []).length > 0 ? (
                        <button
                          aria-label={COPY.dayButtonLabel(
                            formatBuenosAiresLongDate(eventsByDay[day.dateKey][0].startsAt),
                            eventsByDay[day.dateKey].length
                          )}
                          aria-pressed={activeDayKey === day.dateKey}
                          className={styles.TribeEventsCalendar__dayButton}
                          type={BUTTON_ATTRIBUTE.typeButton}
                          onClick={() => setSelectedDayKey(day.dateKey)}
                        >
                          {eventsByDay[day.dateKey].slice(0, DAY_DOTS_MAX).map((occurrence) => (
                            <span
                              aria-hidden
                              className={
                                isPastOccurrence(occurrence)
                                  ? styles["TribeEventsCalendar__dayDot--past"]
                                  : styles.TribeEventsCalendar__dayDot
                              }
                              key={occurrence.occurrenceKey}
                            />
                          ))}
                        </button>
                      ) : null}
                      <div className={styles.TribeEventsCalendar__dayEvents}>
                        {(eventsByDay[day.dateKey] ?? []).map((occurrence) => (
                          <button
                            className={
                              isPastOccurrence(occurrence)
                                ? styles["TribeEventsCalendar__eventPill--past"]
                                : styles.TribeEventsCalendar__eventPill
                            }
                            key={occurrence.occurrenceKey}
                            type={BUTTON_ATTRIBUTE.typeButton}
                            onClick={() =>
                              setSelectedOccurrenceKey(occurrence.occurrenceKey)
                            }
                          >
                            <span className={styles.TribeEventsCalendar__eventPillTime}>
                              {formatBuenosAiresTime(occurrence.startsAt)}
                            </span>
                            <span className={styles.TribeEventsCalendar__eventPillTitle}>
                              {PILL_SEPARATOR}
                              {occurrence.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </TableCell>
                  );
                })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {visibleEvents.length === 0 ? renderEmptyState() : null}
      {activeDayKey && activeDayEvents.length > 0 ? (
        <section
          aria-label={COPY.dayEventsLabel}
          className={styles.TribeEventsCalendar__daySummary}
        >
          {renderDayHeading(activeDayKey, activeDayEvents[0].startsAt)}
          <ol className={styles.TribeEventsCalendar__agendaList}>
            {activeDayEvents.map(renderAgendaItem)}
          </ol>
        </section>
      ) : null}
    </>
  );

  const renderAttendanceBadge = (occurrence: TribeEventOccurrenceResult) => {
    if (occurrence.attendance.viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.going) {
      return <Badge variant={BADGE_VARIANT.default}>{COPY.goingBadge}</Badge>;
    }

    if (occurrence.attendance.viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.notGoing) {
      return <Badge variant={BADGE_VARIANT.outline}>{COPY.notGoingBadge}</Badge>;
    }

    return null;
  };

  const renderAttendanceButtons = (occurrence: TribeEventOccurrenceResult) => (
    <div
      aria-label={COPY.attendanceLegend}
      className={styles.TribeEventsCalendar__attendanceButtons}
      role="group"
    >
      {ATTENDANCE_OPTIONS.map((status) => {
        const isSelected = occurrence.attendance.viewerStatus === status;

        return (
          <Button
            aria-pressed={isSelected}
            disabled={isSavingAttendance}
            key={status}
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={
              isSelected ? BUTTON_ATTRIBUTE.variantSecondary : BUTTON_ATTRIBUTE.variantOutline
            }
            onClick={() => {
              void saveAttendance(occurrence, isSelected ? null : status);
            }}
          >
            {TRIBE_EVENT_ATTENDANCE_LABEL[status]}
          </Button>
        );
      })}
    </div>
  );

  const renderAgendaItem = (occurrence: TribeEventOccurrenceResult) => {
    const isPast = isPastOccurrence(occurrence);

    return (
      <li
        className={
          isPast
            ? styles["TribeEventsCalendar__agendaItem--past"]
            : styles.TribeEventsCalendar__agendaItem
        }
        key={occurrence.occurrenceKey}
      >
        <span className={styles.TribeEventsCalendar__agendaTime}>
          {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
        </span>
        <div className={styles.TribeEventsCalendar__agendaMain}>
          <button
            className={styles.TribeEventsCalendar__listTitleButton}
            type={BUTTON_ATTRIBUTE.typeButton}
            onClick={() => setSelectedOccurrenceKey(occurrence.occurrenceKey)}
          >
            {occurrence.title}
          </button>
          <div className={styles.TribeEventsCalendar__agendaMeta}>
            {isPast ? (
              <Badge variant={BADGE_VARIANT.secondary}>{COPY.pastBadge}</Badge>
            ) : (
              renderAttendanceBadge(occurrence)
            )}
            {occurrence.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none ? (
              <span className={styles.TribeEventsCalendar__agendaMetaText}>
                {TRIBE_EVENT_RECURRENCE_LABEL[occurrence.recurrenceFrequency]}
              </span>
            ) : null}
            <span className={styles.TribeEventsCalendar__agendaMetaText}>
              {formatGoingCount(occurrence.attendance.goingCount)}
            </span>
          </div>
        </div>
        {occurrence.meetingUrl ? (
          <a
            aria-label={COPY.linkOpen}
            className={styles.TribeEventsCalendar__agendaLink}
            href={occurrence.meetingUrl}
            rel={LINK_ATTRIBUTE.noreferrer}
            target={LINK_ATTRIBUTE.targetBlank}
            title={COPY.linkOpen}
          >
            <ExternalLinkIcon aria-hidden />
          </a>
        ) : null}
      </li>
    );
  };

  const renderDayHeading = (dayKey: string, startsAt: string) => (
    <h2 className={styles.TribeEventsCalendar__agendaDayTitle}>
      {formatBuenosAiresLongDate(startsAt)}
      {dayKey === todayKey ? (
        <Badge variant={BADGE_VARIANT.secondary}>{COPY.todayBadge}</Badge>
      ) : null}
    </h2>
  );

  const renderListView = () =>
    visibleEvents.length === 0 ? (
      renderEmptyState()
    ) : (
      <section aria-label={COPY.listTableLabel} className={styles.TribeEventsCalendar__agenda}>
        {shouldCollapsePastEvents ? (
          <Button
            aria-expanded={arePastEventsVisible}
            className={styles.TribeEventsCalendar__pastToggle}
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantGhost}
            onClick={() => setArePastEventsVisible((currentValue) => !currentValue)}
          >
            {arePastEventsVisible
              ? COPY.hidePastButton
              : COPY.showPastButton(pastEvents.length)}
          </Button>
        ) : null}
        {agendaDays.map((agendaDay) => (
          <section className={styles.TribeEventsCalendar__agendaDay} key={agendaDay.dayKey}>
            {renderDayHeading(agendaDay.dayKey, agendaDay.dayEvents[0].startsAt)}
            <ol className={styles.TribeEventsCalendar__agendaList}>
              {agendaDay.dayEvents.map(renderAgendaItem)}
            </ol>
          </section>
        ))}
      </section>
    );

  return (
    <main className={styles.TribeEventsCalendar}>
      <header className={styles.TribeEventsCalendar__header}>
        <div className={styles.TribeEventsCalendar__monthNavigation}>
          <Link
            aria-label={COPY.previousMonth}
            className={styles.TribeEventsCalendar__iconLink}
            href={buildEventsRoute(tribeSlug, month.previous)}
            prefetch
          >
            <ChevronLeftIcon aria-hidden />
          </Link>
          <h1 className={styles.TribeEventsCalendar__title}>
            {formatBuenosAiresMonthTitle(month.current)}
          </h1>
          <Link
            aria-label={COPY.nextMonth}
            className={styles.TribeEventsCalendar__iconLink}
            href={buildEventsRoute(tribeSlug, month.next)}
            prefetch
          >
            <ChevronRightIcon aria-hidden />
          </Link>
        </div>
        <div className={styles.TribeEventsCalendar__toolbar}>
          <div className={styles.TribeEventsCalendar__todayGroup}>
            <Link
              className={styles.TribeEventsCalendar__todayLink}
              href={buildEventsRoute(tribeSlug, getBuenosAiresMonthKey(new Date()))}
            >
              {COPY.today}
            </Link>
            {clock ? (
              <p className={styles.TribeEventsCalendar__timeLabel}>{clock.timeLabel}</p>
            ) : null}
          </div>
          <div className={styles.TribeEventsCalendar__actions}>
            <div
              className={styles.TribeEventsCalendar__viewToggle}
              aria-label={COPY.viewModeLabel}
            >
              <Button
                aria-pressed={calendarMode === CALENDAR_MODE.list}
                size={BUTTON_ATTRIBUTE.sizeIcon}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={
                  calendarMode === CALENDAR_MODE.list
                    ? BUTTON_ATTRIBUTE.variantSecondary
                    : BUTTON_ATTRIBUTE.variantGhost
                }
                onClick={() => chooseCalendarMode(CALENDAR_MODE.list)}
              >
                <ListIcon aria-hidden />
                <span className={styles.TribeEventsCalendar__srOnly}>{COPY.viewList}</span>
              </Button>
              <Button
                aria-pressed={calendarMode === CALENDAR_MODE.calendar}
                size={BUTTON_ATTRIBUTE.sizeIcon}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={
                  calendarMode === CALENDAR_MODE.calendar
                    ? BUTTON_ATTRIBUTE.variantSecondary
                    : BUTTON_ATTRIBUTE.variantGhost
                }
                onClick={() => chooseCalendarMode(CALENDAR_MODE.calendar)}
              >
                <CalendarDaysIcon aria-hidden />
                <span className={styles.TribeEventsCalendar__srOnly}>
                  {COPY.viewCalendar}
                </span>
              </Button>
            </div>
            {canManageEvents ? (
              <Button type={BUTTON_ATTRIBUTE.typeButton} onClick={openCreateForm}>
                {COPY.createButton}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {nextOccurrence ? (
        <section
          aria-label={COPY.nextEventLabel}
          className={styles.TribeEventsCalendar__nextEvent}
        >
          <div className={styles.TribeEventsCalendar__nextEventBody}>
            <p className={styles.TribeEventsCalendar__nextEventLabel}>
              {COPY.nextEventLabel}
            </p>
            <p className={styles.TribeEventsCalendar__nextEventTitle}>
              {nextOccurrence.title}
            </p>
            <p className={styles.TribeEventsCalendar__nextEventSchedule}>
              {formatBuenosAiresLongDate(nextOccurrence.startsAt)}
              {COPY.scheduleSeparator}
              {formatBuenosAiresTimeRange(nextOccurrence.startsAt, nextOccurrence.endsAt)}
            </p>
          </div>
          <div className={styles.TribeEventsCalendar__nextEventActions}>
            {renderAttendanceButtons(nextOccurrence)}
            <Button
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={() => setSelectedOccurrenceKey(nextOccurrence.occurrenceKey)}
            >
              {COPY.seeDetail}
            </Button>
          </div>
        </section>
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
      ) : calendarMode === CALENDAR_MODE.calendar ? (
        renderCalendarView()
      ) : (
        renderListView()
      )}

      <TribeEventDetailDialog
        canManageEvents={canManageEvents}
        isPast={selectedOccurrence ? isPastOccurrence(selectedOccurrence) : false}
        isSavingAttendance={isSavingAttendance}
        occurrence={selectedOccurrence}
        tribeSlug={tribeSlug}
        onClose={() => setSelectedOccurrenceKey(null)}
        onDelete={(occurrence) => {
          setSelectedOccurrenceKey(null);
          setPendingDeleteOccurrence(occurrence);
        }}
        onEdit={openEditForm}
        onSetAttendance={(occurrence, status) => {
          void saveAttendance(occurrence, status);
        }}
      />

      <TribeEventFormDialog
        editingOccurrence={
          formSession.mode === FORM_MODE.edit ? formSession.occurrence : null
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
