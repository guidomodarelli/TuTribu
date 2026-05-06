"use client";

import { FormEvent, useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TribeChannelResult } from "@/src/modules/messages/application/results/tribe-round-result";
import styles from "./styles.module.scss";

const CHANNEL_MANAGEMENT_COPY = {
  actionsLabelPrefix: "Acciones de",
  createButton: "Crear canal",
  createSectionTitle: "Nuevo canal",
  deleteButton: "Eliminar",
  emojiLabel: "Ícono",
  emptyState: "Todavía no hay canales configurados.",
  fallbackCreateError: "No pudimos crear el canal.",
  fallbackDeleteError: "No pudimos eliminar el canal.",
  fallbackSaveError: "No pudimos guardar el canal.",
  fallbackUpdateError: "No pudimos actualizar el canal.",
  nameLabel: "Nombre",
  namePlaceholder: "Nombre del canal",
  selectTargetPlaceholder: "Seleccionar destino",
  saveButton: "Guardar",
  sectionDescription:
    "Organizá la ronda en canales. Si un canal tiene mensajes, se moverán antes de eliminarlos.",
  sectionTitle: "Canales",
  configuredSectionTitle: "Canales configurados",
  targetLabel: "Mover mensajes a",
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
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  groupRole: "group",
  jsonContentType: "application/json",
  patchMethod: "PATCH",
  messageMethod: "POST",
  submitType: "submit",
  buttonType: "button",
  emptySelectValue: "",
  outlineVariant: "outline",
} as const;

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

