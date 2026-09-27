"use client";

import { useState } from "react";
import { CalendarPlusIcon, CopyIcon, ShieldAlertIcon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, PresenceSwap } from "beez-ui";

import {
  TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS,
  type TribeEventCalendarFeedLoadState,
} from "@/hooks/use-tribe-event-calendar-feed";
import {
  buildAppleCalendarSubscriptionUrl,
  buildGoogleCalendarSubscriptionUrl,
} from "@/lib/calendar/calendar-subscription-links";
import { formatBuenosAiresLongDate } from "@/lib/date-time/buenos-aires-format";
import styles from "./styles.module.scss";

type TribeEventCalendarFeedDialogProps = {
  /** Link issued in this session (shown once); null otherwise. */
  feedUrl: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  loadState: TribeEventCalendarFeedLoadState;
  onClose: () => void;
  onCopyLink: () => void;
  onGenerate: () => void;
  onRetry: () => void;
  onRevoke: () => void;
};

const FEED_URL_FIELD_ID = "tribe-event-calendar-feed-url";
/** Presence keys of the dialog regions that swap content in place. */
const PRESENCE_KEY = {
  actions: "actions",
  confirm: "confirm",
  issued: "issued",
  status: "status",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantGhost: "ghost",
  variantOutline: "outline",
} as const;
const LINK_ATTRIBUTE = {
  noreferrer: "noopener noreferrer",
  targetBlank: "_blank",
} as const;
const COPY = {
  activeSince: (date: string) => `Tenés una suscripción activa. Creada: ${date}.`,
  appleCalendar: "Abrir en Apple Calendar",
  cancelRegenerate: "Cancelar",
  confirmRegenerate: "Sí, regenerar",
  copyButton: "Copiar",
  description:
    "Sumá los eventos de la tribu a tu calendario. Se actualizan solos cuando se crean, cambian o cancelan; cada app los revisa con su propia frecuencia (de una hora a un día).",
  feedUrlLabel: "Tu link de calendario",
  generateButton: "Generar link",
  googleCalendar: "Agregar a Google Calendar",
  lastUsed: (date: string) => `Última consulta de tu calendario: ${date}.`,
  loading: "Cargando tu suscripción…",
  neverUsed: "Tu calendario todavía no lo consultó.",
  noSubscription: "Todavía no tenés un link de calendario para esta tribu.",
  outlookHint:
    "En Outlook: Agregar calendario → Suscribirse desde la web, y pegá el link.",
  personalWarning:
    "El link es personal: no lo compartas. Cualquiera que lo tenga puede ver los eventos de la tribu sin iniciar sesión.",
  regenerateButton: "Regenerar link",
  regenerateWarning:
    "El link anterior va a dejar de funcionar y vas a tener que agregar el nuevo en tu calendario. ¿Querés generar uno nuevo?",
  retry: "Reintentar",
  revokeButton: "Desactivar suscripción",
  shownOnce: "Copialo ahora: por seguridad no lo vamos a volver a mostrar.",
  lostLinkHint: "Si perdiste el link, regeneralo: el anterior deja de funcionar.",
  title: "Suscribirme al calendario",
  workingLabel: "Procesando…",
} as const;

/**
 * Presentational dialog of the personal calendar subscription (webcal feed).
 * It explains what the link is, generates or regenerates it (with an inline
 * confirmation, since the old link stops working), shows it once with
 * "Copiar" and the Apple/Google shortcuts, and turns it off. State and
 * requests belong to `useTribeEventCalendarFeed`; only the confirmation step
 * is local UI state. Loading, status, the issued link and the confirmation
 * cross-fade in place, and focus follows the confirmation step.
 */
