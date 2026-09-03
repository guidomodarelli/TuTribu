"use client";

import { CalendarPlusIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildGoogleCalendarEventUrl } from "@/lib/calendar/google-calendar-link";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresShortDate,
  formatBuenosAiresTimeRange,
} from "@/lib/date-time/buenos-aires-format";
import { ROUTES } from "@/src/constants/routes";
import type {
  TribeEventAttendanceStatus,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_ATTENDANCE_LABEL,
  TRIBE_EVENT_RECURRENCE_LABEL,
} from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventDetailDialogProps = {
  canManageEvents: boolean;
  isPast: boolean;
  isSavingAttendance: boolean;
  occurrence: TribeEventOccurrenceResult | null;
  onClose: () => void;
  onDelete: (occurrence: TribeEventOccurrenceResult) => void;
  onEdit: (occurrence: TribeEventOccurrenceResult) => void;
  onSetAttendance: (
    occurrence: TribeEventOccurrenceResult,
    status: TribeEventAttendanceStatus | null
  ) => void;
  tribeSlug: string;
};

const EVENT_ENDPOINT = {
  calendarPath: "/calendar",
  eventsPath: "/events",
  separator: "/",
} as const;
const LINK_ATTRIBUTE = {
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantDestructive: "destructive",
  variantOutline: "outline",
  variantSecondary: "secondary",
} as const;
const ATTENDANCE_OPTIONS = [
  TRIBE_EVENT_ATTENDANCE_STATUS.going,
  TRIBE_EVENT_ATTENDANCE_STATUS.notGoing,
] as const;
const COPY = {
  attendanceLegend: "¿Vas a participar?",
  attendanceNone: "Todavía nadie confirmó asistencia.",
  attendancePlural: " personas van",
  attendanceSingular: " persona va",
  deleteButton: "Eliminar",
  descriptionHeading: "Descripción",
  downloadIcs: "Descargar .ics",
  editButton: "Editar",
  googleCalendar: "Agregar a Google Calendar",
  linkOpen: "Abrir link de reunión",
  pastNotice: "Este evento ya finalizó.",
  recurrenceUntilPrefix: " hasta el ",
  scheduleSeparator: " · ",
} as const;

function buildCalendarDownloadUrl(tribeSlug: string, eventId: string): string {
  return (
    ROUTES.api.tribes +
    EVENT_ENDPOINT.separator +
    tribeSlug +
    EVENT_ENDPOINT.eventsPath +
    EVENT_ENDPOINT.separator +
    eventId +
    EVENT_ENDPOINT.calendarPath
  );
}

function formatAttendanceCount(goingCount: number): string {
  if (goingCount === 0) {
    return COPY.attendanceNone;
  }

  return (
    String(goingCount) +
    (goingCount === 1 ? COPY.attendanceSingular : COPY.attendancePlural)
  );
}

function formatRecurrence(occurrence: TribeEventOccurrenceResult): string | null {
  if (occurrence.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return null;
  }

  const label = TRIBE_EVENT_RECURRENCE_LABEL[occurrence.recurrenceFrequency];

  return occurrence.recurrenceUntil
    ? label + COPY.recurrenceUntilPrefix + formatBuenosAiresShortDate(occurrence.recurrenceUntil)
    : label;
}

/**
 * Read-only view of one occurrence: schedule, description, meeting link,
 * attendance answer, calendar exports, and the manager actions.
 */
