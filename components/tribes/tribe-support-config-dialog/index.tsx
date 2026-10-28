"use client";

import { useId, useRef, useState } from "react";
import { toast, Button, Dialog, DialogContent, Input, Select, type SelectOption, Textarea } from "@golfo/ui";

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
  secondaryVariant: "secondary",
} as const;

const SUPPORT_DIALOG_MESSAGE_MAX_LENGTH = 1000;

const SUPPORT_CHANNEL_OPTIONS: SelectOption[] = [
  { label: SUPPORT_DIALOG_COPY.whatsappOption, value: TRIBE_SUPPORT_CHANNEL.whatsapp },
];

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

/**
 * Saves the support settings of a tribe.
 * @param tribeSlug - Tribe slug.
 * @param settings - Normalized settings to save.
 * @returns Whether the request succeeded and its parsed body, or `null` when
 * the body is not JSON.
 */
async function requestSupportSettingsSave(
  tribeSlug: string,
  settings: SupportSettingsPayload
): Promise<{ ok: boolean; payload: SupportFetchResponse | null }> {
  const response = await fetch(
    SUPPORT_DIALOG_REQUEST.apiPrefix +
      encodeURIComponent(tribeSlug) +
      SUPPORT_DIALOG_REQUEST.supportSegment,
    {
      body: JSON.stringify(settings),
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

  return { ok: response.ok, payload };
}

/**
 * Owns the support settings draft: it resets to the saved settings each time
 * the dialog opens and saves them once at a time.
 * @param options - Dialog props that seed and receive the draft.
 * @returns Draft fields, their setters, the saving state and the submit handler.
 */
function useSupportSettingsForm({
  initialSettings,
  onOpenChange,
  onSaved,
  open,
  tribeSlug,
}: TribeSupportConfigDialogProps) {
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

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
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
      const { ok, payload } = await requestSupportSettingsSave(tribeSlug, {
        channel,
        message: trimmedMessage.length > 0 ? trimmedMessage : null,
        phoneNumber: trimmedPhoneNumber,
      });

      if (!ok || !payload?.settings) {
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

  return {
    channel,
    errorMessage,
    handleSubmit,
    isSaving,
    message,
    phoneNumber,
    setChannel,
    setErrorMessage,
    setMessage,
    setPhoneNumber,
  };
}

type SupportDialogFooterProps = {
  formId: string;
  isSaving: boolean;
  onCancel: () => void;
};

/**
 * Cancel and save actions of the support dialog.
 * @param props - Form to submit, saving state and cancel handler.
 * @returns The dialog footer actions.
 */
function SupportDialogFooter({ formId, isSaving, onCancel }: SupportDialogFooterProps) {
  return (
    <>
      <Button
        disabled={isSaving}
        onClick={onCancel}
        type={SUPPORT_DIALOG_BUTTON.cancelType}
        variant={SUPPORT_DIALOG_BUTTON.secondaryVariant}
      >
        {SUPPORT_DIALOG_COPY.cancelLabel}
      </Button>
      <Button
        aria-busy={isSaving || undefined}
        disabled={isSaving}
        form={formId}
        type={SUPPORT_DIALOG_FORM.submitType}
      >
        {isSaving
          ? SUPPORT_DIALOG_COPY.savingLabel
          : SUPPORT_DIALOG_COPY.saveLabel}
      </Button>
    </>
  );
}

type SupportSettingsFieldsProps = {
  channel: TribeSupportChannel;
  errorMessage: string | null;
  message: string;
  onChannelChange: (channel: TribeSupportChannel) => void;
  onMessageChange: (message: string) => void;
  onPhoneNumberChange: (phoneNumber: string) => void;
  phoneNumber: string;
};

/**
 * Channel, phone number and optional message fields of the support settings.
 * @param props - Draft values, the save error and their change handlers.
 * @returns The form fields.
 */
function SupportSettingsFields({
  channel,
  errorMessage,
  message,
  onChannelChange,
  onMessageChange,
  onPhoneNumberChange,
  phoneNumber,
}: SupportSettingsFieldsProps) {
  const channelInputId = useId();
  const phoneInputId = useId();
  const messageInputId = useId();

  return (
    <>
      <Select
        id={channelInputId}
        label={SUPPORT_DIALOG_COPY.channelLabel}
        options={SUPPORT_CHANNEL_OPTIONS}
        placeholder={SUPPORT_DIALOG_COPY.channelPlaceholder}
        value={channel}
        onValueChange={(nextValue) =>
          onChannelChange(nextValue as TribeSupportChannel)
        }
      />

      <Input
        autoComplete={SUPPORT_DIALOG_FORM.phoneAutoComplete}
        description={errorMessage ? undefined : SUPPORT_DIALOG_COPY.phoneHelp}
        error={errorMessage ?? undefined}
        id={phoneInputId}
        label={SUPPORT_DIALOG_COPY.phoneLabel}
        onChange={(event) => {
          onPhoneNumberChange(event.currentTarget.value);
        }}
        placeholder={SUPPORT_DIALOG_COPY.phonePlaceholder}
        required
        type={SUPPORT_DIALOG_FORM.inputType}
        value={phoneNumber}
      />

      <Textarea
        description={SUPPORT_DIALOG_COPY.messageHelp}
        id={messageInputId}
        label={SUPPORT_DIALOG_COPY.messageLabel}
        maxLength={SUPPORT_DIALOG_MESSAGE_MAX_LENGTH}
        onChange={(event) => onMessageChange(event.currentTarget.value)}
        placeholder={SUPPORT_DIALOG_COPY.messagePlaceholder}
        value={message}
      />
    </>
  );
}

export function TribeSupportConfigDialog({
  initialSettings,
  onOpenChange,
  onSaved,
  open,
  tribeSlug,
}: TribeSupportConfigDialogProps) {
  const formId = useId();
  const {
    channel,
    errorMessage,
    handleSubmit,
    isSaving,
    message,
    phoneNumber,
    setChannel,
    setErrorMessage,
    setMessage,
    setPhoneNumber,
  } = useSupportSettingsForm({
    initialSettings,
    onOpenChange,
    onSaved,
    open,
    tribeSlug,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    // Keep the dialog open while saving so the result is never lost.
    if (!nextOpen && isSaving) {
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={styles.TribeSupportConfigDialog}
        title={SUPPORT_DIALOG_COPY.title}
        description={SUPPORT_DIALOG_COPY.description}
        footer={
          <SupportDialogFooter
            formId={formId}
            isSaving={isSaving}
            onCancel={() => handleOpenChange(false)}
          />
        }
      >
        <form
          id={formId}
          className={styles.TribeSupportConfigDialog__form}
          onSubmit={handleSubmit}
        >
          <SupportSettingsFields
            channel={channel}
            errorMessage={errorMessage}
            message={message}
            onChannelChange={setChannel}
            onMessageChange={setMessage}
            onPhoneNumberChange={(nextPhoneNumber) => {
              setPhoneNumber(nextPhoneNumber);
              setErrorMessage(null);
            }}
            phoneNumber={phoneNumber}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
