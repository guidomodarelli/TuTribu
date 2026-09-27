"use client";

import { useId, useRef, useState } from "react";
import { toast, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, PresenceSwap } from "beez-ui";

import { TRIBE_SUPPORT_CHANNEL } from "@/src/modules/tribes/constants/tribe-support";
import type {
  TribeSupportChannel,
  TribeSupportSettings,
} from "@/src/modules/tribes/domain/repositories/tribe-support-repository";
import styles from "./styles.module.scss";

const SUPPORT_DIALOG_COPY = {
  cancelLabel: "Cancelar",
  channelLabel: "Canal",
  channelPlaceholder: "Elegí un canal",
  description:
    "Configurá el canal por el que los miembros de la tribu te van a contactar.",
  fallbackError:
    "No pudimos guardar el botón de soporte. Probá de nuevo en unos minutos.",
  messageHelp: "Opcional. Se va a abrir precargado en WhatsApp.",
  messageLabel: "Mensaje personalizado",
  messagePlaceholder:
    "Hola, vengo desde la tribu y quería consultarte por…",
  phoneHelp: "Usá formato internacional (ej.: +54 9 11 1234 5678).",
  phoneLabel: "Número de WhatsApp",
  phonePlaceholder: "+54 9 11 1234 5678",
  saveLabel: "Guardar",
  savingLabel: "Guardando…",
  successMessage: "Botón de soporte actualizado.",
  title: "Configurar botón de soporte",
  whatsappOption: "WhatsApp",
} as const;

const SUPPORT_DIALOG_REQUEST = {
  apiPrefix: "/api/tribes/",
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  putMethod: "PUT",
  supportSegment: "/support",
} as const;

const SUPPORT_DIALOG_FORM = {
  inputType: "tel",
  phoneAutoComplete: "tel",
  submitType: "submit",
} as const;

const SUPPORT_DIALOG_BUTTON = {
  cancelType: "button",
  outlineVariant: "outline",
} as const;

/** Presence keys for the helper text that swaps with the save error under the phone input. */
const PHONE_FEEDBACK_KEY = {
  error: "error",
  help: "help",
} as const;

const SUPPORT_DIALOG_MESSAGE_MAX_LENGTH = 1000;

type SupportSettingsPayload = {
  channel: TribeSupportChannel;
  message: string | null;
  phoneNumber: string;
};

type SupportFetchResponse = {
  message?: string;
  settings?: SupportSettingsPayload | null;
};

type TribeSupportConfigDialogProps = {
  initialSettings: TribeSupportSettings | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (settings: TribeSupportSettings) => void;
  open: boolean;
  tribeSlug: string;
};

function getInitialChannel(
  initialSettings: TribeSupportSettings | null
): TribeSupportChannel {
  return initialSettings?.channel ?? TRIBE_SUPPORT_CHANNEL.whatsapp;
}

