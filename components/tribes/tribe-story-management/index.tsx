"use client";

import { useId, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichStoryContent } from "@/components/rich-text/rich-story-content";
import { buildPlayerEmbedSource } from "@/src/modules/shared/application/video/build-player-embed-source";
import { parseExternalVideoUrl } from "@/src/modules/shared/domain/value-objects/external-video-url";
import {
  TRIBE_STORY_CONTENT_MAX_LENGTH,
  TRIBE_STORY_MEDIA_MAX_ITEMS,
  TRIBE_STORY_MEDIA_TYPE,
} from "@/src/modules/tribes/constants/tribe-story";
import type { TribeStoryResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import type {
  TribeStoryMediaType,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import styles from "./styles.module.scss";

const TRIBE_STORY_MANAGEMENT_COPY = {
  addMediaButton: "Agregar recurso",
  contentCounter: (current: number, max: number) => `${current}/${max}`,
  contentHint:
    "Contá de dónde viene la tribu, qué la mueve y hacia dónde va. Podés usar **negrita**, listas con - al inicio de línea y links con [texto](https://...).",
  contentLabel: "Historia de la tribu",
  contentPlaceholder:
    "Ej.: Nacimos en 2020 como un grupo de amigos que quería aprender a invertir...",
  editDescription:
    "Definí la página de presentación que ven los miembros y visitantes de la tribu. Solo el líder puede editarla.",
  emptyMedia: "Aún no agregaste imágenes ni videos.",
  fallbackSaveError: "No pudimos guardar la historia.",
  invalidImageUrl:
    "Ingresá una URL de imagen válida que empiece con http:// o https://",
  invalidVideoUrl:
    "Ingresá un link de video de YouTube, Vimeo, Wistia o Loom.",
  invalidWebsiteUrl:
    "Ingresá una URL válida que empiece con http:// o https://",
  mediaHeading: "Galería",
  mediaHint: (max: number) =>
    `Hasta ${max} imágenes o videos que se muestran arriba de la historia.`,
  mediaLegendPrefix: "Recurso",
  legendOf: "de",
  mediaTypeLabel: "Tipo",
  mediaTypeImage: "Imagen",
  mediaTypeVideo: "Video",
  mediaUrlImageLabel: "URL de la imagen",
  mediaUrlImagePlaceholder: "https://...",
  mediaUrlVideoLabel: "Link del video",
  mediaUrlVideoPlaceholder: "https://www.youtube.com/watch?v=...",
  previewEyebrow: "Vista previa",
  removeMediaLabel: "Eliminar",
  removeMediaTitle: "Eliminar recurso",
  requiredContent: "Escribí la historia antes de guardar.",
  saveButton: "Guardar",
  saveSuccess: "Historia actualizada.",
  savingButton: "Guardando...",
  title: "Historia",
  validationSummary: "Revisá los campos marcados antes de guardar.",
  websiteHint:
    "Link externo de la tribu (sitio, blog o red social). Se muestra en el panel de datos.",
  websiteLabel: "Sitio web",
  websitePlaceholder: "https://mitribu.example.com",
} as const;

const STORY_MANAGEMENT_ROUTE = {
  apiPrefix: "/api/tribes/",
  storySegment: "/story",
} as const;

const STORY_MANAGEMENT_REQUEST = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  destructiveVariant: "destructive",
  iconButtonSize: "icon",
  jsonContentType: "application/json",
  outlineVariant: "outline",
  putMethod: "PUT",
  submitButtonType: "submit",
} as const;

const STORY_MANAGEMENT_ARIA = {
  roleAlert: "alert",
} as const;

const STORY_TEXTAREA_ROWS = 12;
const STORY_URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;
const MEDIA_LEGEND_SEPARATOR = " ";
const MEDIA_CLIENT_ID_PREFIX = "story-media-";

type EditableStoryMediaItem = {
  clientId: string;
  mediaType: TribeStoryMediaType;
  url: string;
};

type TribeStoryManagementProps = {
  story: TribeStoryResult | null;
  tribeSlug: string;
};

let mediaClientIdCounter = 0;

function createMediaClientId(): string {
  mediaClientIdCounter += 1;

  return MEDIA_CLIENT_ID_PREFIX + String(mediaClientIdCounter);
}

function buildStoryEndpoint(tribeSlug: string): string {
  return (
    STORY_MANAGEMENT_ROUTE.apiPrefix +
    tribeSlug +
    STORY_MANAGEMENT_ROUTE.storySegment
  );
}

function buildEditableMediaItems(
  story: TribeStoryResult | null
): EditableStoryMediaItem[] {
  return (story?.media ?? []).map((mediaItem) => ({
    clientId: createMediaClientId(),
    mediaType: mediaItem.mediaType,
    url:
      mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video &&
      mediaItem.videoProvider &&
      mediaItem.externalVideoId
        ? buildPlayerEmbedSource(
            mediaItem.videoProvider as VideoProvider,
            mediaItem.externalVideoId
          )
        : (mediaItem.url ?? ""),
  }));
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    return (
      parsedUrl.protocol === STORY_URL_PROTOCOL.http ||
      parsedUrl.protocol === STORY_URL_PROTOCOL.https
    );
  } catch {
    return false;
  }
}

