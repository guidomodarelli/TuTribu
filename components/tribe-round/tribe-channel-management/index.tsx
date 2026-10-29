"use client";

import { type RefObject, type SubmitEvent, useRef, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { toast, Button, Dialog, DialogContent, Input, Select, AnimatedCount, AnimatedListItem, PresenceSwap } from "@golfo/ui";

import { ChannelEmojiPicker } from "@/components/tribe-round/channel-emoji-picker";
import type { TribeChannelResult } from "@/src/modules/messages/application/results/tribe-round-result";
import { TRIBE_CHANNEL_NAME } from "@/src/modules/messages/constants/message-round";
import styles from "./styles.module.scss";

const CHANNEL_MANAGEMENT_COPY = {
  actionsLabelPrefix: "Acciones de",
  configuredSectionDescription:
    "Editá el ícono o el nombre y guardá cada canal. Al eliminar uno con mensajes, vas a elegir a qué canal moverlos.",
  configuredSectionTitle: "Canales configurados",
  createButton: "Crear canal",
  createSuccess: "Canal creado.",
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
  deleteSuccess: "Canal eliminado.",
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
  saveSuccess: "Canal actualizado.",
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
  dangerVariant: "danger",
  ghostVariant: "ghost",
  groupRole: "group",
  iconSize: "sm",
  jsonContentType: "application/json",
  messageMethod: "POST",
  secondaryVariant: "secondary",
  patchMethod: "PATCH",
  submitType: "submit",
} as const;

const CHANNEL_MANAGEMENT_FIELD_ID = {
  createNameInput: "create-channel-name",
  deleteTargetSelect: "delete-channel-target",
  editNameInputPrefix: "edit-channel-name-",
} as const;

const CHANNEL_OPTION_LABEL_SEPARATOR = " ";

/** Presence keys for the per-row save status line. */
const CHANNEL_ROW_STATUS_KEY = {
  saved: "saved",
  unsaved: "unsaved",
} as const;

/** Heading focus target, focusable from script only. */
const PROGRAMMATIC_FOCUS_TAB_INDEX = -1;

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
 * Adds or removes a channel id from an immutable set of in-flight requests.
 *
 * @param currentIds - Channel ids with a request in flight.
 * @param channelId - Channel whose request starts or ends.
 * @param isPending - Whether the request starts (`true`) or ends (`false`).
 * @returns A new set with the change applied.
 */
function toggleChannelPending(
  currentIds: ReadonlySet<string>,
  channelId: string,
  isPending: boolean
): ReadonlySet<string> {
  const nextIds = new Set(currentIds);

  if (isPending) {
    nextIds.add(channelId);
  } else {
    nextIds.delete(channelId);
  }

  return nextIds;
}

/**
 * Reports a failed channel request with its message, or the fallback copy.
 *
 * @param error - Error thrown by the channel request.
 * @param fallbackMessage - Copy shown when the error carries no message.
 */
function toastChannelRequestError(error: unknown, fallbackMessage: string) {
  toast.error(error instanceof Error ? error.message : fallbackMessage);
}

/**
 * Replaces the channel with the same id.
 *
 * @param channels - Current channels.
 * @param updatedChannel - Channel that replaces its previous version.
 * @returns A new list with the channel replaced.
 */
function replaceChannelById(
  channels: TribeChannelResult[],
  updatedChannel: TribeChannelResult
): TribeChannelResult[] {
  return channels.map((currentChannel) =>
    currentChannel.id === updatedChannel.id ? updatedChannel : currentChannel
  );
}

type ChannelListState = {
  appendChannel: (createdChannel: TribeChannelResult) => void;
  channelItems: TribeChannelResult[];
  handleUpdateChannel: (channel: TribeChannelResult) => Promise<void>;
  pendingChannelIds: ReadonlySet<string>;
  removeChannel: (channelId: string) => void;
  savedChannels: TribeChannelResult[];
  /**
   * Runs one request for a channel row, ignoring it while the row already has
   * one in flight; a failure shows the API message or `fallbackError`.
   */
  runChannelRequest: (
    channelId: string,
    fallbackError: string,
    request: () => Promise<void>
  ) => Promise<void>;
  updateChannelDraft: (
    channelId: string,
    patch: Partial<Pick<TribeChannelResult, "emoji" | "name">>
  ) => void;
};

/**
 * Builds the runner of channel row requests: one request per row at a time,
 * with the row marked pending while it runs and failures reported as toasts.
 *
 * @param pendingChannelIds - Rows with a request in flight.
 * @param setChannelPending - Marks or clears a row as pending.
 * @returns The request runner.
 */
function createChannelRequestRunner(
  pendingChannelIds: ReadonlySet<string>,
  setChannelPending: (channelId: string, isPending: boolean) => void
): ChannelListState["runChannelRequest"] {
  return async (channelId, fallbackError, request) => {
    if (pendingChannelIds.has(channelId)) {
      return;
    }

    setChannelPending(channelId, true);

    try {
      await request();
    } catch (error) {
      toastChannelRequestError(error, fallbackError);
    } finally {
      setChannelPending(channelId, false);
    }
  };
}

/**
 * Keeps the editable channel rows, their last saved version and the rows
 * with a request in flight.
 *
 * @param channels - Initial channels.
 * @param tribeSlug - Tribe slug used by the endpoints.
 * @returns The channel rows and the operations that change them.
 */
function useChannelList(
  channels: TribeChannelResult[],
  tribeSlug: string
): ChannelListState {
  const [channelItems, setChannelItems] = useState(channels);
  const [savedChannels, setSavedChannels] = useState(channels);
  const [pendingChannelIds, setPendingChannelIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const setChannelPending = (channelId: string, isPending: boolean) => {
    setPendingChannelIds((currentIds) =>
      toggleChannelPending(currentIds, channelId, isPending)
    );
  };

  const replaceChannel = (updatedChannel: TribeChannelResult) => {
    setChannelItems((currentItems) => replaceChannelById(currentItems, updatedChannel));
    setSavedChannels((currentItems) => replaceChannelById(currentItems, updatedChannel));
  };

  const appendChannel = (createdChannel: TribeChannelResult) => {
    setChannelItems((currentItems) => [...currentItems, createdChannel]);
    setSavedChannels((currentItems) => [...currentItems, createdChannel]);
  };

  const removeChannel = (channelId: string) => {
    setChannelItems((currentItems) =>
      currentItems.filter((currentChannel) => currentChannel.id !== channelId)
    );
    setSavedChannels((currentItems) =>
      currentItems.filter((currentChannel) => currentChannel.id !== channelId)
    );
  };

  const runChannelRequest = createChannelRequestRunner(pendingChannelIds, setChannelPending);

  const handleUpdateChannel = (channel: TribeChannelResult) =>
    runChannelRequest(channel.id, CHANNEL_MANAGEMENT_COPY.fallbackUpdateError, async () => {
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
      toast.success(response.message ?? CHANNEL_MANAGEMENT_COPY.saveSuccess);
    });

  const updateChannelDraft: ChannelListState["updateChannelDraft"] = (
    channelId,
    patch
  ) => {
    setChannelItems((currentItems) =>
      currentItems.map((currentChannel) =>
        currentChannel.id === channelId
          ? { ...currentChannel, ...patch }
          : currentChannel
      )
    );
  };

  return {
    appendChannel,
    channelItems,
    handleUpdateChannel,
    pendingChannelIds,
    removeChannel,
    runChannelRequest,
    savedChannels,
    updateChannelDraft,
  };
}

type CreateChannelFormState = {
  canCreateChannel: boolean;
  emoji: string;
  handleCreateChannel: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  isCreatePending: boolean;
  name: string;
  setEmoji: (emoji: string) => void;
  setName: (name: string) => void;
};

/**
 * Keeps the new channel draft and creates the channel on submit.
 *
 * @param tribeSlug - Tribe slug used by the endpoints.
 * @param onChannelCreated - Adds the created channel to the list.
 * @returns The draft, its validity and the submit handler.
 */
function useCreateChannelForm(
  tribeSlug: string,
  onChannelCreated: (createdChannel: TribeChannelResult) => void
): CreateChannelFormState {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [isCreatePending, setIsCreatePending] = useState(false);
  const canCreateChannel =
    !isCreatePending && isValidChannelName(name) && Boolean(emoji.trim());

  const handleCreateChannel = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateChannel) {
      return;
    }

    setIsCreatePending(true);

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
        onChannelCreated(response.channel);
      }

      setEmoji("");
      setName("");
      toast.success(response.message ?? CHANNEL_MANAGEMENT_COPY.createSuccess);
    } catch (error) {
      toastChannelRequestError(error, CHANNEL_MANAGEMENT_COPY.fallbackCreateError);
    } finally {
      setIsCreatePending(false);
    }
  };

  return {
    canCreateChannel,
    emoji,
    handleCreateChannel,
    isCreatePending,
    name,
    setEmoji,
    setName,
  };
}

