"use client";

import { useRouter } from "next/navigation";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  TribeEventMonthResult,
  TribeEventResult,
  TribeEventViewerPermissionsResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { ROUTES } from "@/src/constants/routes";
import { Link } from "@/components/navigation/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import styles from "./styles.module.scss";

type TribeEventsCalendarProps = {
  events: TribeEventResult[];
  month: TribeEventMonthResult;
  tribeSlug: string;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

type CalendarMode = "calendar" | "list";

type EventFormState = {
  date: string;
  description: string;
  endsTime: string;
  meetingUrl: string;
  startsTime: string;
  title: string;
};

type VisibleEventsState = {
  events: TribeEventResult[];
  sourceEvents: TribeEventResult[];
};

const CALENDAR_DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CALENDAR_MODE = {
  calendar: "calendar",
  list: "list",
} as const;
const EMPTY_FIELD = {
  value: "",
} as const;
const FORM_DEFAULTS: EventFormState = {
  date: EMPTY_FIELD.value,
  description: EMPTY_FIELD.value,
  endsTime: EMPTY_FIELD.value,
  meetingUrl: EMPTY_FIELD.value,
  startsTime: EMPTY_FIELD.value,
  title: EMPTY_FIELD.value,
};
const CALENDAR = {
  buenosAiresOffset: "-03:00",
  dateInputLength: 10,
  dateSeparator: "-",
  dateTimeSeparator: "T",
  firstCalendarDay: 1,
  firstMonthDayTime: "-01T00:00:00",
  hourCycle: "h23",
  millisecondsPerDay: 86_400_000,
  monthIndexOffset: 1,
  secondsSuffix: ":00",
  titleSeparator: " ",
  timeZone: "America/Argentina/Buenos_Aires",
  weekLength: 7,
} as const;
const DATE_TIME_FORMAT = {
  day: "2-digit",
  fallbackMonth: "01",
  fallbackYear: "2026",
  hour: "2-digit",
  localeMachine: "en-CA",
  localeSpanish: "es-AR",
  minute: "2-digit",
  monthLong: "long",
  monthNumeric: "2-digit",
  monthShort: "short",
  partDay: "day",
  partMonth: "month",
  partYear: "year",
  timeLabelSuffix: "Buenos Aires",
  year: "numeric",
} as const;
const HTTP_REQUEST = {
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  methodDelete: "DELETE",
  methodPatch: "PATCH",
  methodPost: "POST",
} as const;
const EVENT_ENDPOINT = {
  basePrefix: "/api/tribes/",
  eventSeparator: "/",
  eventsPath: "/events",
} as const;
const ROUTE_QUERY = {
  month: "?month=",
} as const;
const LINK_ATTRIBUTE = {
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeIcon: "icon",
  sizeSmall: "sm",
  typeButton: "button",
  typeSubmit: "submit",
  variantDestructive: "destructive",
  variantGhost: "ghost",
  variantSecondary: "secondary",
} as const;
const COPY = {
  actionsColumn: "Acciones",
  cancelButton: "Cancelar",
  calendarTableLabel: "Calendario mensual de eventos",
  createButton: "Crear evento",
  deleteSuccess: "Evento eliminado.",
  deleteButton: "Eliminar",
  descriptionLabel: "Descripción",
  editButton: "Editar",
  endsTimeLabel: "Hora de fin",
  eventColumn: "Evento",
  eventSaveFallback: "Evento guardado.",
  eventSaveFailure: "No pudimos guardar el evento.",
  formDescription: "Completá los datos principales del encuentro digital.",
  formTitle: "Evento",
  linkColumn: "Link",
  linkFallback: "Sin link",
  linkOpen: "Abrir link",
  listTableLabel: "Lista de eventos",
  meetingUrlLabel: "Link de reunión",
  nextMonth: "Mes siguiente",
  previousMonth: "Mes anterior",
  saveButton: "Guardar evento",
  startsTimeLabel: "Hora de inicio",
  deleteFailure: "No pudimos eliminar el evento.",
  dateLabel: "Fecha",
  scheduleColumn: "Horario",
  titleLabel: "Título",
  today: "Hoy",
  viewCalendar: "Ver calendario",
  viewModeLabel: "Vista de eventos",
  viewList: "Ver lista",
} as const;
const FIELD_NAME = {
  date: "date",
  description: "description",
  endsTime: "endsTime",
  meetingUrl: "meetingUrl",
  startsTime: "startsTime",
  title: "title",
} as const;
const INPUT_TYPE = {
  date: "date",
  time: "time",
} as const;
const KEY_PREFIX = {
  week: "week-",
} as const;
const TIME_RANGE_SEPARATOR = " - ";
const CURRENT_MONTH_FORMATTER = new Intl.DateTimeFormat(
  DATE_TIME_FORMAT.localeMachine,
  {
    month: DATE_TIME_FORMAT.monthNumeric,
    timeZone: CALENDAR.timeZone,
    year: DATE_TIME_FORMAT.year,
  }
);
const MONTH_TITLE_FORMATTER = new Intl.DateTimeFormat(
  DATE_TIME_FORMAT.localeSpanish,
  {
    month: DATE_TIME_FORMAT.monthLong,
    timeZone: CALENDAR.timeZone,
    year: DATE_TIME_FORMAT.year,
  }
);
const EVENT_TIME_FORMATTER = new Intl.DateTimeFormat(
  DATE_TIME_FORMAT.localeSpanish,
  {
    hour: DATE_TIME_FORMAT.hour,
    hourCycle: CALENDAR.hourCycle,
    minute: DATE_TIME_FORMAT.minute,
    timeZone: CALENDAR.timeZone,
  }
);
const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat(
  DATE_TIME_FORMAT.localeSpanish,
  {
    day: DATE_TIME_FORMAT.day,
    month: DATE_TIME_FORMAT.monthShort,
    timeZone: CALENDAR.timeZone,
  }
);
const DATE_INPUT_FORMATTER = new Intl.DateTimeFormat(
  DATE_TIME_FORMAT.localeMachine,
  {
    day: DATE_TIME_FORMAT.day,
    month: DATE_TIME_FORMAT.monthNumeric,
    timeZone: CALENDAR.timeZone,
    year: DATE_TIME_FORMAT.year,
  }
);

function buildEventsRoute(tribeSlug: string, month: string): string {
  return `${ROUTES.tribes.events(tribeSlug)}${ROUTE_QUERY.month}${month}`;
}

function getCurrentBuenosAiresMonth(): string {
  const parts = CURRENT_MONTH_FORMATTER.formatToParts(new Date());
  const year =
    parts.find((part) => part.type === DATE_TIME_FORMAT.partYear)?.value ??
    DATE_TIME_FORMAT.fallbackYear;
  const month =
    parts.find((part) => part.type === DATE_TIME_FORMAT.partMonth)?.value ??
    DATE_TIME_FORMAT.fallbackMonth;

  return `${year}${CALENDAR.dateSeparator}${month}`;
}

function formatMonthTitle(month: string): string {
  const date = new Date(
    `${month}${CALENDAR.firstMonthDayTime}${CALENDAR.buenosAiresOffset}`
  );
  const parts = MONTH_TITLE_FORMATTER.formatToParts(date);
  const monthName =
    parts.find((part) => part.type === DATE_TIME_FORMAT.partMonth)?.value ??
    EMPTY_FIELD.value;
  const year =
    parts.find((part) => part.type === DATE_TIME_FORMAT.partYear)?.value ??
    EMPTY_FIELD.value;
  const capitalizedMonthName = monthName.replace(/^\p{Ll}/u, (letter) =>
    letter.toUpperCase()
  );

  return `${capitalizedMonthName}${CALENDAR.titleSeparator}${year}`;
}

function formatEventTime(value: string): string {
  return EVENT_TIME_FORMATTER.format(new Date(value));
}

function formatEventDate(value: string): string {
  return EVENT_DATE_FORMATTER.format(new Date(value));
}

function formatCurrentTimeLabel(): string {
  const time = EVENT_TIME_FORMATTER.format(new Date());

  return `${time}${CALENDAR.titleSeparator}${DATE_TIME_FORMAT.timeLabelSuffix}`;
}

function getBuenosAiresDateInputValue(value: string): string {
  const parts = DATE_INPUT_FORMATTER.formatToParts(new Date(value));
  const year =
    parts.find((part) => part.type === DATE_TIME_FORMAT.partYear)?.value ??
    EMPTY_FIELD.value;
  const month =
    parts.find((part) => part.type === DATE_TIME_FORMAT.partMonth)?.value ??
    EMPTY_FIELD.value;
  const day =
    parts.find((part) => part.type === DATE_TIME_FORMAT.partDay)?.value ??
    EMPTY_FIELD.value;

  return `${year}${CALENDAR.dateSeparator}${month}${CALENDAR.dateSeparator}${day}`;
}

function getBuenosAiresTimeInputValue(value: string | null): string {
  if (!value) {
    return EMPTY_FIELD.value;
  }

  return formatEventTime(value);
}

function createInitialFormState(event?: TribeEventResult): EventFormState {
  if (!event) {
    return FORM_DEFAULTS;
  }

  return {
    date: getBuenosAiresDateInputValue(event.startsAt),
    description: event.description ?? EMPTY_FIELD.value,
    endsTime: getBuenosAiresTimeInputValue(event.endsAt),
    meetingUrl: event.meetingUrl ?? EMPTY_FIELD.value,
    startsTime: getBuenosAiresTimeInputValue(event.startsAt),
    title: event.title,
  };
}

function buildEventDateTime(date: string, time: string): string {
  if (!date || !time) {
    return EMPTY_FIELD.value;
  }

  return new Date(
    `${date}${CALENDAR.dateTimeSeparator}${time}${CALENDAR.secondsSuffix}${CALENDAR.buenosAiresOffset}`
  ).toISOString();
}

function getEventDayKey(value: string): string {
  return getBuenosAiresDateInputValue(value);
}

function createCalendarDays(month: string) {
  const monthStart = new Date(
    `${month}${CALENDAR.firstMonthDayTime}${CALENDAR.buenosAiresOffset}`
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

function groupEventsByDay(events: TribeEventResult[]) {
  return events.reduce<Record<string, TribeEventResult[]>>((groupedEvents, event) => {
    const dayKey = getEventDayKey(event.startsAt);

    return {
      ...groupedEvents,
      [dayKey]: [...(groupedEvents[dayKey] ?? []), event],
    };
  }, {});
}

export function TribeEventsCalendar({
  events,
  month,
  tribeSlug,
  viewerPermissions,
}: TribeEventsCalendarProps) {
  const { refresh } = useRouter();
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(
    CALENDAR_MODE.calendar
  );
  const [visibleEventsState, setVisibleEventsState] = useState<VisibleEventsState>(
    {
      events,
      sourceEvents: events,
    }
  );
  const [editingEvent, setEditingEvent] = useState<TribeEventResult | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [formState, setFormState] = useState<EventFormState>(FORM_DEFAULTS);
  const isSavingEventRef = useRef(false);
  const visibleEvents =
    visibleEventsState.sourceEvents === events ? visibleEventsState.events : events;
  const currentMonth = month.current;
  const calendarDays = useMemo(() => createCalendarDays(currentMonth), [currentMonth]);
  const eventsByDay = useMemo(
    () => groupEventsByDay(visibleEvents),
    [visibleEvents]
  );
  const canManageEvents = viewerPermissions.canManageEvents;

  const openCreateForm = () => {
    setEditingEvent(null);
    setFormState(FORM_DEFAULTS);
    setIsFormOpen(true);
  };

  const openEditForm = (event: TribeEventResult) => {
    setEditingEvent(event);
    setFormState(createInitialFormState(event));
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEvent(null);
    setFormState(FORM_DEFAULTS);
    setIsSavingEvent(false);
    isSavingEventRef.current = false;
  };

  const updateFormField = (field: keyof EventFormState, value: string) => {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  };

  const submitEventForm = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSavingEventRef.current) {
      return;
    }

    isSavingEventRef.current = true;
    setIsSavingEvent(true);

    const payload = {
      description: formState.description,
      endsAt: buildEventDateTime(formState.date, formState.endsTime),
      meetingUrl: formState.meetingUrl,
      startsAt: buildEventDateTime(formState.date, formState.startsTime),
      title: formState.title,
    };
    const endpoint = editingEvent
      ? `${EVENT_ENDPOINT.basePrefix}${tribeSlug}${EVENT_ENDPOINT.eventsPath}${EVENT_ENDPOINT.eventSeparator}${editingEvent.id}`
      : `${EVENT_ENDPOINT.basePrefix}${tribeSlug}${EVENT_ENDPOINT.eventsPath}`;
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType,
        },
        method: editingEvent ? HTTP_REQUEST.methodPatch : HTTP_REQUEST.methodPost,
      });
      const result = (await response.json().catch(() => ({}))) as {
        event?: TribeEventResult;
        message?: string;
      };

      if (!response.ok || !result.event) {
        toast.error(result.message ?? COPY.eventSaveFailure);
        return;
      }

      setVisibleEventsState((currentVisibleEventsState) => {
        const currentEvents =
          currentVisibleEventsState.sourceEvents === events
            ? currentVisibleEventsState.events
            : events;

        if (!editingEvent) {
          return {
            events: [...currentEvents, result.event!].sort(
              (firstEvent, secondEvent) =>
                firstEvent.startsAt.localeCompare(secondEvent.startsAt)
            ),
            sourceEvents: events,
          };
        }

        return {
          events: currentEvents.map((event) =>
            event.id === result.event!.id ? result.event! : event
          ),
          sourceEvents: events,
        };
      });
      toast.success(result.message ?? COPY.eventSaveFallback);
      closeForm();
      refresh();
    } finally {
      isSavingEventRef.current = false;
      setIsSavingEvent(false);
    }
  };

  const deleteEvent = async (event: TribeEventResult) => {
    const response = await fetch(
      `${EVENT_ENDPOINT.basePrefix}${tribeSlug}${EVENT_ENDPOINT.eventsPath}${EVENT_ENDPOINT.eventSeparator}${event.id}`,
      {
        method: HTTP_REQUEST.methodDelete,
      }
    );
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (!response.ok) {
      toast.error(result.message ?? COPY.deleteFailure);
      return;
    }

    setVisibleEventsState((currentVisibleEventsState) => {
      const currentEvents =
        currentVisibleEventsState.sourceEvents === events
          ? currentVisibleEventsState.events
          : events;

      return {
        events: currentEvents.filter((currentEvent) => currentEvent.id !== event.id),
        sourceEvents: events,
      };
    });
    toast.success(result.message ?? COPY.deleteSuccess);
    refresh();
  };

  return (
    <main className={styles.TribeEventsCalendar}>
      <header className={styles.TribeEventsCalendar__header}>
        <Link
          className={styles.TribeEventsCalendar__todayLink}
          href={buildEventsRoute(tribeSlug, getCurrentBuenosAiresMonth())}
        >
          {COPY.today}
        </Link>
        <div className={styles.TribeEventsCalendar__monthNavigation}>
          <Link
            aria-label={COPY.previousMonth}
            className={styles.TribeEventsCalendar__iconLink}
            href={buildEventsRoute(tribeSlug, month.previous)}
          >
            <ChevronLeftIcon aria-hidden />
          </Link>
          <div className={styles.TribeEventsCalendar__monthTitleGroup}>
            <h1 className={styles.TribeEventsCalendar__title}>
              {formatMonthTitle(month.current)}
            </h1>
            <p className={styles.TribeEventsCalendar__timeLabel}>
              {formatCurrentTimeLabel()}
            </p>
          </div>
          <Link
            aria-label={COPY.nextMonth}
            className={styles.TribeEventsCalendar__iconLink}
            href={buildEventsRoute(tribeSlug, month.next)}
          >
            <ChevronRightIcon aria-hidden />
          </Link>
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
              onClick={() => setCalendarMode(CALENDAR_MODE.list)}
            >
              <ListIcon aria-hidden />
              <span className={styles.TribeEventsCalendar__srOnly}>
                {COPY.viewList}
              </span>
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
              onClick={() => setCalendarMode(CALENDAR_MODE.calendar)}
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
      </header>

      {calendarMode === CALENDAR_MODE.calendar ? (
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
              <TableRow key={`${KEY_PREFIX.week}${weekIndex}`}>
                {calendarDays
                  .slice(
                    weekIndex * CALENDAR.weekLength,
                    (weekIndex + 1) * CALENDAR.weekLength
                  )
                  .map((day) => (
                    <TableCell
                      className={styles.TribeEventsCalendar__dayCell}
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
                      </span>
                      <div className={styles.TribeEventsCalendar__dayEvents}>
                        {(eventsByDay[day.dateKey] ?? []).map((event) => (
                          <button
                            className={styles.TribeEventsCalendar__eventPill}
                            key={event.id}
                            type={BUTTON_ATTRIBUTE.typeButton}
                            onClick={() => canManageEvents && openEditForm(event)}
                          >
                            {event.title}
                          </button>
                        ))}
                      </div>
                    </TableCell>
                  ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Table
          aria-label={COPY.listTableLabel}
          className={styles.TribeEventsCalendar__listTable}
        >
          <TableHeader>
            <TableRow>
              <TableHead>{COPY.eventColumn}</TableHead>
              <TableHead>{COPY.dateLabel}</TableHead>
              <TableHead>{COPY.scheduleColumn}</TableHead>
              <TableHead>{COPY.linkColumn}</TableHead>
              {canManageEvents ? <TableHead>{COPY.actionsColumn}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleEvents.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{event.title}</TableCell>
                <TableCell>{formatEventDate(event.startsAt)}</TableCell>
                <TableCell>
                  {formatEventTime(event.startsAt)}
                  {event.endsAt
                    ? `${TIME_RANGE_SEPARATOR}${formatEventTime(event.endsAt)}`
                    : EMPTY_FIELD.value}
                </TableCell>
                <TableCell>
                  {event.meetingUrl ? (
                    <a
                      href={event.meetingUrl}
                      rel={LINK_ATTRIBUTE.noreferrer}
                      target={LINK_ATTRIBUTE.targetBlank}
                    >
                      {COPY.linkOpen}
                    </a>
                  ) : (
                    COPY.linkFallback
                  )}
                </TableCell>
                {canManageEvents ? (
                  <TableCell>
                    <div className={styles.TribeEventsCalendar__rowActions}>
                      <Button
                        size={BUTTON_ATTRIBUTE.sizeSmall}
                        type={BUTTON_ATTRIBUTE.typeButton}
                        variant={BUTTON_ATTRIBUTE.variantSecondary}
                        onClick={() => openEditForm(event)}
                      >
                        {COPY.editButton}
                      </Button>
                      <Button
                        size={BUTTON_ATTRIBUTE.sizeSmall}
                        type={BUTTON_ATTRIBUTE.typeButton}
                        variant={BUTTON_ATTRIBUTE.variantDestructive}
                        onClick={() => {
                          void deleteEvent(event);
                        }}
                      >
                        {COPY.deleteButton}
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className={styles.TribeEventsCalendar__dialog}>
          <DialogHeader>
            <DialogTitle>{COPY.formTitle}</DialogTitle>
            <DialogDescription>{COPY.formDescription}</DialogDescription>
          </DialogHeader>
          <form
            className={styles.TribeEventsCalendar__form}
            onSubmit={(submitEvent) => {
              void submitEventForm(submitEvent);
            }}
          >
            <label className={styles.TribeEventsCalendar__field}>
              <span>{COPY.titleLabel}</span>
              <Input
                value={formState.title}
                onChange={(event) =>
                  updateFormField(FIELD_NAME.title, event.currentTarget.value)
                }
              />
            </label>
            <label className={styles.TribeEventsCalendar__field}>
              <span>{COPY.dateLabel}</span>
              <Input
                type={INPUT_TYPE.date}
                value={formState.date}
                onChange={(event) =>
                  updateFormField(FIELD_NAME.date, event.currentTarget.value)
                }
              />
            </label>
            <div className={styles.TribeEventsCalendar__timeFields}>
              <label className={styles.TribeEventsCalendar__field}>
                <span>{COPY.startsTimeLabel}</span>
                <Input
                  type={INPUT_TYPE.time}
                  value={formState.startsTime}
                  onChange={(event) =>
                    updateFormField(FIELD_NAME.startsTime, event.currentTarget.value)
                  }
                />
              </label>
              <label className={styles.TribeEventsCalendar__field}>
                <span>{COPY.endsTimeLabel}</span>
                <Input
                  type={INPUT_TYPE.time}
                  value={formState.endsTime}
                  onChange={(event) =>
                    updateFormField(FIELD_NAME.endsTime, event.currentTarget.value)
                  }
                />
              </label>
            </div>
            <label className={styles.TribeEventsCalendar__field}>
              <span>{COPY.meetingUrlLabel}</span>
              <Input
                value={formState.meetingUrl}
                onChange={(event) =>
                  updateFormField(FIELD_NAME.meetingUrl, event.currentTarget.value)
                }
              />
            </label>
            <label className={styles.TribeEventsCalendar__field}>
              <span>{COPY.descriptionLabel}</span>
              <textarea
                className={styles.TribeEventsCalendar__textarea}
                value={formState.description}
                onChange={(event) =>
                  updateFormField(FIELD_NAME.description, event.currentTarget.value)
                }
              />
            </label>
            <div className={styles.TribeEventsCalendar__formActions}>
              <Button
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantGhost}
                onClick={closeForm}
              >
                {COPY.cancelButton}
              </Button>
              <Button disabled={isSavingEvent} type={BUTTON_ATTRIBUTE.typeSubmit}>
                {COPY.saveButton}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
