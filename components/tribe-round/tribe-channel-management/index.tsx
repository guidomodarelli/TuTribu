"use client";

import { FormEvent, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ChannelEmojiPicker } from "@/components/tribe-round/channel-emoji-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TribeChannelResult } from "@/src/modules/messages/application/results/tribe-round-result";
import { TRIBE_CHANNEL_NAME } from "@/src/modules/messages/constants/message-round";
import styles from "./styles.module.scss";

const CHANNEL_MANAGEMENT_COPY = {
  actionsLabelPrefix: "Acciones de",
  configuredSectionDescription:
    "Editá el ícono o el nombre y guardá cada canal. Al eliminar uno con mensajes, vas a elegir a qué canal moverlos.",
  configuredSectionTitle: "Canales configurados",
  createButton: "Crear canal",
  createSectionDescription:
    "Elegí un ícono y un nombre. El canal nuevo aparece al final de la lista de la ronda.",
  createSectionTitle: "Nuevo canal",
  deleteButton: "Eliminar",
  deleteCancelButton: "Cancelar",
  deleteConfirmButton: "Eliminar canal",
  deleteDialogDescription:
    "Si el canal tiene mensajes, elegí a qué canal moverlos antes de eliminarlo. Esta acción no se puede deshacer.",
  deleteDialogTitle: (channelName: string) => `¿Eliminar el canal ${channelName}?`,
  deleteNoTargetHint:
    "Es el único canal: no hay otro al que mover sus mensajes.",
  emojiLabel: "Ícono",
  emptyState: "Todavía no hay canales configurados.",
  emptyStateHint: "Creá el primero con el formulario de arriba.",
  fallbackCreateError: "No pudimos crear el canal.",
  fallbackDeleteError: "No pudimos eliminar el canal.",
  fallbackSaveError: "No pudimos guardar el canal.",
  fallbackUpdateError: "No pudimos actualizar el canal.",
  nameLabel: "Nombre",
  nameLimitDescription: `Máximo ${TRIBE_CHANNEL_NAME.maxLength} caracteres.`,
  namePlaceholder: "Nombre del canal",
  nameTooLongError: `Usá ${TRIBE_CHANNEL_NAME.maxLength} caracteres o menos.`,
  saveButton: "Guardar",
  sectionDescription:
    "Organizá la ronda en canales. Si un canal tiene mensajes, se moverán antes de eliminarlo.",
  sectionTitle: "Canales",
  selectTargetPlaceholder: "Seleccionar destino",
  targetLabel: "Mover mensajes a",
  targetOptional: "Opcional si el canal no tiene mensajes.",
  unsavedChanges: "Cambios sin guardar",
} as const;

const CHANNEL_MANAGEMENT_ROUTE = {
  apiTribes: "/api/tribes/",
  channelsSegment: "/channels",
  segmentSeparator: "/",
} as const;

const CHANNEL_MANAGEMENT_ENDPOINT = {
  channels: (tribeSlug: string) =>
    CHANNEL_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    CHANNEL_MANAGEMENT_ROUTE.channelsSegment,
  channel: (tribeSlug: string, channelId: string) =>
    CHANNEL_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    CHANNEL_MANAGEMENT_ROUTE.channelsSegment +
    CHANNEL_MANAGEMENT_ROUTE.segmentSeparator +
    channelId,
} as const;

const CHANNEL_MANAGEMENT_FORM = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  destructiveVariant: "destructive",
  ghostVariant: "ghost",
  groupRole: "group",
  iconSize: "icon",
  jsonContentType: "application/json",
  messageMethod: "POST",
  outlineVariant: "outline",
  patchMethod: "PATCH",
  submitType: "submit",
} as const;

const CHANNEL_MANAGEMENT_FIELD_ID = {
  createNameHelp: "create-channel-name-help",
  createNameInput: "create-channel-name",
  deleteTargetSelect: "delete-channel-target",
  editNameHelpPrefix: "edit-channel-name-help-",
  editNameInputPrefix: "edit-channel-name-",
} as const;