type ChannelDeletionState = {
  configuredHeadingRef: RefObject<HTMLHeadingElement | null>;
  deleteCandidate: TribeChannelResult | null;
  deleteDialogChannelName: string;
  deleteTargetChannelId: string;
  deleteTargetOptions: TribeChannelResult[];
  handleDeleteChannel: (channel: TribeChannelResult) => Promise<void>;
  handleDeleteDialogChange: (open: boolean) => void;
  isDeleteInProgress: boolean;
  requestChannelDeletion: (channel: TribeChannelResult, dialogChannelName: string) => void;
  restoreFocusAfterDeletion: (event: Event) => void;
  setDeleteTargetChannelId: (channelId: string) => void;
};

/**
 * Drives the delete confirmation dialog: the candidate channel, where its
 * messages move and the focus once the deleted row is gone.
 *
 * @param channelList - Channel rows and their in-flight requests.
 * @param tribeSlug - Tribe slug used by the endpoints.
 * @returns The dialog state and handlers.
 */
function useChannelDeletion(
  channelList: ChannelListState,
  tribeSlug: string
): ChannelDeletionState {
  const { pendingChannelIds, removeChannel, runChannelRequest, savedChannels } =
    channelList;
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deleteTargetChannelId, setDeleteTargetChannelId] = useState("");
  // Kept after the candidate is cleared so the title does not blank out while
  // the dialog plays its closing animation.
  const [deleteDialogChannelName, setDeleteDialogChannelName] = useState("");
  const configuredHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const wasChannelDeletedRef = useRef(false);
  // Dialog copy and destinations use the saved names, not unsaved row drafts.
  const deleteCandidate =
    savedChannels.find((channel) => channel.id === deleteCandidateId) ?? null;
  const deleteTargetOptions = savedChannels.filter(
    (channel) => channel.id !== deleteCandidateId
  );
  const isDeleteInProgress =
    deleteCandidateId !== null && pendingChannelIds.has(deleteCandidateId);

  const handleDeleteChannel = (channel: TribeChannelResult) =>
    runChannelRequest(channel.id, CHANNEL_MANAGEMENT_COPY.fallbackDeleteError, async () => {
      const response = await submitChannelRequest(
        CHANNEL_MANAGEMENT_ENDPOINT.channel(tribeSlug, channel.id),
        CHANNEL_MANAGEMENT_FORM.deleteMethod,
        deleteTargetChannelId ? { targetChannelId: deleteTargetChannelId } : undefined
      );

      removeChannel(channel.id);
      wasChannelDeletedRef.current = true;
      setDeleteCandidateId(null);
      setDeleteTargetChannelId("");
      toast.success(response.message ?? CHANNEL_MANAGEMENT_COPY.deleteSuccess);
    });

  const handleDeleteDialogChange = (open: boolean) => {
    if (open || isDeleteInProgress) {
      return;
    }

    setDeleteCandidateId(null);
    setDeleteTargetChannelId("");
  };

  const requestChannelDeletion = (
    channel: TribeChannelResult,
    dialogChannelName: string
  ) => {
    setDeleteTargetChannelId("");
    setDeleteDialogChannelName(dialogChannelName);
    setDeleteCandidateId(channel.id);
  };

  const restoreFocusAfterDeletion = (event: Event) => {
    // The trigger row no longer exists after a deletion; keep keyboard
    // users anchored on the channel list instead of the page body.
    if (wasChannelDeletedRef.current) {
      wasChannelDeletedRef.current = false;
      event.preventDefault();
      configuredHeadingRef.current?.focus();
    }
  };

  return {
    configuredHeadingRef,
    deleteCandidate,
    deleteDialogChannelName,
    deleteTargetChannelId,
    deleteTargetOptions,
    handleDeleteChannel,
    handleDeleteDialogChange,
    isDeleteInProgress,
    requestChannelDeletion,
    restoreFocusAfterDeletion,
    setDeleteTargetChannelId,
  };
}

