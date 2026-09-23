"use client";

import { CalendarPlusIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, LinkIcon } from "lucide-react";

import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "beez-ui";


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
  onCopyLink: (occurrence: TribeEventOccurrenceResult) => void;
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
const BADGE_VARIANT = {
  secondary: "secondary",
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
  attendanceHeading: "Asistencia",
  attendanceLegend: "¿Vas a participar?",
  attendanceNone: "Todavía nadie confirmó asistencia.",
  attendancePastNone: "Nadie confirmó asistencia.",
  attendancePastPlural: " personas fueron",
  attendancePastSingular: " persona fue",
  attendancePlural: " personas van",
  attendanceSingular: " persona va",
  deleteButton: "Eliminar",
  descriptionHeading: "Descripción",
  downloadIcs: "Descargar .ics",
  copyLink: "Copiar link",
  editButton: "Editar",
  googleCalendar: "Agregar a Google Calendar",
  linkOpen: "Abrir link de reunión",
  meetingLinkMissing: "Sin link de reunión",
  pastBadge: "Finalizado",
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

function formatAttendanceCount(goingCount: number, isPast: boolean): string {
  if (goingCount === 0) {
    return isPast ? COPY.attendancePastNone : COPY.attendanceNone;
  }

  if (isPast) {
    return (
      String(goingCount) +
      (goingCount === 1 ? COPY.attendancePastSingular : COPY.attendancePastPlural)
    );
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
  onCopyLink,
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
              <div className={styles.TribeEventDetailDialog__titleRow}>
                <DialogTitle className={styles.TribeEventDetailDialog__title}>
                  {occurrence.title}
                </DialogTitle>
                {isPast ? (
                  <Badge variant={BADGE_VARIANT.secondary}>{COPY.pastBadge}</Badge>
                ) : null}
              </div>
              <DialogDescription>
                {formatBuenosAiresLongDate(occurrence.startsAt)}
                {COPY.scheduleSeparator}
                {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
                {recurrenceText ? COPY.scheduleSeparator + recurrenceText : null}
              </DialogDescription>
            </DialogHeader>

            {occurrence.description ? (
              <dl className={styles.TribeEventDetailDialog__facts}>
                <div className={styles.TribeEventDetailDialog__fact}>
                  <dt>{COPY.descriptionHeading}</dt>
                  <dd className={styles.TribeEventDetailDialog__description}>
                    {occurrence.description}
                  </dd>
                </div>
              </dl>
            ) : null}

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
              ) : (
                <p className={styles.TribeEventDetailDialog__missingLink}>
                  <LinkIcon aria-hidden />
                  {COPY.meetingLinkMissing}
                </p>
              )}
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
              <Button
                size={BUTTON_ATTRIBUTE.sizeSmall}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantOutline}
                onClick={() => onCopyLink(occurrence)}
              >
                <CopyIcon aria-hidden />
                {COPY.copyLink}
              </Button>
            </div>

            <section
              aria-label={COPY.attendanceHeading}
              className={styles.TribeEventDetailDialog__attendance}
            >
              <p className={styles.TribeEventDetailDialog__attendanceHeading}>
                {COPY.attendanceHeading}
              </p>
              <p className={styles.TribeEventDetailDialog__attendanceCount}>
                {formatAttendanceCount(occurrence.attendance.goingCount, isPast)}
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