function isVideoUrlParseable(value: string): boolean {
  try {
    parseExternalVideoUrl(value);

    return true;
  } catch {
    return false;
  }
}

function isMediaItemValid(mediaItem: EditableStoryMediaItem): boolean {
  const trimmedUrl = mediaItem.url.trim();

  if (mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video) {
    return isVideoUrlParseable(trimmedUrl);
  }

  return trimmedUrl.length > 0 && isHttpUrl(trimmedUrl);
}

function buildLegend(index: number, total: number): string {
  return (
    TRIBE_STORY_MANAGEMENT_COPY.mediaLegendPrefix +
    MEDIA_LEGEND_SEPARATOR +
    String(index + 1) +
    MEDIA_LEGEND_SEPARATOR +
    TRIBE_STORY_MANAGEMENT_COPY.legendOf +
    MEDIA_LEGEND_SEPARATOR +
    String(total)
  );
}

async function submitStoryUpdate(
  tribeSlug: string,
  payload: {
    content: string;
    media: Array<{ mediaType: TribeStoryMediaType; url: string }>;
    websiteUrl: string | null;
  }
): Promise<string> {
  const response = await fetch(buildStoryEndpoint(tribeSlug), {
    body: JSON.stringify(payload),
    headers: {
      [STORY_MANAGEMENT_REQUEST.contentTypeHeader]:
        STORY_MANAGEMENT_REQUEST.jsonContentType,
    },
    method: STORY_MANAGEMENT_REQUEST.putMethod,
  });
  const responseBody = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? TRIBE_STORY_MANAGEMENT_COPY.fallbackSaveError
    );
  }

  return responseBody.message ?? TRIBE_STORY_MANAGEMENT_COPY.saveSuccess;
}

/**
 * Leader-only editor for the tribe story "About" page: long-form content with
 * a safe markdown subset, an optional external website link, and a media
 * gallery of up to five images or videos.
 */