/**
 * Renders the new channel form.
 *
 * @param props - Component props.
 * @param props.form - New channel draft and submit handler.
 * @returns The create channel section.
 */
function CreateChannelSection({ form }: { form: CreateChannelFormState }) {
  return (
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
        onSubmit={form.handleCreateChannel}
      >
        <ChannelEmojiPicker
          isLabelVisuallyHidden
          label={CHANNEL_MANAGEMENT_COPY.emojiLabel}
          onChange={form.setEmoji}
          value={form.emoji}
        />
        <Input
          aria-label={CHANNEL_MANAGEMENT_COPY.nameLabel}
          description={CHANNEL_MANAGEMENT_COPY.nameLimitDescription}
          error={
            form.name.length > TRIBE_CHANNEL_NAME.maxLength
              ? CHANNEL_MANAGEMENT_COPY.nameTooLongError
              : undefined
          }
          id={CHANNEL_MANAGEMENT_FIELD_ID.createNameInput}
          maxLength={TRIBE_CHANNEL_NAME.maxLength}
          onChange={(event) => {
            form.setName(event.currentTarget.value);
          }}
          placeholder={CHANNEL_MANAGEMENT_COPY.namePlaceholder}
          value={form.name}
        />
        <Button
          aria-busy={form.isCreatePending || undefined}
          className={styles.TribeChannelManagement__createButton}
          disabled={!form.canCreateChannel}
          type={CHANNEL_MANAGEMENT_FORM.submitType}
        >
          <PlusIcon />
          {CHANNEL_MANAGEMENT_COPY.createButton}
        </Button>
      </form>
    </section>
  );
}