const CHANNEL_OPTION_LABEL_SEPARATOR = " ";

type TribeChannelManagementProps = {
  channels: TribeChannelResult[];
  tribeSlug: string;
};

type ChannelResponse = {
  channel?: TribeChannelResult;
  message?: string;
};

async function submitChannelRequest(
  url: string,
  method: string,
  body?: Record<string, string | number>
): Promise<ChannelResponse> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      [CHANNEL_MANAGEMENT_FORM.contentTypeHeader]:
        CHANNEL_MANAGEMENT_FORM.jsonContentType,
    },
    method,
  });
  const responseBody = (await response.json().catch(() => ({}))) as ChannelResponse;

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? CHANNEL_MANAGEMENT_COPY.fallbackSaveError
    );
  }

  return responseBody;
}

function isValidChannelName(channelName: string): boolean {
  const normalizedChannelName = channelName.trim();

  return (
    normalizedChannelName.length >= TRIBE_CHANNEL_NAME.minLength &&
    normalizedChannelName.length <= TRIBE_CHANNEL_NAME.maxLength
  );
}

function buildChannelOptionLabel(channel: TribeChannelResult): string {
  return channel.emoji + CHANNEL_OPTION_LABEL_SEPARATOR + channel.name;
}

function hasUnsavedChanges(
  channel: TribeChannelResult,
  savedChannel: TribeChannelResult | undefined
): boolean {
  if (!savedChannel) {
    return true;
  }

  return (
    channel.name !== savedChannel.name || channel.emoji !== savedChannel.emoji
  );
}

/**
 * Leader and guardian page to organise the round into channels: create a
 * channel with an icon and a name, rename or re-icon existing channels one
 * row at a time, and delete a channel after choosing where its messages go.
 */
