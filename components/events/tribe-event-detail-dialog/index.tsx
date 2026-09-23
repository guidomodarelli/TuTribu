"use client";

import type { ReactNode } from "react";
import { CalendarPlusIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, LinkIcon } from "lucide-react";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "beez-ui";

import { TribeEventAttendanceOptions } from "@/components/events/tribe-event-attendance-options";
import { TribeEventAttendanceSummary } from "@/components/events/tribe-event-attendance-summary";
import { buildTribeEventGoogleCalendarUrl } from "@/lib/events/tribe-event-calendar-links";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresShortDate,
  formatBuenosAiresTimeRange,
} from "@/lib/date-time/buenos-aires-format";
import { formatViewerLocalTimeLabel } from "@/lib/date-time/viewer-local-time-format";
import { ROUTES } from "@/src/constants/routes";
import type {
  TribeEventAttendanceOption,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_RECURRENCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import { TRIBE_EVENT_RECURRENCE_FREQUENCY } from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventDetailDialogProps = {
  /**
   * Manager-only "Asistentes" tab content, rendered by the container (which
   * owns the report request). When null the dialog shows no tabs.
   */
  attendeesPanel?: ReactNode;
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
    status: TribeEventAttendanceOption | null
  ) => void;
  /** Called when the manager opens (true) or leaves (false) "Asistentes". */
  onToggleAttendees?: (isOpen: boolean) => void;
  tribeSlug: string;
  /** Browser time zone, null before hydration. */
  viewerTimeZone: string | null;
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
/**
 * Tabs of the manager view of the dialog.
 */
const DETAIL_TAB = {
  attendees: "attendees",
  detail: "detail",
} as const;
const COPY = {
  attendanceHeading: "Asistencia",
  attendanceLegend: "¿Vas a participar?",
  attendeesTab: "Asistentes",
  deleteButton: "Eliminar",
  descriptionHeading: "Descripción",
  detailTab: "Detalle",
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
  attendeesPanel = null,
  canManageEvents,
  isPast,
  isSavingAttendance,
  occurrence,
  onClose,
  onCopyLink,
  onDelete,
  onEdit,
  onSetAttendance,
  onToggleAttendees,
  tribeSlug,
  viewerTimeZone,
}: TribeEventDetailDialogProps) {
  const localTimeLabel = occurrence
    ? formatViewerLocalTimeLabel(occurrence.startsAt, occurrence.endsAt, viewerTimeZone)
    : null;
  const recurrenceText = occurrence ? formatRecurrence(occurrence) : null;
  const googleCalendarUrl = occurrence ? buildTribeEventGoogleCalendarUrl(occurrence) : null;

  const detailContent = occurrence ? (
    <>
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
        <TribeEventAttendanceSummary isPast={isPast} occurrence={occurrence} />
        {isPast ? null : (
          <div className={styles.TribeEventDetailDialog__attendanceActions}>
            <span className={styles.TribeEventDetailDialog__attendanceLegend}>
              {COPY.attendanceLegend}
            </span>
            <TribeEventAttendanceOptions
              isSaving={isSavingAttendance}
              legend={COPY.attendanceLegend}
              viewerStatus={occurrence.attendance.viewerStatus}
              onSelect={(status) => onSetAttendance(occurrence, status)}
            />
          </div>
        )}
      </section>
    </>
  ) : null;

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
              {localTimeLabel ? (
                <p className={styles.TribeEventDetailDialog__localTime}>{localTimeLabel}</p>
              ) : null}
            </DialogHeader>

            {attendeesPanel ? (
              <Tabs
                className={styles.TribeEventDetailDialog__tabs}
                defaultValue={DETAIL_TAB.detail}
                key={occurrence.occurrenceKey}
                onValueChange={(value) => onToggleAttendees?.(value === DETAIL_TAB.attendees)}
              >
                <TabsList>
                  <TabsTrigger value={DETAIL_TAB.detail}>{COPY.detailTab}</TabsTrigger>
                  <TabsTrigger value={DETAIL_TAB.attendees}>{COPY.attendeesTab}</TabsTrigger>
                </TabsList>
                <TabsContent
                  className={styles.TribeEventDetailDialog__tabPanel}
                  value={DETAIL_TAB.detail}
                >
                  {detailContent}
                </TabsContent>
                <TabsContent value={DETAIL_TAB.attendees}>{attendeesPanel}</TabsContent>
              </Tabs>
            ) : (
              detailContent
            )}

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