type ChannelRowProps = {
  channel: TribeChannelResult;
  channelList: ChannelListState;
  onDeleteRequest: ChannelDeletionState["requestChannelDeletion"];
};

/**
 * Renders the editable fields of one channel row.
 *
 * @param props - Row channel, whether it is pending and the draft updater.
 * @returns The emoji and name fields.
 */
function ChannelRowFields({
  channel,
  isPending,
  updateChannelDraft,
}: {
  channel: TribeChannelResult;
  isPending: boolean;
  updateChannelDraft: ChannelListState["updateChannelDraft"];
}) {
  return (
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
      <Input
        aria-label={CHANNEL_MANAGEMENT_COPY.nameLabel}
        disabled={isPending}
        error={
          channel.name.length > TRIBE_CHANNEL_NAME.maxLength
            ? CHANNEL_MANAGEMENT_COPY.nameTooLongError
            : undefined
        }
        id={`${CHANNEL_MANAGEMENT_FIELD_ID.editNameInputPrefix}${channel.id}`}
        maxLength={TRIBE_CHANNEL_NAME.maxLength}
        onChange={(event) => {
          updateChannelDraft(channel.id, {
            name: event.currentTarget.value,
          });
        }}
        value={channel.name}
      />
    </div>
  );
}

/**
 * Renders one configured channel with its save status, save and delete actions.
 *
 * @param props - Row channel, the channel list state and the delete request handler.
 * @returns The animated list item of the channel.
 */