export function TribeEventCalendarFeedDialog({
  feedUrl,
  isOpen,
  isSubmitting,
  loadState,
  onClose,
  onCopyLink,
  onGenerate,
  onRetry,
  onRevoke,
}: TribeEventCalendarFeedDialogProps) {
  const [isConfirmingRegenerate, setIsConfirmingRegenerate] = useState(false);
  // The confirmation replaces "Regenerar link"; after "Cancelar" the button
  // comes back (once the swap finishes) and takes the focus again.
  const [shouldRefocusRegenerate, setShouldRefocusRegenerate] = useState(false);

  const cancelRegenerate = () => {
    setIsConfirmingRegenerate(false);
    setShouldRefocusRegenerate(true);
  };
  const subscription =
    loadState.status === TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loaded
      ? loadState.subscription
      : null;

  const renderIssuedLink = (issuedFeedUrl: string) => (
    <section className={styles.TribeEventCalendarFeedDialog__issued}>
      <label className={styles.TribeEventCalendarFeedDialog__label} htmlFor={FEED_URL_FIELD_ID}>
        {COPY.feedUrlLabel}
      </label>
      <div className={styles.TribeEventCalendarFeedDialog__copyRow}>
        <Input
          className={styles.TribeEventCalendarFeedDialog__urlField}
          id={FEED_URL_FIELD_ID}
          readOnly
          value={issuedFeedUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type={BUTTON_ATTRIBUTE.typeButton} onClick={onCopyLink}>
          <CopyIcon aria-hidden />
          {COPY.copyButton}
        </Button>
      </div>
      <p className={styles.TribeEventCalendarFeedDialog__hint}>{COPY.shownOnce}</p>
      <div className={styles.TribeEventCalendarFeedDialog__apps}>
        <Button asChild variant={BUTTON_ATTRIBUTE.variantOutline}>
          <a href={buildAppleCalendarSubscriptionUrl(issuedFeedUrl)}>
            <CalendarPlusIcon aria-hidden />
            {COPY.appleCalendar}
          </a>
        </Button>
        <Button asChild variant={BUTTON_ATTRIBUTE.variantOutline}>
          <a
            href={buildGoogleCalendarSubscriptionUrl(issuedFeedUrl)}
            rel={LINK_ATTRIBUTE.noreferrer}
            target={LINK_ATTRIBUTE.targetBlank}
          >
            <CalendarPlusIcon aria-hidden />
            {COPY.googleCalendar}
          </a>
        </Button>
      </div>
      <p className={styles.TribeEventCalendarFeedDialog__hint}>{COPY.outlookHint}</p>
    </section>
  );

  const renderSubscriptionStatus = () => {
    if (!subscription) {
      return <p className={styles.TribeEventCalendarFeedDialog__status}>{COPY.noSubscription}</p>;
    }

    return (
      <div className={styles.TribeEventCalendarFeedDialog__status}>
        <p className={styles.TribeEventCalendarFeedDialog__text}>
          {COPY.activeSince(formatBuenosAiresLongDate(subscription.createdAt))}
        </p>
        <p className={styles.TribeEventCalendarFeedDialog__hint}>
          {subscription.lastUsedAt
            ? COPY.lastUsed(formatBuenosAiresLongDate(subscription.lastUsedAt))
            : COPY.neverUsed}
        </p>
        <p className={styles.TribeEventCalendarFeedDialog__hint}>{COPY.lostLinkHint}</p>
      </div>
    );
  };

  const renderActions = () => {
    if (isConfirmingRegenerate) {
      return (
        <div
          aria-label={COPY.regenerateButton}
          className={styles.TribeEventCalendarFeedDialog__confirm}
          role="group"
        >
          <p className={styles.TribeEventCalendarFeedDialog__text}>{COPY.regenerateWarning}</p>
          <div className={styles.TribeEventCalendarFeedDialog__actions}>
            <Button
              // "Regenerar link" was replaced by this step: the safe answer
              // takes the focus so keyboard users are not dropped on the page.
              autoFocus
              disabled={isSubmitting}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={cancelRegenerate}
            >
              {COPY.cancelRegenerate}
            </Button>
            <Button
              disabled={isSubmitting}
              type={BUTTON_ATTRIBUTE.typeButton}
              onClick={() => {
                setIsConfirmingRegenerate(false);
                onGenerate();
              }}
            >
              {isSubmitting ? COPY.workingLabel : COPY.confirmRegenerate}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.TribeEventCalendarFeedDialog__actions}>
        {subscription ? (
          <>
            <Button
              disabled={isSubmitting}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={onRevoke}
            >
              {COPY.revokeButton}
            </Button>
            <Button
              autoFocus={shouldRefocusRegenerate}
              disabled={isSubmitting}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={() => setIsConfirmingRegenerate(true)}
            >
              {COPY.regenerateButton}
            </Button>
          </>
        ) : (
          <Button disabled={isSubmitting} type={BUTTON_ATTRIBUTE.typeButton} onClick={onGenerate}>
            {isSubmitting ? COPY.workingLabel : COPY.generateButton}
          </Button>
        )}
      </div>
    );
  };

  const renderBody = () => {
    switch (loadState.status) {
      case TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.error:
        return (
          <div className={styles.TribeEventCalendarFeedDialog__status} role="alert">
            <p className={styles.TribeEventCalendarFeedDialog__text}>{loadState.message}</p>
            <Button
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={onRetry}
            >
              {COPY.retry}
            </Button>
          </div>
        );
      case TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loaded:
        return (
          <>
            <PresenceSwap presenceKey={feedUrl ? PRESENCE_KEY.issued : PRESENCE_KEY.status}>
              {feedUrl ? renderIssuedLink(feedUrl) : renderSubscriptionStatus()}
            </PresenceSwap>
            <PresenceSwap
              presenceKey={isConfirmingRegenerate ? PRESENCE_KEY.confirm : PRESENCE_KEY.actions}
            >
              {renderActions()}
            </PresenceSwap>
          </>
        );
      default:
        return (
          <p aria-live="polite" className={styles.TribeEventCalendarFeedDialog__status}>
            {COPY.loading}
          </p>
        );
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsConfirmingRegenerate(false);
          setShouldRefocusRegenerate(false);
          onClose();
        }
      }}
    >
      <DialogContent className={styles.TribeEventCalendarFeedDialog}>
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        <p className={styles.TribeEventCalendarFeedDialog__warning}>
          <ShieldAlertIcon aria-hidden className={styles.TribeEventCalendarFeedDialog__warningIcon} />
          <span>{COPY.personalWarning}</span>
        </p>
        <PresenceSwap
          className={styles.TribeEventCalendarFeedDialog__body}
          presenceKey={loadState.status}
        >
          {renderBody()}
        </PresenceSwap>
      </DialogContent>
    </Dialog>
  );
}