export function TribeChannelManagement({
  channels,
  tribeSlug,
}: TribeChannelManagementProps) {
  const [channelItems, setChannelItems] = useState(channels);
  const [savedChannels, setSavedChannels] = useState(channels);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deleteTargetChannelId, setDeleteTargetChannelId] = useState("");
  const isCreateNameValid = isValidChannelName(name);
  const deleteCandidate =
    channelItems.find((channel) => channel.id === deleteCandidateId) ?? null;
  const deleteTargetOptions = channelItems.filter(
    (channel) => channel.id !== deleteCandidateId
  );
  const isDeleteInProgress =
    deleteCandidateId !== null && pendingChannelId === deleteCandidateId;

  const replaceChannel = (updatedChannel: TribeChannelResult) => {
    setChannelItems((currentItems) =>
      currentItems.map((currentChannel) =>
        currentChannel.id === updatedChannel.id ? updatedChannel : currentChannel
      )
    );
    setSavedChannels((currentItems) =>
      currentItems.map((currentChannel) =>
        currentChannel.id === updatedChannel.id ? updatedChannel : currentChannel
      )
    );
  };

  const handleCreateChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingChannelId(CHANNEL_MANAGEMENT_COPY.createButton);

    try {
      const response = await submitChannelRequest(
        CHANNEL_MANAGEMENT_ENDPOINT.channels(tribeSlug),
        CHANNEL_MANAGEMENT_FORM.messageMethod,
        {
          emoji,
          name,
        }
      );

      if (response.channel) {
        const createdChannel = response.channel;

        setChannelItems((currentItems) => [...currentItems, createdChannel]);
        setSavedChannels((currentItems) => [...currentItems, createdChannel]);
      }

      setEmoji("");
      setName("");
      toast.success(response.message ?? CHANNEL_MANAGEMENT_COPY.createButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : CHANNEL_MANAGEMENT_COPY.fallbackCreateError
      );
    } finally {
      setPendingChannelId(null);
    }
  };

  const handleUpdateChannel = async (channel: TribeChannelResult) => {
    setPendingChannelId(channel.id);

    try {
      const response = await submitChannelRequest(
        CHANNEL_MANAGEMENT_ENDPOINT.channel(tribeSlug, channel.id),
        CHANNEL_MANAGEMENT_FORM.patchMethod,
        {
          emoji: channel.emoji,
          name: channel.name,
          sortOrder: channel.sortOrder,
        }
      );

      replaceChannel(response.channel ?? channel);
      toast.success(response.message ?? CHANNEL_MANAGEMENT_COPY.saveButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : CHANNEL_MANAGEMENT_COPY.fallbackUpdateError
      );
    } finally {
      setPendingChannelId(null);
    }
  };

  const handleDeleteChannel = async (channel: TribeChannelResult) => {
    setPendingChannelId(channel.id);

    try {
      const response = await submitChannelRequest(
        CHANNEL_MANAGEMENT_ENDPOINT.channel(tribeSlug, channel.id),
        CHANNEL_MANAGEMENT_FORM.deleteMethod,
        deleteTargetChannelId ? { targetChannelId: deleteTargetChannelId } : undefined
      );

      setChannelItems((currentItems) =>
        currentItems.filter((currentChannel) => currentChannel.id !== channel.id)
      );
      setSavedChannels((currentItems) =>
        currentItems.filter((currentChannel) => currentChannel.id !== channel.id)
      );
      setDeleteCandidateId(null);
      setDeleteTargetChannelId("");
      toast.success(response.message ?? CHANNEL_MANAGEMENT_COPY.deleteButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : CHANNEL_MANAGEMENT_COPY.fallbackDeleteError
      );
    } finally {
      setPendingChannelId(null);
    }
  };

  const handleDeleteDialogChange = (open: boolean) => {
    if (open || isDeleteInProgress) {
      return;
    }

    setDeleteCandidateId(null);
    setDeleteTargetChannelId("");
  };

  const updateChannelDraft = (
    channelId: string,
    patch: Partial<Pick<TribeChannelResult, "emoji" | "name">>
  ) => {
    setChannelItems((currentItems) =>
      currentItems.map((currentChannel) =>
        currentChannel.id === channelId
          ? { ...currentChannel, ...patch }
          : currentChannel
      )
    );
  };

  return (
    <section className={styles.TribeChannelManagement}>
      <header className={styles.TribeChannelManagement__header}>
        <h1 className={styles.TribeChannelManagement__title}>
          {CHANNEL_MANAGEMENT_COPY.sectionTitle}
        </h1>
        <p className={styles.TribeChannelManagement__description}>
          {CHANNEL_MANAGEMENT_COPY.sectionDescription}
        </p>
      </header>

      <section className={styles.TribeChannelManagement__section}>
        <div className={styles.TribeChannelManagement__sectionIntro}>
          <h2 className={styles.TribeChannelManagement__sectionTitle}>
            {CHANNEL_MANAGEMENT_COPY.createSectionTitle}
          </h2>
          <p className={styles.TribeChannelManagement__sectionDescription}>
            {CHANNEL_MANAGEMENT_COPY.createSectionDescription}
          </p>
        </div>
        <form
          className={styles.TribeChannelManagement__createForm}
          onSubmit={handleCreateChannel}
        >
          <ChannelEmojiPicker
            isLabelVisuallyHidden
            label={CHANNEL_MANAGEMENT_COPY.emojiLabel}
            onChange={setEmoji}
            value={emoji}
          />
          <div className={styles.TribeChannelManagement__nameField}>
            <Input
              aria-describedby={CHANNEL_MANAGEMENT_FIELD_ID.createNameHelp}
              aria-label={CHANNEL_MANAGEMENT_COPY.nameLabel}
              className={styles.TribeChannelManagement__textInput}
              id={CHANNEL_MANAGEMENT_FIELD_ID.createNameInput}
              maxLength={TRIBE_CHANNEL_NAME.maxLength}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              placeholder={CHANNEL_MANAGEMENT_COPY.namePlaceholder}
              value={name}
            />
            <p
              className={styles.TribeChannelManagement__fieldHelp}
              id={CHANNEL_MANAGEMENT_FIELD_ID.createNameHelp}
            >
              {name.length > TRIBE_CHANNEL_NAME.maxLength
                ? CHANNEL_MANAGEMENT_COPY.nameTooLongError
                : CHANNEL_MANAGEMENT_COPY.nameLimitDescription}
            </p>
          </div>
          <Button
            className={styles.TribeChannelManagement__createButton}
            disabled={Boolean(pendingChannelId) || !isCreateNameValid || !emoji.trim()}
            type={CHANNEL_MANAGEMENT_FORM.submitType}
          >
            <PlusIcon />
            {CHANNEL_MANAGEMENT_COPY.createButton}
          </Button>
        </form>
      </section>

      <section className={styles.TribeChannelManagement__section}>
        <div className={styles.TribeChannelManagement__sectionIntro}>
          <div className={styles.TribeChannelManagement__sectionTitleRow}>
            <h2 className={styles.TribeChannelManagement__sectionTitle}>
              {CHANNEL_MANAGEMENT_COPY.configuredSectionTitle}
            </h2>
            <span className={styles.TribeChannelManagement__count}>
              {channelItems.length}
            </span>
          </div>
          <p className={styles.TribeChannelManagement__sectionDescription}>
            {CHANNEL_MANAGEMENT_COPY.configuredSectionDescription}
          </p>
        </div>
        <div className={styles.TribeChannelManagement__sectionFields}>
          {channelItems.length === 0 ? (
            <div className={styles.TribeChannelManagement__empty}>
              <p className={styles.TribeChannelManagement__emptyTitle}>
                {CHANNEL_MANAGEMENT_COPY.emptyState}
              </p>
              <p className={styles.TribeChannelManagement__emptyHint}>
                {CHANNEL_MANAGEMENT_COPY.emptyStateHint}
              </p>
            </div>
          ) : (
            <ol
              aria-label={CHANNEL_MANAGEMENT_COPY.configuredSectionTitle}
              className={styles.TribeChannelManagement__list}
            >
              {channelItems.map((channel) => {
                const savedChannel = savedChannels.find(
                  (currentChannel) => currentChannel.id === channel.id
                );
                const isPending = pendingChannelId === channel.id;
                const isDirty = hasUnsavedChanges(channel, savedChannel);
                const isNameTooLong =
                  channel.name.length > TRIBE_CHANNEL_NAME.maxLength;
                const nameHelpId = `${CHANNEL_MANAGEMENT_FIELD_ID.editNameHelpPrefix}${channel.id}`;

                return (
                  <li className={styles.TribeChannelManagement__item} key={channel.id}>
                    <div className={styles.TribeChannelManagement__itemFields}>
                      <ChannelEmojiPicker
                        disabled={isPending}
                        isLabelVisuallyHidden
                        label={CHANNEL_MANAGEMENT_COPY.emojiLabel}
                        onChange={(nextEmoji) => {
                          updateChannelDraft(channel.id, { emoji: nextEmoji });
                        }}
                        value={channel.emoji}
                      />
                      <div className={styles.TribeChannelManagement__nameField}>
                        <Input
                          aria-describedby={isNameTooLong ? nameHelpId : undefined}
                          aria-invalid={isNameTooLong}
                          aria-label={CHANNEL_MANAGEMENT_COPY.nameLabel}
                          className={styles.TribeChannelManagement__textInput}
                          disabled={isPending}
                          id={`${CHANNEL_MANAGEMENT_FIELD_ID.editNameInputPrefix}${channel.id}`}
                          maxLength={TRIBE_CHANNEL_NAME.maxLength}
                          onChange={(event) => {
                            updateChannelDraft(channel.id, {
                              name: event.currentTarget.value,
                            });
                          }}
                          value={channel.name}
                        />
                        {isNameTooLong ? (
                          <p
                            className={styles.TribeChannelManagement__fieldError}
                            id={nameHelpId}
                          >
                            {CHANNEL_MANAGEMENT_COPY.nameTooLongError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div
                      aria-label={`${CHANNEL_MANAGEMENT_COPY.actionsLabelPrefix} ${channel.name}`}
                      className={styles.TribeChannelManagement__actions}
                      role={CHANNEL_MANAGEMENT_FORM.groupRole}
                    >
                      {isDirty ? (
                        <span className={styles.TribeChannelManagement__unsaved}>
                          {CHANNEL_MANAGEMENT_COPY.unsavedChanges}
                        </span>
                      ) : null}
                      <Button
                        className={styles.TribeChannelManagement__saveButton}
                        disabled={
                          isPending || !isDirty || !isValidChannelName(channel.name)
                        }
                        onClick={() => {
                          void handleUpdateChannel(channel);
                        }}
                        type={CHANNEL_MANAGEMENT_FORM.buttonType}
                        variant={CHANNEL_MANAGEMENT_FORM.outlineVariant}
                      >
                        {CHANNEL_MANAGEMENT_COPY.saveButton}
                      </Button>
                      <Button
                        aria-label={CHANNEL_MANAGEMENT_COPY.deleteButton}
                        className={styles.TribeChannelManagement__deleteButton}
                        disabled={isPending}
                        onClick={() => {
                          setDeleteTargetChannelId("");
                          setDeleteCandidateId(channel.id);
                        }}
                        size={CHANNEL_MANAGEMENT_FORM.iconSize}
                        title={CHANNEL_MANAGEMENT_COPY.deleteButton}
                        type={CHANNEL_MANAGEMENT_FORM.buttonType}
                        variant={CHANNEL_MANAGEMENT_FORM.ghostVariant}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <Dialog
        open={deleteCandidate !== null}
        onOpenChange={handleDeleteDialogChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {CHANNEL_MANAGEMENT_COPY.deleteDialogTitle(deleteCandidate?.name ?? "")}
            </DialogTitle>
            <DialogDescription>
              {CHANNEL_MANAGEMENT_COPY.deleteDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className={styles.TribeChannelManagement__dialogBody}>
            {deleteTargetOptions.length > 0 ? (
              <div className={styles.TribeChannelManagement__field}>
                <label
                  className={styles.TribeChannelManagement__fieldLabel}
                  htmlFor={CHANNEL_MANAGEMENT_FIELD_ID.deleteTargetSelect}
                >
                  {CHANNEL_MANAGEMENT_COPY.targetLabel}
                </label>
                <Select
                  onValueChange={setDeleteTargetChannelId}
                  value={deleteTargetChannelId}
                >
                  <SelectTrigger
                    className={styles.TribeChannelManagement__selectTrigger}
                    disabled={isDeleteInProgress}
                    id={CHANNEL_MANAGEMENT_FIELD_ID.deleteTargetSelect}
                  >
                    <SelectValue
                      placeholder={CHANNEL_MANAGEMENT_COPY.selectTargetPlaceholder}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {deleteTargetOptions.map((targetChannel) => (
                      <SelectItem key={targetChannel.id} value={targetChannel.id}>
                        {buildChannelOptionLabel(targetChannel)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={styles.TribeChannelManagement__fieldHelp}>
                  {CHANNEL_MANAGEMENT_COPY.targetOptional}
                </p>
              </div>
            ) : (
              <p className={styles.TribeChannelManagement__fieldHelp}>
                {CHANNEL_MANAGEMENT_COPY.deleteNoTargetHint}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={isDeleteInProgress}
              onClick={() => {
                handleDeleteDialogChange(false);
              }}
              type={CHANNEL_MANAGEMENT_FORM.buttonType}
              variant={CHANNEL_MANAGEMENT_FORM.outlineVariant}
            >
              {CHANNEL_MANAGEMENT_COPY.deleteCancelButton}
            </Button>
            <Button
              disabled={isDeleteInProgress}
              onClick={() => {
                if (deleteCandidate) {
                  void handleDeleteChannel(deleteCandidate);
                }
              }}
              type={CHANNEL_MANAGEMENT_FORM.buttonType}
              variant={CHANNEL_MANAGEMENT_FORM.destructiveVariant}
            >
              <Trash2Icon />
              {CHANNEL_MANAGEMENT_COPY.deleteConfirmButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