function ChannelRow({ channel, channelList, onDeleteRequest }: ChannelRowProps) {
  const savedChannel = channelList.savedChannels.find(
    (currentChannel) => currentChannel.id === channel.id
  );
  const isPending = channelList.pendingChannelIds.has(channel.id);
  const isDirty = hasUnsavedChanges(channel, savedChannel);

  return (
    <AnimatedListItem
      aria-busy={isPending || undefined}
      className={styles.TribeChannelManagement__item}
    >
      <ChannelRowFields
        channel={channel}
        isPending={isPending}
        updateChannelDraft={channelList.updateChannelDraft}
      />
      <div
        aria-label={`${CHANNEL_MANAGEMENT_COPY.actionsLabelPrefix} ${channel.name}`}
        className={styles.TribeChannelManagement__actions}
        role={CHANNEL_MANAGEMENT_FORM.groupRole}
      >
        <PresenceSwap
          as="span"
          className={styles.TribeChannelManagement__unsaved}
          mode="popLayout"
          presenceKey={
            isDirty
              ? CHANNEL_ROW_STATUS_KEY.unsaved
              : CHANNEL_ROW_STATUS_KEY.saved
          }
        >
          {isDirty ? CHANNEL_MANAGEMENT_COPY.unsavedChanges : null}
        </PresenceSwap>
        <Button
          className={styles.TribeChannelManagement__saveButton}
          disabled={
            isPending || !isDirty || !isValidChannelName(channel.name)
          }
          onClick={() => {
            void channelList.handleUpdateChannel(channel);
          }}
          type={CHANNEL_MANAGEMENT_FORM.buttonType}
          variant={CHANNEL_MANAGEMENT_FORM.secondaryVariant}
        >
          {CHANNEL_MANAGEMENT_COPY.saveButton}
        </Button>
        <Button
          aria-label={CHANNEL_MANAGEMENT_COPY.deleteButton}
          className={styles.TribeChannelManagement__deleteButton}
          disabled={isPending}
          onClick={() => {
            onDeleteRequest(channel, savedChannel?.name ?? channel.name);
          }}
          size={CHANNEL_MANAGEMENT_FORM.iconSize}
          title={CHANNEL_MANAGEMENT_COPY.deleteButton}
          type={CHANNEL_MANAGEMENT_FORM.buttonType}
          variant={CHANNEL_MANAGEMENT_FORM.ghostVariant}
        >
          <Trash2Icon />
        </Button>
      </div>
    </AnimatedListItem>
  );
}

/**
 * Renders the configured channels, or the empty state when there are none.
 *
 * @param props - Channel list state, the heading focus target and the delete request handler.
 * @returns The configured channels section.
 */