export function TribeEventDetailDialog({
  canManageEvents,
  isPast,
  isSavingAttendance,
  occurrence,
  onClose,
  onDelete,
  onEdit,
  onSetAttendance,
  tribeSlug,
}: TribeEventDetailDialogProps) {
  const recurrenceText = occurrence ? formatRecurrence(occurrence) : null;
  const googleCalendarUrl = occurrence
    ? buildGoogleCalendarEventUrl({
        defaultDurationMinutes: TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
        description: occurrence.description,
        endsAt: occurrence.endsAt,
        location: occurrence.meetingUrl,
        recurrenceRule: occurrence.recurrenceRule,
        startsAt: occurrence.startsAt,
        title: occurrence.title,
      })
    : null;

  return (
    <Dialog
      open={occurrence !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className={styles.TribeEventDetailDialog}>
        {occurrence ? (
          <>
            <DialogHeader>
              <DialogTitle>{occurrence.title}</DialogTitle>
              <DialogDescription>
                {formatBuenosAiresLongDate(occurrence.startsAt)}
                {COPY.scheduleSeparator}
                {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
                {recurrenceText ? COPY.scheduleSeparator + recurrenceText : null}
              </DialogDescription>
            </DialogHeader>

            {isPast ? (
              <p className={styles.TribeEventDetailDialog__notice}>{COPY.pastNotice}</p>
            ) : null}

            <dl className={styles.TribeEventDetailDialog__facts}>
              {occurrence.description ? (
                <div className={styles.TribeEventDetailDialog__fact}>
                  <dt>{COPY.descriptionHeading}</dt>
                  <dd className={styles.TribeEventDetailDialog__description}>
                    {occurrence.description}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className={styles.TribeEventDetailDialog__links}>
              {occurrence.meetingUrl ? (
                <Button asChild className={styles.TribeEventDetailDialog__primaryLink}>
                  <a
                    href={occurrence.meetingUrl}
                    rel={LINK_ATTRIBUTE.noreferrer}
                    target={LINK_ATTRIBUTE.targetBlank}
                  >
                    <ExternalLinkIcon aria-hidden />
                    {COPY.linkOpen}
                  </a>
                </Button>
              ) : null}
              {googleCalendarUrl ? (
                <Button
                  asChild
                  size={BUTTON_ATTRIBUTE.sizeSmall}
                  variant={BUTTON_ATTRIBUTE.variantOutline}
                >
                  <a
                    href={googleCalendarUrl}
                    rel={LINK_ATTRIBUTE.noreferrer}
                    target={LINK_ATTRIBUTE.targetBlank}
                  >
                    <CalendarPlusIcon aria-hidden />
                    {COPY.googleCalendar}
                  </a>
                </Button>
              ) : null}
              <Button
                asChild
                size={BUTTON_ATTRIBUTE.sizeSmall}
                variant={BUTTON_ATTRIBUTE.variantOutline}
              >
                <a href={buildCalendarDownloadUrl(tribeSlug, occurrence.eventId)}>
                  <DownloadIcon aria-hidden />
                  {COPY.downloadIcs}
                </a>
              </Button>
            </div>

            <section
              aria-label={COPY.attendanceLegend}
              className={styles.TribeEventDetailDialog__attendance}
            >
              <p className={styles.TribeEventDetailDialog__attendanceCount}>
                {formatAttendanceCount(occurrence.attendance.goingCount)}
              </p>
              {isPast ? null : (
                <div className={styles.TribeEventDetailDialog__attendanceActions}>
                  <span className={styles.TribeEventDetailDialog__attendanceLegend}>
                    {COPY.attendanceLegend}
                  </span>
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
                          isSelected
                            ? BUTTON_ATTRIBUTE.variantSecondary
                            : BUTTON_ATTRIBUTE.variantOutline
                        }
                        onClick={() =>
                          onSetAttendance(occurrence, isSelected ? null : status)
                        }
                      >
                        {TRIBE_EVENT_ATTENDANCE_LABEL[status]}
                      </Button>
                    );
                  })}
                </div>
              )}
            </section>

            {canManageEvents ? (
              <DialogFooter className={styles.TribeEventDetailDialog__actions}>
                <Button
                  type={BUTTON_ATTRIBUTE.typeButton}
                  variant={BUTTON_ATTRIBUTE.variantSecondary}
                  onClick={() => onEdit(occurrence)}
                >
                  {COPY.editButton}
                </Button>
                <Button
                  type={BUTTON_ATTRIBUTE.typeButton}
                  variant={BUTTON_ATTRIBUTE.variantDestructive}
                  onClick={() => onDelete(occurrence)}
                >
                  {COPY.deleteButton}
                </Button>
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