export function TribeChannelManagement({
  channels,
  tribeSlug,
}: TribeChannelManagementProps) {
  const [channelItems, setChannelItems] = useState(channels);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [targetChannelById, setTargetChannelById] = useState<Record<string, string>>(
    {}
  );
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);

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
        setChannelItems((currentItems) => [...currentItems, response.channel!]);
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

      if (response.channel) {
        setChannelItems((currentItems) =>
          currentItems.map((currentChannel) =>
            currentChannel.id === response.channel!.id
              ? response.channel!
              : currentChannel
          )
        );
      }

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
    const targetChannelId = targetChannelById[channel.id] ?? "";

    setPendingChannelId(channel.id);

    try {
      const response = await submitChannelRequest(
        CHANNEL_MANAGEMENT_ENDPOINT.channel(tribeSlug, channel.id),
        CHANNEL_MANAGEMENT_FORM.deleteMethod,
        targetChannelId ? { targetChannelId } : undefined
      );

      setChannelItems((currentItems) =>
        currentItems.filter((currentChannel) => currentChannel.id !== channel.id)
      );
      setTargetChannelById((currentTargets) => {
        const nextTargets: Record<string, string> = {};

        for (const [sourceChannelId, targetChannelId] of Object.entries(
          currentTargets
        )) {
          if (
            sourceChannelId === channel.id ||
            targetChannelId === channel.id
          ) {
            continue;
          }

          nextTargets[sourceChannelId] = targetChannelId;
        }

        return nextTargets;
      });
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

      <section className={styles.TribeChannelManagement__createSection}>
        <h2 className={styles.TribeChannelManagement__sectionTitle}>
          {CHANNEL_MANAGEMENT_COPY.createSectionTitle}
        </h2>
        <form
          className={styles.TribeChannelManagement__createForm}
          onSubmit={handleCreateChannel}
        >
          <label className={styles.TribeChannelManagement__field}>
            <span className={styles.TribeChannelManagement__fieldLabel}>
              {CHANNEL_MANAGEMENT_COPY.emojiLabel}
            </span>
            <Input
              className={styles.TribeChannelManagement__emojiInput}
              onChange={(event) => {
                setEmoji(event.currentTarget.value);
              }}
              value={emoji}
            />
          </label>
          <label className={styles.TribeChannelManagement__field}>
            <span className={styles.TribeChannelManagement__fieldLabel}>
              {CHANNEL_MANAGEMENT_COPY.nameLabel}
            </span>
            <Input
              className={styles.TribeChannelManagement__textInput}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              placeholder={CHANNEL_MANAGEMENT_COPY.namePlaceholder}
              value={name}
            />
          </label>
          <Button
            className={styles.TribeChannelManagement__createButton}
            disabled={Boolean(pendingChannelId) || !name.trim() || !emoji.trim()}
            type={CHANNEL_MANAGEMENT_FORM.submitType}
          >
            <PlusIcon />
            {CHANNEL_MANAGEMENT_COPY.createButton}
          </Button>
        </form>
      </section>

      <section className={styles.TribeChannelManagement__configuredSection}>
        <h2 className={styles.TribeChannelManagement__sectionTitle}>
          {CHANNEL_MANAGEMENT_COPY.configuredSectionTitle}
        </h2>
        {channelItems.length === 0 ? (
          <p className={styles.TribeChannelManagement__empty}>
            {CHANNEL_MANAGEMENT_COPY.emptyState}
          </p>
        ) : (
          <ol
            aria-label="Canales configurados"
            className={styles.TribeChannelManagement__list}
          >
            {channelItems.map((channel) => (
              <li className={styles.TribeChannelManagement__item} key={channel.id}>
                <label className={styles.TribeChannelManagement__field}>
                  <span className={styles.TribeChannelManagement__fieldLabel}>
                    {CHANNEL_MANAGEMENT_COPY.emojiLabel}
                  </span>
                  <Input
                    className={styles.TribeChannelManagement__emojiInput}
                    disabled={pendingChannelId === channel.id}
                    onChange={(event) => {
                      const nextEmoji = event.currentTarget.value;

                      setChannelItems((currentItems) =>
                        currentItems.map((currentChannel) =>
                          currentChannel.id === channel.id
                            ? { ...currentChannel, emoji: nextEmoji }
                            : currentChannel
                        )
                      );
                    }}
                    value={channel.emoji}
                  />
                </label>
                <label className={styles.TribeChannelManagement__field}>
                  <span className={styles.TribeChannelManagement__fieldLabel}>
                    {CHANNEL_MANAGEMENT_COPY.nameLabel}
                  </span>
                  <Input
                    className={styles.TribeChannelManagement__textInput}
                    disabled={pendingChannelId === channel.id}
                    onChange={(event) => {
                      const nextName = event.currentTarget.value;

                      setChannelItems((currentItems) =>
                        currentItems.map((currentChannel) =>
                          currentChannel.id === channel.id
                            ? { ...currentChannel, name: nextName }
                            : currentChannel
                        )
                      );
                    }}
                    value={channel.name}
                  />
                </label>
                <label
                  className={`${styles.TribeChannelManagement__field} ${styles.TribeChannelManagement__targetField}`}
                >
                  <span className={styles.TribeChannelManagement__fieldLabel}>
                    {CHANNEL_MANAGEMENT_COPY.targetLabel}
                  </span>
                  <select
                    className={styles.TribeChannelManagement__select}
                    disabled={pendingChannelId === channel.id}
                    onChange={(event) => {
                      const selectedTargetChannelId = event.currentTarget.value;

                      setTargetChannelById((currentTargets) => ({
                        ...currentTargets,
                        [channel.id]: selectedTargetChannelId,
                      }));
                    }}
                    value={targetChannelById[channel.id] ?? ""}
                  >
                    <option value={CHANNEL_MANAGEMENT_FORM.emptySelectValue}>
                      {CHANNEL_MANAGEMENT_COPY.selectTargetPlaceholder}
                    </option>
                    {channelItems
                      .filter((targetChannel) => targetChannel.id !== channel.id)
                      .map((targetChannel) => (
                        <option key={targetChannel.id} value={targetChannel.id}>
                          {targetChannel.emoji} {targetChannel.name}
                        </option>
                    ))}
                  </select>
                </label>
                <div
                  aria-label={`${CHANNEL_MANAGEMENT_COPY.actionsLabelPrefix} ${channel.name}`}
                  className={styles.TribeChannelManagement__actions}
                  role={CHANNEL_MANAGEMENT_FORM.groupRole}
                >
                  <Button
                    className={styles.TribeChannelManagement__actionButton}
                    disabled={pendingChannelId === channel.id}
                    onClick={() => {
                      void handleUpdateChannel(channel);
                    }}
                    type={CHANNEL_MANAGEMENT_FORM.buttonType}
                    variant={CHANNEL_MANAGEMENT_FORM.outlineVariant}
                  >
                    <PencilIcon />
                    {CHANNEL_MANAGEMENT_COPY.saveButton}
                  </Button>
                  <Button
                    className={styles.TribeChannelManagement__actionButton}
                    disabled={pendingChannelId === channel.id}
                    onClick={() => {
                      void handleDeleteChannel(channel);
                    }}
                    type={CHANNEL_MANAGEMENT_FORM.buttonType}
                    variant={CHANNEL_MANAGEMENT_FORM.outlineVariant}
                  >
                    <Trash2Icon />
                    {CHANNEL_MANAGEMENT_COPY.deleteButton}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