function ConfiguredChannelsSection({
  channelList,
  configuredHeadingRef,
  onDeleteRequest,
}: Omit<ChannelRowProps, "channel"> & {
  configuredHeadingRef: ChannelDeletionState["configuredHeadingRef"];
}) {
  const { channelItems } = channelList;

  return (
    <section className={styles.TribeChannelManagement__section}>
      <div className={styles.TribeChannelManagement__sectionIntro}>
        <div className={styles.TribeChannelManagement__sectionTitleRow}>
          <h2
            className={styles.TribeChannelManagement__sectionTitle}
            ref={configuredHeadingRef}
            tabIndex={PROGRAMMATIC_FOCUS_TAB_INDEX}
          >
            {CHANNEL_MANAGEMENT_COPY.configuredSectionTitle}
          </h2>
          <AnimatedCount
            className={styles.TribeChannelManagement__count}
            value={channelItems.length}
          />
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
            <AnimatePresence initial={false}>
            {channelItems.map((channel) => (
              <ChannelRow
                channel={channel}
                channelList={channelList}
                key={channel.id}
                onDeleteRequest={onDeleteRequest}
              />
            ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </section>
  );
}

/**
 * Renders the delete confirmation dialog with the destination for the messages.
 *
 * @param props - Component props.
 * @param props.deletion - Delete dialog state and handlers.
 * @returns The delete channel dialog.
 */
function DeleteChannelDialog({ deletion }: { deletion: ChannelDeletionState }) {
  const { deleteCandidate, deleteTargetOptions, isDeleteInProgress } = deletion;

  return (
    <Dialog
      open={deleteCandidate !== null}
      onOpenChange={deletion.handleDeleteDialogChange}
    >
      <DialogContent
        onCloseAutoFocus={deletion.restoreFocusAfterDeletion}
        title={CHANNEL_MANAGEMENT_COPY.deleteDialogTitle(deletion.deleteDialogChannelName)}
        description={CHANNEL_MANAGEMENT_COPY.deleteDialogDescription}
        footer={
          <>
            <Button
              disabled={isDeleteInProgress}
              onClick={() => {
                deletion.handleDeleteDialogChange(false);
              }}
              type={CHANNEL_MANAGEMENT_FORM.buttonType}
              variant={CHANNEL_MANAGEMENT_FORM.secondaryVariant}
            >
              {CHANNEL_MANAGEMENT_COPY.deleteCancelButton}
            </Button>
            <Button
              disabled={isDeleteInProgress}
              onClick={() => {
                if (deleteCandidate) {
                  void deletion.handleDeleteChannel(deleteCandidate);
                }
              }}
              type={CHANNEL_MANAGEMENT_FORM.buttonType}
              variant={CHANNEL_MANAGEMENT_FORM.dangerVariant}
            >
              <Trash2Icon />
              {CHANNEL_MANAGEMENT_COPY.deleteConfirmButton}
            </Button>
          </>
        }
      >
        <div className={styles.TribeChannelManagement__dialogBody}>
          {deleteTargetOptions.length > 0 ? (
            <Select
              description={CHANNEL_MANAGEMENT_COPY.targetOptional}
              disabled={isDeleteInProgress}
              id={CHANNEL_MANAGEMENT_FIELD_ID.deleteTargetSelect}
              label={CHANNEL_MANAGEMENT_COPY.targetLabel}
              onValueChange={deletion.setDeleteTargetChannelId}
              options={deleteTargetOptions.map((targetChannel) => ({
                label: buildChannelOptionLabel(targetChannel),
                value: targetChannel.id,
              }))}
              placeholder={CHANNEL_MANAGEMENT_COPY.selectTargetPlaceholder}
              value={deletion.deleteTargetChannelId}
            />
          ) : (
            <p className={styles.TribeChannelManagement__fieldHelp}>
              {CHANNEL_MANAGEMENT_COPY.deleteNoTargetHint}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Leader and guardian page to organise the round into channels: create a
 * channel with an icon and a name, rename or re-icon existing channels one
 * row at a time, and delete a channel after choosing where its messages go.
 *
 * Each row tracks its own in-flight request, so saving one channel never
 * re-enables the controls of another channel that is still being deleted.
 *
 * @param props - Initial channels and the tribe slug used by the endpoints.
 * @returns The channel management page body.
 */
export function TribeChannelManagement({
  channels,
  tribeSlug,
}: TribeChannelManagementProps) {
  const channelList = useChannelList(channels, tribeSlug);
  const createForm = useCreateChannelForm(tribeSlug, channelList.appendChannel);
  const deletion = useChannelDeletion(channelList, tribeSlug);

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

      <CreateChannelSection form={createForm} />

      <ConfiguredChannelsSection
        channelList={channelList}
        configuredHeadingRef={deletion.configuredHeadingRef}
        onDeleteRequest={deletion.requestChannelDeletion}
      />

      <DeleteChannelDialog deletion={deletion} />
    </section>
  );
}
