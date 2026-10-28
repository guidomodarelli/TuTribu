"use client";

import { useState } from "react";
import { CalendarPlusIcon, CopyIcon, ShieldAlertIcon } from "lucide-react";
import { Button, Dialog, DialogContent, Input, PresenceSwap, buttonClassName } from "@golfo/ui";

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
  variantSecondary: "secondary",
} as const;
/** Calendar apps open external subscription URLs, so they stay `<a>` elements with the button look. */
const CALENDAR_APP_LINK_CLASS_NAME = buttonClassName({ variant: BUTTON_ATTRIBUTE.variantSecondary });
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

type CalendarFeedSubscription = Extract<
  TribeEventCalendarFeedLoadState,
  { subscription: unknown }
>["subscription"];

type CalendarFeedIssuedLinkProps = {
  issuedFeedUrl: string;
  onCopyLink: () => void;
};

/** Link issued in this session with "Copiar" and the calendar app shortcuts. */
function CalendarFeedIssuedLink({ issuedFeedUrl, onCopyLink }: CalendarFeedIssuedLinkProps) {
  return (
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
        <a className={CALENDAR_APP_LINK_CLASS_NAME} href={buildAppleCalendarSubscriptionUrl(issuedFeedUrl)}>
            <CalendarPlusIcon aria-hidden />
            {COPY.appleCalendar}
          </a>
        <a className={CALENDAR_APP_LINK_CLASS_NAME}
            href={buildGoogleCalendarSubscriptionUrl(issuedFeedUrl)}
            rel={LINK_ATTRIBUTE.noreferrer}
            target={LINK_ATTRIBUTE.targetBlank}
          >
            <CalendarPlusIcon aria-hidden />
            {COPY.googleCalendar}
          </a>
      </div>
      <p className={styles.TribeEventCalendarFeedDialog__hint}>{COPY.outlookHint}</p>
    </section>
  );
}

/** Whether the viewer has an active subscription, when it was created and last used. */
function CalendarFeedSubscriptionStatus({ subscription }: { subscription: CalendarFeedSubscription }) {
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
}

type CalendarFeedRegenerateConfirmProps = {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Inline confirmation that replaces "Regenerar link", since the old link stops working. */
function CalendarFeedRegenerateConfirm({
  isSubmitting,
  onCancel,
  onConfirm,
}: CalendarFeedRegenerateConfirmProps) {
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
          onClick={onCancel}
        >
          {COPY.cancelRegenerate}
        </Button>
        <Button disabled={isSubmitting} type={BUTTON_ATTRIBUTE.typeButton} onClick={onConfirm}>
          {isSubmitting ? COPY.workingLabel : COPY.confirmRegenerate}
        </Button>
      </div>
    </div>
  );
}

type CalendarFeedActionsProps = {
  isSubmitting: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  /** Focus "Regenerar link" when it comes back after a cancelled confirmation. */
  shouldRefocusRegenerate: boolean;
  subscription: CalendarFeedSubscription;
};

/** "Generar link" without a subscription; "Desactivar" and "Regenerar" with one. */
function CalendarFeedActions({
  isSubmitting,
  onGenerate,
  onRegenerate,
  onRevoke,
  shouldRefocusRegenerate,
  subscription,
}: CalendarFeedActionsProps) {
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
            variant={BUTTON_ATTRIBUTE.variantSecondary}
            onClick={onRegenerate}
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
}

type CalendarFeedBodyProps = Pick<
  TribeEventCalendarFeedDialogProps,
  "feedUrl" | "isSubmitting" | "loadState" | "onCopyLink" | "onGenerate" | "onRetry" | "onRevoke"
> & {
  isConfirmingRegenerate: boolean;
  onCancelRegenerate: () => void;
  onConfirmRegenerate: () => void;
  onStartRegenerate: () => void;
  shouldRefocusRegenerate: boolean;
};

/** Content under the warning for the current load state. */
function CalendarFeedBody({
  feedUrl,
  isConfirmingRegenerate,
  isSubmitting,
  loadState,
  onCancelRegenerate,
  onConfirmRegenerate,
  onCopyLink,
  onGenerate,
  onRetry,
  onRevoke,
  onStartRegenerate,
  shouldRefocusRegenerate,
}: CalendarFeedBodyProps) {
  switch (loadState.status) {
    case TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.error:
      return (
        <div className={styles.TribeEventCalendarFeedDialog__status} role="alert">
          <p className={styles.TribeEventCalendarFeedDialog__text}>{loadState.message}</p>
          <Button
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantSecondary}
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
            {feedUrl ? (
              <CalendarFeedIssuedLink issuedFeedUrl={feedUrl} onCopyLink={onCopyLink} />
            ) : (
              <CalendarFeedSubscriptionStatus subscription={loadState.subscription} />
            )}
          </PresenceSwap>
          <PresenceSwap
            presenceKey={isConfirmingRegenerate ? PRESENCE_KEY.confirm : PRESENCE_KEY.actions}
          >
            {isConfirmingRegenerate ? (
              <CalendarFeedRegenerateConfirm
                isSubmitting={isSubmitting}
                onCancel={onCancelRegenerate}
                onConfirm={onConfirmRegenerate}
              />
            ) : (
              <CalendarFeedActions
                isSubmitting={isSubmitting}
                shouldRefocusRegenerate={shouldRefocusRegenerate}
                subscription={loadState.subscription}
                onGenerate={onGenerate}
                onRegenerate={onStartRegenerate}
                onRevoke={onRevoke}
              />
            )}
          </PresenceSwap>
        </>
      );
    case TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.idle:
    case TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loading:
      return (
        <p aria-live="polite" className={styles.TribeEventCalendarFeedDialog__status}>
          {COPY.loading}
        </p>
      );
  }
}

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
      <DialogContent
        className={styles.TribeEventCalendarFeedDialog}
        title={COPY.title}
        description={COPY.description}
      >
        <p className={styles.TribeEventCalendarFeedDialog__warning}>
          <ShieldAlertIcon aria-hidden className={styles.TribeEventCalendarFeedDialog__warningIcon} />
          <span>{COPY.personalWarning}</span>
        </p>
        <PresenceSwap
          className={styles.TribeEventCalendarFeedDialog__body}
          presenceKey={loadState.status}
        >
          <CalendarFeedBody
            feedUrl={feedUrl}
            isConfirmingRegenerate={isConfirmingRegenerate}
            isSubmitting={isSubmitting}
            loadState={loadState}
            shouldRefocusRegenerate={shouldRefocusRegenerate}
            onCancelRegenerate={cancelRegenerate}
            onConfirmRegenerate={() => {
              setIsConfirmingRegenerate(false);
              onGenerate();
            }}
            onCopyLink={onCopyLink}
            onGenerate={onGenerate}
            onRetry={onRetry}
            onRevoke={onRevoke}
            onStartRegenerate={() => setIsConfirmingRegenerate(true)}
          />
        </PresenceSwap>
      </DialogContent>
    </Dialog>
  );
}