export function TribeSupportConfigDialog({
  initialSettings,
  onOpenChange,
  onSaved,
  open,
  tribeSlug,
}: TribeSupportConfigDialogProps) {
  const channelInputId = useId();
  const phoneInputId = useId();
  const messageInputId = useId();
  const phoneErrorId = useId();
  const phoneHelpId = useId();
  const messageHelpId = useId();
  // Synchronous guard: two quick submits can run before `isSaving` re-renders.
  const isSubmittingRef = useRef(false);
  const [channel, setChannel] = useState<TribeSupportChannel>(() =>
    getInitialChannel(initialSettings)
  );
  const [phoneNumber, setPhoneNumber] = useState(
    initialSettings?.phoneNumber ?? ""
  );
  const [message, setMessage] = useState(initialSettings?.message ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastOpenedSnapshot, setLastOpenedSnapshot] = useState<{
    open: boolean;
    settings: TribeSupportSettings | null;
  }>({ open, settings: initialSettings });

  if (
    open !== lastOpenedSnapshot.open ||
    initialSettings !== lastOpenedSnapshot.settings
  ) {
    setLastOpenedSnapshot({ open, settings: initialSettings });

    if (open) {
      setChannel(getInitialChannel(initialSettings));
      setPhoneNumber(initialSettings?.phoneNumber ?? "");
      setMessage(initialSettings?.message ?? "");
      setErrorMessage(null);
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;

    const trimmedPhoneNumber = phoneNumber.trim();
    const trimmedMessage = message.trim();

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        SUPPORT_DIALOG_REQUEST.apiPrefix +
          encodeURIComponent(tribeSlug) +
          SUPPORT_DIALOG_REQUEST.supportSegment,
        {
          body: JSON.stringify({
            channel,
            message: trimmedMessage.length > 0 ? trimmedMessage : null,
            phoneNumber: trimmedPhoneNumber,
          }),
          headers: {
            [SUPPORT_DIALOG_REQUEST.contentTypeHeader]:
              SUPPORT_DIALOG_REQUEST.jsonContentType,
          },
          method: SUPPORT_DIALOG_REQUEST.putMethod,
        }
      );
      const payload = (await response
        .json()
        .catch(() => null)) as SupportFetchResponse | null;

      if (!response.ok || !payload?.settings) {
        setErrorMessage(
          payload?.message ?? SUPPORT_DIALOG_COPY.fallbackError
        );
        return;
      }

      onSaved(payload.settings);
      toast.success(payload.message ?? SUPPORT_DIALOG_COPY.successMessage);
      onOpenChange(false);
    } catch {
      setErrorMessage(SUPPORT_DIALOG_COPY.fallbackError);
    } finally {
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    // Keep the dialog open while saving so the result is never lost.
    if (!nextOpen && isSaving) {
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={styles.TribeSupportConfigDialog}>
        <DialogHeader>
          <DialogTitle>{SUPPORT_DIALOG_COPY.title}</DialogTitle>
          <DialogDescription>
            {SUPPORT_DIALOG_COPY.description}
          </DialogDescription>
        </DialogHeader>

        <form
          className={styles.TribeSupportConfigDialog__form}
          onSubmit={handleSubmit}
        >
          <div className={styles.TribeSupportConfigDialog__field}>
            <label
              className={styles.TribeSupportConfigDialog__label}
              htmlFor={channelInputId}
            >
              {SUPPORT_DIALOG_COPY.channelLabel}
            </label>
            <Select
              value={channel}
              onValueChange={(nextValue) =>
                setChannel(nextValue as TribeSupportChannel)
              }
            >
              <SelectTrigger
                id={channelInputId}
                className={styles.TribeSupportConfigDialog__selectTrigger}
              >
                <SelectValue
                  placeholder={SUPPORT_DIALOG_COPY.channelPlaceholder}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TRIBE_SUPPORT_CHANNEL.whatsapp}>
                  {SUPPORT_DIALOG_COPY.whatsappOption}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={styles.TribeSupportConfigDialog__field}>
            <label
              className={styles.TribeSupportConfigDialog__label}
              htmlFor={phoneInputId}
            >
              {SUPPORT_DIALOG_COPY.phoneLabel}
            </label>
            <Input
              aria-describedby={errorMessage ? phoneErrorId : phoneHelpId}
              aria-invalid={errorMessage ? true : undefined}
              autoComplete={SUPPORT_DIALOG_FORM.phoneAutoComplete}
              id={phoneInputId}
              onChange={(event) => {
                setPhoneNumber(event.currentTarget.value);
                setErrorMessage(null);
              }}
              placeholder={SUPPORT_DIALOG_COPY.phonePlaceholder}
              required
              type={SUPPORT_DIALOG_FORM.inputType}
              value={phoneNumber}
            />
            <PresenceSwap
              presenceKey={
                errorMessage ? PHONE_FEEDBACK_KEY.error : PHONE_FEEDBACK_KEY.help
              }
            >
              {errorMessage ? (
                <p
                  className={styles.TribeSupportConfigDialog__error}
                  id={phoneErrorId}
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : (
                <p
                  className={styles.TribeSupportConfigDialog__help}
                  id={phoneHelpId}
                >
                  {SUPPORT_DIALOG_COPY.phoneHelp}
                </p>
              )}
            </PresenceSwap>
          </div>

          <div className={styles.TribeSupportConfigDialog__field}>
            <label
              className={styles.TribeSupportConfigDialog__label}
              htmlFor={messageInputId}
            >
              {SUPPORT_DIALOG_COPY.messageLabel}
            </label>
            <Textarea
              aria-describedby={messageHelpId}
              id={messageInputId}
              maxLength={SUPPORT_DIALOG_MESSAGE_MAX_LENGTH}
              onChange={(event) => setMessage(event.currentTarget.value)}
              placeholder={SUPPORT_DIALOG_COPY.messagePlaceholder}
              value={message}
            />
            <p
              className={styles.TribeSupportConfigDialog__help}
              id={messageHelpId}
            >
              {SUPPORT_DIALOG_COPY.messageHelp}
            </p>
          </div>

          <DialogFooter>
            <Button
              disabled={isSaving}
              onClick={() => handleOpenChange(false)}
              type={SUPPORT_DIALOG_BUTTON.cancelType}
              variant={SUPPORT_DIALOG_BUTTON.outlineVariant}
            >
              {SUPPORT_DIALOG_COPY.cancelLabel}
            </Button>
            <Button
              aria-busy={isSaving || undefined}
              disabled={isSaving}
              type={SUPPORT_DIALOG_FORM.submitType}
            >
              {isSaving
                ? SUPPORT_DIALOG_COPY.savingLabel
                : SUPPORT_DIALOG_COPY.saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