export function TribeStoryManagement({
  story,
  tribeSlug,
}: TribeStoryManagementProps) {
  const [content, setContent] = useState(story?.content ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(story?.websiteUrl ?? "");
  const [mediaItems, setMediaItems] = useState<EditableStoryMediaItem[]>(() =>
    buildEditableMediaItems(story)
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [invalidMediaClientIds, setInvalidMediaClientIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isWebsiteInvalid, setIsWebsiteInvalid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const contentId = useId();
  const contentErrorId = useId();
  const websiteId = useId();
  const websiteErrorId = useId();
  const mediaErrorIdPrefix = useId();
  const trimmedContent = content.trim();
  const showContentError =
    validationMessage !== null && trimmedContent.length === 0;

  const updateMediaItem = (
    clientId: string,
    patch: Partial<EditableStoryMediaItem>
  ) => {
    setMediaItems((currentItems) =>
      currentItems.map((mediaItem) =>
        mediaItem.clientId === clientId
          ? { ...mediaItem, ...patch }
          : mediaItem
      )
    );
    setValidationMessage(null);
    setInvalidMediaClientIds((currentIds) => {
      if (!currentIds.has(clientId)) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);

      nextIds.delete(clientId);

      return nextIds;
    });
  };
  const handleAddMediaItem = () => {
    setMediaItems((currentItems) =>
      currentItems.length >= TRIBE_STORY_MEDIA_MAX_ITEMS
        ? currentItems
        : [
            ...currentItems,
            {
              clientId: createMediaClientId(),
              mediaType: TRIBE_STORY_MEDIA_TYPE.image,
              url: "",
            },
          ]
    );
  };
  const handleRemoveMediaItem = (clientId: string) => {
    setMediaItems((currentItems) =>
      currentItems.filter((mediaItem) => mediaItem.clientId !== clientId)
    );
    setValidationMessage(null);
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextInvalidMediaIds = new Set(
      mediaItems
        .filter((mediaItem) => !isMediaItemValid(mediaItem))
        .map((mediaItem) => mediaItem.clientId)
    );
    const trimmedWebsiteUrl = websiteUrl.trim();
    const nextWebsiteInvalid =
      trimmedWebsiteUrl.length > 0 && !isHttpUrl(trimmedWebsiteUrl);

    setInvalidMediaClientIds(nextInvalidMediaIds);
    setIsWebsiteInvalid(nextWebsiteInvalid);

    if (!trimmedContent) {
      setValidationMessage(TRIBE_STORY_MANAGEMENT_COPY.requiredContent);
      return;
    }

    if (nextInvalidMediaIds.size > 0 || nextWebsiteInvalid) {
      setValidationMessage(TRIBE_STORY_MANAGEMENT_COPY.validationSummary);
      return;
    }

    setIsSaving(true);
    setValidationMessage(null);

    try {
      const message = await submitStoryUpdate(tribeSlug, {
        content: trimmedContent,
        media: mediaItems.map((mediaItem) => ({
          mediaType: mediaItem.mediaType,
          url: mediaItem.url.trim(),
        })),
        websiteUrl: trimmedWebsiteUrl.length > 0 ? trimmedWebsiteUrl : null,
      });

      toast.success(message);
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : TRIBE_STORY_MANAGEMENT_COPY.fallbackSaveError
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={styles.TribeStoryManagement}>
      <header className={styles.TribeStoryManagement__header}>
        <h1 className={styles.TribeStoryManagement__title}>
          {TRIBE_STORY_MANAGEMENT_COPY.title}
        </h1>
        <p className={styles.TribeStoryManagement__description}>
          {TRIBE_STORY_MANAGEMENT_COPY.editDescription}
        </p>
      </header>

      <form
        className={styles.TribeStoryManagement__form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className={styles.TribeStoryManagement__field}>
          <label
            className={styles.TribeStoryManagement__fieldLabel}
            htmlFor={contentId}
          >
            {TRIBE_STORY_MANAGEMENT_COPY.contentLabel}
          </label>
          <span className={styles.TribeStoryManagement__fieldHelper}>
            {TRIBE_STORY_MANAGEMENT_COPY.contentHint}
          </span>
          <Textarea
            aria-describedby={showContentError ? contentErrorId : undefined}
            aria-invalid={showContentError}
            aria-required
            className={styles.TribeStoryManagement__textarea}
            id={contentId}
            maxLength={TRIBE_STORY_CONTENT_MAX_LENGTH}
            onChange={(event) => {
              setContent(event.target.value);
              setValidationMessage(null);
            }}
            placeholder={TRIBE_STORY_MANAGEMENT_COPY.contentPlaceholder}
            rows={STORY_TEXTAREA_ROWS}
            value={content}
          />
          <span className={styles.TribeStoryManagement__counter}>
            {TRIBE_STORY_MANAGEMENT_COPY.contentCounter(
              content.length,
              TRIBE_STORY_CONTENT_MAX_LENGTH
            )}
          </span>
          {showContentError ? (
            <span
              className={styles.TribeStoryManagement__fieldError}
              id={contentErrorId}
              role={STORY_MANAGEMENT_ARIA.roleAlert}
            >
              {validationMessage}
            </span>
          ) : null}
        </div>

        <div className={styles.TribeStoryManagement__field}>
          <label
            className={styles.TribeStoryManagement__fieldLabel}
            htmlFor={websiteId}
          >
            {TRIBE_STORY_MANAGEMENT_COPY.websiteLabel}
          </label>
          <span className={styles.TribeStoryManagement__fieldHelper}>
            {TRIBE_STORY_MANAGEMENT_COPY.websiteHint}
          </span>
          <Input
            aria-describedby={isWebsiteInvalid ? websiteErrorId : undefined}
            aria-invalid={isWebsiteInvalid}
            id={websiteId}
            onChange={(event) => {
              setWebsiteUrl(event.target.value);
              setIsWebsiteInvalid(false);
              setValidationMessage(null);
            }}
            placeholder={TRIBE_STORY_MANAGEMENT_COPY.websitePlaceholder}
            value={websiteUrl}
          />
          {isWebsiteInvalid ? (
            <span
              className={styles.TribeStoryManagement__fieldError}
              id={websiteErrorId}
            >
              {TRIBE_STORY_MANAGEMENT_COPY.invalidWebsiteUrl}
            </span>
          ) : null}
        </div>

        <section className={styles.TribeStoryManagement__collection}>
          <div className={styles.TribeStoryManagement__collectionHeader}>
            <div className={styles.TribeStoryManagement__sectionTitleGroup}>
              <h2 className={styles.TribeStoryManagement__subtitle}>
                {TRIBE_STORY_MANAGEMENT_COPY.mediaHeading}
              </h2>
              <span className={styles.TribeStoryManagement__count}>
                {mediaItems.length}
              </span>
            </div>
            <Button
              disabled={mediaItems.length >= TRIBE_STORY_MEDIA_MAX_ITEMS}
              onClick={handleAddMediaItem}
              type={STORY_MANAGEMENT_REQUEST.buttonType}
              variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
            >
              <PlusIcon />
              {TRIBE_STORY_MANAGEMENT_COPY.addMediaButton}
            </Button>
          </div>
          <p className={styles.TribeStoryManagement__fieldHelper}>
            {TRIBE_STORY_MANAGEMENT_COPY.mediaHint(
              TRIBE_STORY_MEDIA_MAX_ITEMS
            )}
          </p>
          {mediaItems.length === 0 ? (
            <p className={styles.TribeStoryManagement__emptyState}>
              {TRIBE_STORY_MANAGEMENT_COPY.emptyMedia}
            </p>
          ) : null}
          {mediaItems.map((mediaItem, mediaIndex) => {
            const mediaTypeSelectId =
              "story-media-type-" + mediaItem.clientId;
            const mediaUrlInputId = "story-media-url-" + mediaItem.clientId;
            const mediaErrorId = mediaErrorIdPrefix + mediaItem.clientId;
            const showMediaError = invalidMediaClientIds.has(
              mediaItem.clientId
            );
            const isVideoItem =
              mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video;

            return (
              <fieldset
                className={styles.TribeStoryManagement__mediaRow}
                key={mediaItem.clientId}
              >
                <legend className={styles.TribeStoryManagement__legend}>
                  {buildLegend(mediaIndex, mediaItems.length)}
                </legend>
                <div className={styles.TribeStoryManagement__mediaFields}>
                  <div className={styles.TribeStoryManagement__field}>
                    <label
                      className={styles.TribeStoryManagement__fieldLabel}
                      htmlFor={mediaTypeSelectId}
                    >
                      {TRIBE_STORY_MANAGEMENT_COPY.mediaTypeLabel}
                    </label>
                    <select
                      className={styles.TribeStoryManagement__select}
                      id={mediaTypeSelectId}
                      onChange={(event) =>
                        updateMediaItem(mediaItem.clientId, {
                          mediaType: event.target
                            .value as TribeStoryMediaType,
                        })
                      }
                      value={mediaItem.mediaType}
                    >
                      <option value={TRIBE_STORY_MEDIA_TYPE.image}>
                        {TRIBE_STORY_MANAGEMENT_COPY.mediaTypeImage}
                      </option>
                      <option value={TRIBE_STORY_MEDIA_TYPE.video}>
                        {TRIBE_STORY_MANAGEMENT_COPY.mediaTypeVideo}
                      </option>
                    </select>
                  </div>
                  <div className={styles.TribeStoryManagement__field}>
                    <label
                      className={styles.TribeStoryManagement__fieldLabel}
                      htmlFor={mediaUrlInputId}
                    >
                      {isVideoItem
                        ? TRIBE_STORY_MANAGEMENT_COPY.mediaUrlVideoLabel
                        : TRIBE_STORY_MANAGEMENT_COPY.mediaUrlImageLabel}
                    </label>
                    <Input
                      aria-describedby={
                        showMediaError ? mediaErrorId : undefined
                      }
                      aria-invalid={showMediaError}
                      aria-required
                      id={mediaUrlInputId}
                      onChange={(event) =>
                        updateMediaItem(mediaItem.clientId, {
                          url: event.target.value,
                        })
                      }
                      placeholder={
                        isVideoItem
                          ? TRIBE_STORY_MANAGEMENT_COPY.mediaUrlVideoPlaceholder
                          : TRIBE_STORY_MANAGEMENT_COPY.mediaUrlImagePlaceholder
                      }
                      value={mediaItem.url}
                    />
                    {showMediaError ? (
                      <span
                        className={styles.TribeStoryManagement__fieldError}
                        id={mediaErrorId}
                      >
                        {isVideoItem
                          ? TRIBE_STORY_MANAGEMENT_COPY.invalidVideoUrl
                          : TRIBE_STORY_MANAGEMENT_COPY.invalidImageUrl}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    aria-label={
                      TRIBE_STORY_MANAGEMENT_COPY.removeMediaLabel
                    }
                    className={styles.TribeStoryManagement__removeButton}
                    onClick={() =>
                      handleRemoveMediaItem(mediaItem.clientId)
                    }
                    size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
                    title={TRIBE_STORY_MANAGEMENT_COPY.removeMediaTitle}
                    type={STORY_MANAGEMENT_REQUEST.buttonType}
                    variant={STORY_MANAGEMENT_REQUEST.destructiveVariant}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </fieldset>
            );
          })}
        </section>

        {validationMessage !== null && !showContentError ? (
          <p
            className={styles.TribeStoryManagement__fieldError}
            role={STORY_MANAGEMENT_ARIA.roleAlert}
          >
            {validationMessage}
          </p>
        ) : null}

        <div className={styles.TribeStoryManagement__actions}>
          <Button
            disabled={isSaving}
            type={STORY_MANAGEMENT_REQUEST.submitButtonType}
          >
            {isSaving
              ? TRIBE_STORY_MANAGEMENT_COPY.savingButton
              : TRIBE_STORY_MANAGEMENT_COPY.saveButton}
          </Button>
        </div>
      </form>

      {trimmedContent ? (
        <section className={styles.TribeStoryManagement__preview}>
          <span className={styles.TribeStoryManagement__previewEyebrow}>
            {TRIBE_STORY_MANAGEMENT_COPY.previewEyebrow}
          </span>
          <RichStoryContent content={trimmedContent} />
        </section>
      ) : null}
    </section>
  );
}
