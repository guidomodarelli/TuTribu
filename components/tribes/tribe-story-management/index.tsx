"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoldIcon,
  GripVerticalIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  LoaderCircleIcon,
  PlusIcon,
  UploadIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { toast, Button, Input, Select, type SelectOption, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, AnimatedCount, AnimatedListItem, buttonClassName, cn } from "@golfo/ui";






import { TribeStoryAbout } from "@/components/tribes/tribe-story-about";
import { buildPlayerEmbedSource } from "@/src/modules/shared/application/video/build-player-embed-source";
import { parseExternalVideoUrl } from "@/src/modules/shared/domain/value-objects/external-video-url";
import {
  TRIBE_STORY_CONTENT_MAX_LENGTH,
  TRIBE_STORY_MEDIA_MAX_ITEMS,
  TRIBE_STORY_MEDIA_TYPE,
} from "@/src/modules/tribes/constants/tribe-story";
import type {
  TribeStoryMediaResult,
  TribeStoryResult,
  TribeStoryStatsResult,
} from "@/src/modules/tribes/application/results/tribe-story-result";
import type {
  TribeStoryMediaType,
  TribeStoryOnlineMember,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import styles from "./styles.module.scss";

const TRIBE_STORY_MANAGEMENT_COPY = {
  addMediaButton: "Agregar recurso",
  contentCounter: (current: number, max: number) => `${current}/${max}`,
  contentHint:
    "Contá de dónde viene la tribu, qué la mueve y hacia dónde va. Podés usar **negrita**, listas con - al inicio de línea y links con [texto](https://...).",
  contentLabel: "Historia de la tribu",
  dragHandleLabel: "Arrastrar para reordenar",
  mediaMovedAnnouncement: (position: number, total: number) =>
    `Recurso movido a la posición ${position} de ${total}.`,
  contentPlaceholder:
    "Ej.: Nacimos en 2020 como un grupo de amigos que quería aprender a invertir...",
  editDescription:
    "Definí la página de presentación que ven los miembros y visitantes de la tribu. Solo el líder puede editarla.",
  emptyMedia: "Aún no agregaste imágenes ni videos.",
  fallbackSaveError: "No pudimos guardar la historia.",
  fallbackUploadError: "No pudimos subir la imagen. Intentá de nuevo.",
  invalidUploadTypeError: "Elegí un archivo de imagen (JPG, PNG, GIF o WebP).",
  uploadTooLargeError: (maxMegabytes: number) =>
    `La imagen no puede superar los ${maxMegabytes} MB.`,
  invalidImageUrl:
    "Ingresá una URL de imagen válida que empiece con http:// o https://",
  invalidVideoUrl:
    "Ingresá un link de video de YouTube, Vimeo, Wistia o Loom.",
  invalidWebsiteUrl:
    "Ingresá una URL válida que empiece con http:// o https://",
  legendOf: "de",
  mediaHeading: "Galería",
  mediaHint: (max: number) =>
    `Hasta ${max} imágenes o videos que se muestran arriba de la historia. Podés reordenarlos con las flechas o arrastrándolos.`,
  mediaLegendPrefix: "Recurso",
  mediaThumbAlt: (position: number) => `Vista previa del recurso ${position}`,
  mediaThumbEmpty: "Sin vista previa",
  mediaThumbVideo: "Video",
  mediaTypeImage: "Imagen",
  mediaTypeLabel: "Tipo",
  mediaTypePlaceholder: "Elegí un tipo...",
  mediaTypeVideo: "Video",
  mediaUrlImageLabel: "URL de la imagen",
  mediaUrlImagePlaceholder: "https://...",
  mediaUrlVideoLabel: "Link del video",
  mediaUrlVideoPlaceholder: "https://www.youtube.com/watch?v=...",
  moveDownLabel: "Bajar",
  moveUpLabel: "Subir",
  editTabLabel: "Edición",
  previewEmpty: "Escribí la historia para ver la vista previa.",
  previewNote:
    "Así van a ver la página los miembros y visitantes. Los cambios se aplican cuando guardás desde la pestaña Edición.",
  previewTabLabel: "Vista previa",
  removeMediaLabel: (legend: string) => `Eliminar ${legend}`,
  removeMediaTitle: "Eliminar recurso",
  requiredContent: "Escribí la historia antes de guardar.",
  saveButton: "Guardar",
  saveSuccess: "Historia actualizada.",
  savingButton: "Guardando...",
  title: "Historia",
  toolbarAriaLabel: "Formato del texto",
  toolbarBoldLabel: "Negrita",
  toolbarLinkLabel: "Link",
  toolbarListLabel: "Lista",
  uploadButton: "Subir imagen",
  uploadingButton: "Subiendo...",
  uploadLimitHint: (maxMegabytes: number) =>
    `JPG, PNG, GIF o WebP de hasta ${maxMegabytes} MB, o una URL pública.`,
  validationSummary: "Revisá los campos marcados antes de guardar.",
  websiteHint:
    "Link externo de la tribu (sitio, blog o red social). Se muestra en el panel de datos.",
  websiteLabel: "Sitio web",
  websitePlaceholder: "https://mitribu.example.com",
} as const;

const STORY_MANAGEMENT_ROUTE = {
  apiPrefix: "/api/tribes/",
  imagesSegment: "/images",
  pathSeparator: "/",
  storySegment: "/story",
} as const;

const STORY_MANAGEMENT_REQUEST = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  dangerVariant: "danger",
  fileFormField: "file",
  iconButtonSize: "sm",
  imageAcceptTypes: "image/*",
  jsonContentType: "application/json",
  secondaryVariant: "secondary",
  postMethod: "POST",
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
const INITIAL_MEDIA_CLIENT_ID_SEGMENT = "initial-";
const MEDIA_THUMB_SIZES = "(min-width: 40rem) 9rem, 12rem";
const STORY_FORMAT = {
  boldMarker: "**",
  linkPrefix: "[",
  linkTextEnd: "](",
  linkUrlPlaceholder: "https://",
  linkSuffix: ")",
  listLineBreak: "\n",
  listPrefix: "- ",
} as const;

/** Share of the story length limit from which the counter turns into a warning. */
const CONTENT_COUNTER_WARNING_RATIO = 0.9;

/** Element id prefixes used to move focus back into a gallery row after an edit. */
const MEDIA_FOCUS_ID_PREFIX = {
  moveDown: "story-media-move-down-",
  moveUp: "story-media-move-up-",
  url: "story-media-url-",
} as const;

/** Drag payload for reordering gallery rows; Firefox only starts a drag with data. */
const MEDIA_DRAG = {
  dataType: "text/plain",
  effect: "move",
  imageOffsetPx: 24,
} as const;

const STORY_MODE_TAB = {
  edit: "edit",
  preview: "preview",
} as const;

const MEDIA_TYPE_OPTIONS: SelectOption[] = [
  { label: TRIBE_STORY_MANAGEMENT_COPY.mediaTypeImage, value: TRIBE_STORY_MEDIA_TYPE.image },
  { label: TRIBE_STORY_MANAGEMENT_COPY.mediaTypeVideo, value: TRIBE_STORY_MEDIA_TYPE.video },
];

const UPLOAD_IMAGE_MIME_PREFIX = "image/";
const UPLOAD_MAX_MEGABYTES = 10;
const BYTES_PER_KIBIBYTE = 1024;
const UPLOAD_MAX_BYTES =
  UPLOAD_MAX_MEGABYTES * BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;

/** Result of a toolbar format: replacement text and the selection to restore inside it. */
type StoryTextFormat = {
  selectionEnd: number;
  selectionStart: number;
  text: string;
};

type EditableStoryMediaItem = {
  clientId: string;
  mediaType: TribeStoryMediaType;
  url: string;
};

/**
 * Read-only data the preview tab needs to mirror the public story page: the
 * tribe identity and facts panel that members see next to the story.
 */
export type TribeStoryPreviewContext = {
  onlineMembers: TribeStoryOnlineMember[];
  stats: TribeStoryStatsResult | null;
  tribeName: string;
};

type TribeStoryManagementProps = {
  previewContext?: TribeStoryPreviewContext;
  story: TribeStoryResult | null;
  tribeSlug: string;
};

const PREVIEW_HEADING_LEVEL = "secondary";

let mediaClientIdCounter = 0;

/**
 * Client id for a gallery row added after hydration. Rows that come from the
 * saved story use «buildInitialMediaClientId» instead, because this counter
 * differs between the server render and the client render.
 */
function createMediaClientId(): string {
  mediaClientIdCounter += 1;

  return MEDIA_CLIENT_ID_PREFIX + String(mediaClientIdCounter);
}

/**
 * Deterministic client id for a gallery row that exists in the saved story, so
 * the ids the server renders into «id»/«htmlFor» match the client render.
 */
function buildInitialMediaClientId(idPrefix: string, mediaIndex: number): string {
  return idPrefix + INITIAL_MEDIA_CLIENT_ID_SEGMENT + String(mediaIndex);
}

function buildStoryEndpoint(tribeSlug: string): string {
  return (
    STORY_MANAGEMENT_ROUTE.apiPrefix +
    tribeSlug +
    STORY_MANAGEMENT_ROUTE.storySegment
  );
}

function buildTribeImagesEndpoint(tribeSlug: string): string {
  return (
    STORY_MANAGEMENT_ROUTE.apiPrefix +
    tribeSlug +
    STORY_MANAGEMENT_ROUTE.imagesSegment
  );
}

function buildEditableMediaItems(
  story: TribeStoryResult | null,
  idPrefix: string
): EditableStoryMediaItem[] {
  return (story?.media ?? []).map((mediaItem, mediaIndex) => ({
    clientId: buildInitialMediaClientId(idPrefix, mediaIndex),
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

/**
 * Builds the read-only gallery items for the preview tab from the editable
 * draft: only valid entries render (parseable video links, http image URLs), so
 * the preview mirrors what would be saved.
 */
function buildPreviewMedia(
  mediaItems: EditableStoryMediaItem[]
): TribeStoryMediaResult[] {
  return mediaItems.flatMap(
    (mediaItem, mediaIndex): TribeStoryMediaResult[] => {
      const trimmedUrl = mediaItem.url.trim();

      if (mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video) {
        try {
          const parsedVideo = parseExternalVideoUrl(trimmedUrl);

          return [
            {
              externalVideoId: parsedVideo.externalId,
              id: mediaItem.clientId,
              mediaType: TRIBE_STORY_MEDIA_TYPE.video,
              sortOrder: mediaIndex,
              url: null,
              videoProvider: parsedVideo.provider,
            },
          ];
        } catch {
          // Invalid drafts are skipped from the preview instead of breaking it.
          return [];
        }
      }

      if (trimmedUrl.length > 0 && isHttpUrl(trimmedUrl)) {
        return [
          {
            externalVideoId: null,
            id: mediaItem.clientId,
            mediaType: TRIBE_STORY_MEDIA_TYPE.image,
            sortOrder: mediaIndex,
            url: trimmedUrl,
            videoProvider: null,
          },
        ];
      }

      return [];
    }
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const reordered = [...items];
  const [movedItem] = reordered.splice(fromIndex, 1);

  reordered.splice(toIndex, 0, movedItem);

  return reordered;
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
 * Uploads an image through the leader-only direct upload flow: reserves the
 * Cloudflare direct upload, posts the binary to it, and returns the delivery
 * URL. On a failed binary upload the reserved draft is released best-effort.
 */
async function uploadStoryImage(
  tribeSlug: string,
  imageFile: File
): Promise<string> {
  const reserveResponse = await fetch(buildTribeImagesEndpoint(tribeSlug), {
    method: STORY_MANAGEMENT_REQUEST.postMethod,
  });
  const reserveBody = (await reserveResponse.json().catch(() => ({}))) as {
    deliveryUrl?: string;
    imageId?: string;
    message?: string;
    uploadUrl?: string;
  };

  if (
    !reserveResponse.ok ||
    !reserveBody.uploadUrl ||
    !reserveBody.deliveryUrl ||
    !reserveBody.imageId
  ) {
    throw new Error(
      reserveBody.message ?? TRIBE_STORY_MANAGEMENT_COPY.fallbackUploadError
    );
  }

  const formData = new FormData();

  formData.append(STORY_MANAGEMENT_REQUEST.fileFormField, imageFile);

  const uploadResponse = await fetch(reserveBody.uploadUrl, {
    body: formData,
    method: STORY_MANAGEMENT_REQUEST.postMethod,
  });

  if (!uploadResponse.ok) {
    void fetch(
      buildTribeImagesEndpoint(tribeSlug) +
        STORY_MANAGEMENT_ROUTE.pathSeparator +
        reserveBody.imageId,
      { method: STORY_MANAGEMENT_REQUEST.deleteMethod }
    ).catch(() => {
      // Deliberate no-op: the reserved draft stays and is never attached.
    });

    throw new Error(TRIBE_STORY_MANAGEMENT_COPY.fallbackUploadError);
  }

  return reserveBody.deliveryUrl;
}

type ImageUploadButtonProps = {
  isUploading: boolean;
  onFileSelected: (imageFile: File | undefined) => void;
};

/**
 * Outline button wrapping a visually hidden file input, so the upload control
 * looks like every other button while staying keyboard and screen-reader
 * accessible.
 */
function ImageUploadButton({ isUploading, onFileSelected }: ImageUploadButtonProps) {
  return (
    <label className={buttonClassName({ variant: "secondary", className: styles.TribeStoryManagement__uploadButton })} data-disabled={isUploading ? true : undefined}>
        <UploadIcon />
        {isUploading
          ? TRIBE_STORY_MANAGEMENT_COPY.uploadingButton
          : TRIBE_STORY_MANAGEMENT_COPY.uploadButton}
        <input
          accept={STORY_MANAGEMENT_REQUEST.imageAcceptTypes}
          className={styles.TribeStoryManagement__uploadInput}
          disabled={isUploading}
          onChange={(event) => {
            const [selectedFile] = event.target.files ?? [];

            event.target.value = "";
            onFileSelected(selectedFile);
          }}
          type="file"
        />
      </label>
  );
}

type MediaThumbnailProps = {
  mediaItem: EditableStoryMediaItem;
  position: number;
};

/**
 * Small preview of a gallery resource: the image itself when its URL is a
 * valid http(s) link, a video marker for video rows, and an empty placeholder
 * while the URL is still missing or invalid.
 */
function MediaThumbnail({ mediaItem, position }: MediaThumbnailProps) {
  const trimmedUrl = mediaItem.url.trim();
  const isVideoItem = mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video;

  if (!isVideoItem && trimmedUrl.length > 0 && isHttpUrl(trimmedUrl)) {
    return (
      <div className={styles.TribeStoryManagement__mediaThumb}>
        <Image
          alt={TRIBE_STORY_MANAGEMENT_COPY.mediaThumbAlt(position)}
          className={styles.TribeStoryManagement__mediaThumbImage}
          fill
          sizes={MEDIA_THUMB_SIZES}
          src={trimmedUrl}
          unoptimized
        />
      </div>
    );
  }

  const EmptyIcon = isVideoItem ? VideoIcon : ImageIcon;

  return (
    <div className={styles.TribeStoryManagement__mediaThumb}>
      <span className={styles.TribeStoryManagement__mediaThumbEmpty}>
        <EmptyIcon
          aria-hidden
          className={styles.TribeStoryManagement__mediaThumbEmptyIcon}
        />
        <span className={styles.TribeStoryManagement__mediaThumbEmptyLabel}>
          {isVideoItem
            ? TRIBE_STORY_MANAGEMENT_COPY.mediaThumbVideo
            : TRIBE_STORY_MANAGEMENT_COPY.mediaThumbEmpty}
        </span>
      </span>
    </div>
  );
}

type StoryTextFormatter = (selectedText: string) => StoryTextFormat;
type SetStoryValidationMessage = (message: string | null) => void;

/** Bold keeps the wrapped words selected so a second click can be undone. */
const formatBold: StoryTextFormatter = (selectedText) => ({
  selectionEnd: STORY_FORMAT.boldMarker.length + selectedText.length,
  selectionStart: STORY_FORMAT.boldMarker.length,
  text: STORY_FORMAT.boldMarker + selectedText + STORY_FORMAT.boldMarker,
});

/** Lists leave the caret after the inserted items, ready to keep typing. */
const formatList: StoryTextFormatter = (selectedText) => {
  const text = selectedText
    ? selectedText
        .split(STORY_FORMAT.listLineBreak)
        .map((line) => STORY_FORMAT.listPrefix + line)
        .join(STORY_FORMAT.listLineBreak)
    : STORY_FORMAT.listPrefix;

  return { selectionEnd: text.length, selectionStart: text.length, text };
};

/** Links select the URL placeholder so the leader can paste the address. */
const formatLink: StoryTextFormatter = (selectedText) => {
  const urlStart =
    STORY_FORMAT.linkPrefix.length +
    selectedText.length +
    STORY_FORMAT.linkTextEnd.length;

  return {
    selectionEnd: urlStart + STORY_FORMAT.linkUrlPlaceholder.length,
    selectionStart: urlStart,
    text:
      STORY_FORMAT.linkPrefix +
      selectedText +
      STORY_FORMAT.linkTextEnd +
      STORY_FORMAT.linkUrlPlaceholder +
      STORY_FORMAT.linkSuffix,
  };
};

/** Removes one id from a set held in state, keeping the set when the id is absent. */
function withoutId(currentIds: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!currentIds.has(id)) {
    return currentIds;
  }

  const nextIds = new Set(currentIds);

  nextIds.delete(id);

  return nextIds;
}

/** @returns The website URL shown in the preview: only a well-formed http(s) URL. */
function getPreviewWebsiteUrl(websiteUrl: string): string | null {
  const trimmedWebsiteUrl = websiteUrl.trim();

  return trimmedWebsiteUrl.length > 0 && isHttpUrl(trimmedWebsiteUrl)
    ? trimmedWebsiteUrl
    : null;
}

/**
 * Story content draft with the formatting toolbar actions.
 * @param setValidationMessage - Clears the validation summary after an edit.
 * @returns The content, its textarea ref and the format handlers.
 */
function useStoryContent(
  initialContent: string,
  setValidationMessage: SetStoryValidationMessage
) {
  const [content, setContent] = useState(initialContent);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingTextareaSelectionRef = useRef<{
    end: number;
    start: number;
  } | null>(null);

  // Toolbar formats rewrite the controlled value, which moves the caret to the
  // end; restore the intended selection once React has committed the text.
  useLayoutEffect(() => {
    const textarea = contentRef.current;
    const pendingSelection = pendingTextareaSelectionRef.current;

    if (!textarea || !pendingSelection) {
      return;
    }

    pendingTextareaSelectionRef.current = null;
    textarea.setSelectionRange(pendingSelection.start, pendingSelection.end);
  }, [content]);

  const applyTextareaFormat = (format: StoryTextFormatter) => {
    const textarea = contentRef.current;

    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd } = textarea;
    const selectedText = content.slice(selectionStart, selectionEnd);
    const formatted = format(selectedText);

    pendingTextareaSelectionRef.current = {
      end: selectionStart + formatted.selectionEnd,
      start: selectionStart + formatted.selectionStart,
    };
    setContent(
      content.slice(0, selectionStart) +
        formatted.text +
        content.slice(selectionEnd)
    );
    setValidationMessage(null);
    textarea.focus();
  };

  return {
    content,
    contentRef,
    handleBoldFormat: () => applyTextareaFormat(formatBold),
    handleLinkFormat: () => applyTextareaFormat(formatLink),
    handleListFormat: () => applyTextareaFormat(formatList),
    setContent,
  };
}

type StoryContentModel = ReturnType<typeof useStoryContent>;

/**
 * Uploads gallery images, one per row at a time, after checking their type
 * and size.
 * @param tribeSlug - Tribe slug.
 * @returns Rows being uploaded and the upload handler.
 */
function useStoryImageUploads(tribeSlug: string) {
  const [uploadingTargets, setUploadingTargets] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const setUploadingTarget = (target: string, isUploading: boolean) => {
    setUploadingTargets((currentTargets) => {
      const nextTargets = new Set(currentTargets);

      if (isUploading) {
        nextTargets.add(target);
      } else {
        nextTargets.delete(target);
      }

      return nextTargets;
    });
  };
  const handleImageFileUpload = async (
    target: string,
    imageFile: File | undefined,
    applyDeliveryUrl: (deliveryUrl: string) => void
  ) => {
    if (!imageFile) {
      return;
    }

    if (!imageFile.type.startsWith(UPLOAD_IMAGE_MIME_PREFIX)) {
      toast.error(TRIBE_STORY_MANAGEMENT_COPY.invalidUploadTypeError);
      return;
    }

    if (imageFile.size > UPLOAD_MAX_BYTES) {
      toast.error(
        TRIBE_STORY_MANAGEMENT_COPY.uploadTooLargeError(UPLOAD_MAX_MEGABYTES)
      );
      return;
    }

    setUploadingTarget(target, true);

    try {
      const deliveryUrl = await uploadStoryImage(tribeSlug, imageFile);

      applyDeliveryUrl(deliveryUrl);
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error
          ? uploadError.message
          : TRIBE_STORY_MANAGEMENT_COPY.fallbackUploadError
      );
    } finally {
      setUploadingTarget(target, false);
    }
  };

  return { handleImageFileUpload, uploadingTargets };
}

type StoryImageUploads = ReturnType<typeof useStoryImageUploads>;

/**
 * Gallery rows of the story. Adding, moving or removing a row re-renders the
 * list; focus then moves to the control that keeps the leader's place.
 * @param story - Saved story.
 * @returns Rows, their failed validation and the screen reader announcement.
 */
function useStoryMediaItems(story: TribeStoryResult | null) {
  const mediaClientIdPrefix = useId();
  const [mediaItems, setMediaItems] = useState<EditableStoryMediaItem[]>(() =>
    buildEditableMediaItems(story, mediaClientIdPrefix)
  );
  const [invalidMediaClientIds, setInvalidMediaClientIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [mediaAnnouncement, setMediaAnnouncement] = useState("");
  const addMediaButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusElementIdRef = useRef<string | null>(null);

  // Adding, moving or removing a gallery row re-renders the list; move focus to
  // the control that keeps the leader's place instead of losing it.
  useEffect(() => {
    const pendingFocusElementId = pendingFocusElementIdRef.current;

    if (!pendingFocusElementId) {
      return;
    }

    pendingFocusElementIdRef.current = null;
    document.getElementById(pendingFocusElementId)?.focus();
  }, [mediaItems]);

  return { addMediaButtonRef, invalidMediaClientIds, mediaAnnouncement, mediaItems, pendingFocusElementIdRef, setInvalidMediaClientIds, setMediaAnnouncement, setMediaItems };
}

type StoryMediaModel = ReturnType<typeof useStoryMediaItems>;

/** Edits, adds and removes gallery rows, clearing the error an edit fixes. */
function createStoryMediaEditHandlers(
  media: StoryMediaModel,
  setValidationMessage: SetStoryValidationMessage
) {
  const { mediaItems, setInvalidMediaClientIds, setMediaItems } = media;
  const canAddMedia = mediaItems.length < TRIBE_STORY_MEDIA_MAX_ITEMS;
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
    setInvalidMediaClientIds((currentIds) => withoutId(currentIds, clientId));
  };
  // An upload can finish after the leader switched the row to video or removed
  // it; only an image row that still exists receives the uploaded URL.
  // The check runs inside the updater because this callback outlives the
  // render that started the upload.
  const applyUploadedImageUrl = (clientId: string, deliveryUrl: string) => {
    setMediaItems((currentItems) =>
      currentItems.map((mediaItem) =>
        mediaItem.clientId === clientId &&
        mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.image
          ? { ...mediaItem, url: deliveryUrl }
          : mediaItem
      )
    );
    setValidationMessage(null);
    setInvalidMediaClientIds((currentIds) => withoutId(currentIds, clientId));
  };
  // The id is created outside the updater so the updater stays pure (React may
  // call it twice) and focus can move to the new row's URL field.
  const handleAddMediaItem = () => {
    if (!canAddMedia) {
      return;
    }

    const createdClientId = createMediaClientId();

    media.pendingFocusElementIdRef.current =
      MEDIA_FOCUS_ID_PREFIX.url + createdClientId;
    setMediaItems((currentItems) =>
      currentItems.length >= TRIBE_STORY_MEDIA_MAX_ITEMS
        ? currentItems
        : [
            ...currentItems,
            {
              clientId: createdClientId,
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
    // The removed row's controls leave the page; land on the add button.
    media.addMediaButtonRef.current?.focus();
  };

  return { applyUploadedImageUrl, canAddMedia, handleAddMediaItem, handleRemoveMediaItem, updateMediaItem };
}

type StoryMediaEditHandlers = ReturnType<typeof createStoryMediaEditHandlers>;

/** Announces where a moved row landed. */
function createMediaPositionAnnouncer(media: StoryMediaModel) {
  return (targetIndex: number) => {
    media.setMediaAnnouncement(
      TRIBE_STORY_MANAGEMENT_COPY.mediaMovedAnnouncement(
        targetIndex + 1,
        media.mediaItems.length
      )
    );
  };
}

/** Moves a row with its arrow buttons, keeping focus on a usable arrow. */
function createStoryMediaMoveHandler(media: StoryMediaModel) {
  const { mediaItems } = media;
  const announceMediaPosition = createMediaPositionAnnouncer(media);

  return (mediaIndex: number, direction: number) => {
    const targetIndex = mediaIndex + direction;
    const movedItem = mediaItems.at(mediaIndex);

    if (!movedItem || targetIndex < 0 || targetIndex >= mediaItems.length) {
      return;
    }

    // Keep focus on the same arrow unless the row reached the edge, where that
    // arrow turns disabled; then hand focus to the opposite arrow.
    const reachedEdge =
      direction < 0 ? targetIndex === 0 : targetIndex === mediaItems.length - 1;
    const isMovingUp = direction < 0;
    const shouldFocusMoveUp = reachedEdge ? !isMovingUp : isMovingUp;

    media.pendingFocusElementIdRef.current =
      (shouldFocusMoveUp
        ? MEDIA_FOCUS_ID_PREFIX.moveUp
        : MEDIA_FOCUS_ID_PREFIX.moveDown) + movedItem.clientId;
    media.setMediaItems((currentItems) =>
      moveItem(currentItems, mediaIndex, targetIndex)
    );
    announceMediaPosition(targetIndex);
  };
}

/**
 * Pointer drag and drop between gallery rows; the arrow buttons remain the
 * keyboard and screen reader path.
 * @returns The dragged row, the drop target and the drag handlers.
 */
function useStoryMediaDrag() {
  const [draggedMediaClientId, setDraggedMediaClientId] = useState<
    string | null
  >(null);
  const [dropTargetClientId, setDropTargetClientId] = useState<string | null>(
    null
  );
  const draggedMediaClientIdRef = useRef<string | null>(null);

  const resetMediaDrag = () => {
    draggedMediaClientIdRef.current = null;
    setDraggedMediaClientId(null);
    setDropTargetClientId(null);
  };
  const handleMediaDragStart = (
    event: DragEvent<HTMLElement>,
    clientId: string
  ) => {
    const rowElement = event.currentTarget.closest(
      "." + styles.TribeStoryManagement__mediaItem
    );

    event.dataTransfer.effectAllowed = MEDIA_DRAG.effect;
    event.dataTransfer.setData(MEDIA_DRAG.dataType, clientId);

    if (rowElement) {
      event.dataTransfer.setDragImage(
        rowElement,
        MEDIA_DRAG.imageOffsetPx,
        MEDIA_DRAG.imageOffsetPx
      );
    }

    draggedMediaClientIdRef.current = clientId;
    setDraggedMediaClientId(clientId);
  };
  const handleMediaDragOver = (
    event: DragEvent<HTMLElement>,
    clientId: string
  ) => {
    // Only rows dragged from this list are accepted as drop sources.
    if (draggedMediaClientIdRef.current === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = MEDIA_DRAG.effect;

    if (dropTargetClientId !== clientId) {
      setDropTargetClientId(clientId);
    }
  };

  return { draggedMediaClientId, draggedMediaClientIdRef, dropTargetClientId, handleMediaDragOver, handleMediaDragStart, resetMediaDrag };
}

type StoryMediaDrag = ReturnType<typeof useStoryMediaDrag>;

/** Drops the dragged row onto another one. */
function createStoryMediaDropHandler(media: StoryMediaModel, drag: StoryMediaDrag) {
  const { mediaItems } = media;
  const announceMediaPosition = createMediaPositionAnnouncer(media);

  return (event: DragEvent<HTMLElement>, targetClientId: string) => {
    const draggedClientId = drag.draggedMediaClientIdRef.current;

    drag.resetMediaDrag();

    if (draggedClientId === null) {
      return;
    }

    event.preventDefault();

    const draggedIndex = mediaItems.findIndex(
      (mediaItem) => mediaItem.clientId === draggedClientId
    );
    const targetIndex = mediaItems.findIndex(
      (mediaItem) => mediaItem.clientId === targetClientId
    );

    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
      return;
    }

    media.setMediaItems((currentItems) =>
      moveItem(currentItems, draggedIndex, targetIndex)
    );
    announceMediaPosition(targetIndex);
  };
}

type StorySubmitOptions = {
  content: string;
  mediaItems: EditableStoryMediaItem[];
  setInvalidMediaClientIds: (ids: ReadonlySet<string>) => void;
  setIsWebsiteInvalid: (isInvalid: boolean) => void;
  setValidationMessage: SetStoryValidationMessage;
  tribeSlug: string;
  websiteUrl: string;
};

/**
 * Validates and saves the story, one save at a time.
 * @param options - Draft values, the validation setters and the tribe.
 * @returns The saving state and the submit handler.
 */
function useStorySubmit(options: StorySubmitOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const { content, mediaItems, setValidationMessage, tribeSlug, websiteUrl } = options;

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    // A second submit (double click, Enter held down) must not start another
    // request before the first one re-renders the disabled button.
    if (isSavingRef.current) {
      return;
    }

    const trimmedContent = content.trim();
    const nextInvalidMediaIds = new Set(
      mediaItems
        .filter((mediaItem) => !isMediaItemValid(mediaItem))
        .map((mediaItem) => mediaItem.clientId)
    );
    const trimmedWebsiteUrl = websiteUrl.trim();
    const nextWebsiteInvalid =
      trimmedWebsiteUrl.length > 0 && !isHttpUrl(trimmedWebsiteUrl);

    options.setInvalidMediaClientIds(nextInvalidMediaIds);
    options.setIsWebsiteInvalid(nextWebsiteInvalid);

    if (!trimmedContent) {
      setValidationMessage(TRIBE_STORY_MANAGEMENT_COPY.requiredContent);
      return;
    }

    if (nextInvalidMediaIds.size > 0 || nextWebsiteInvalid) {
      setValidationMessage(TRIBE_STORY_MANAGEMENT_COPY.validationSummary);
      return;
    }

    isSavingRef.current = true;
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
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return { handleSubmit, isSaving };
}

/** Title and description of the editor. */
function StoryManagementHeader() {
  return (
    <header className={styles.TribeStoryManagement__header}>
      <h1 className={styles.TribeStoryManagement__title}>
        {TRIBE_STORY_MANAGEMENT_COPY.title}
      </h1>
      <p className={styles.TribeStoryManagement__description}>
        {TRIBE_STORY_MANAGEMENT_COPY.editDescription}
      </p>
    </header>
  );
}

type StoryToolbarButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

/** One formatting button of the content toolbar. */
function StoryToolbarButton({ icon, label, onClick }: StoryToolbarButtonProps) {
  return (
    <Button
      aria-label={label}
      onClick={onClick}
      size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
      title={label}
      type={STORY_MANAGEMENT_REQUEST.buttonType}
      variant={STORY_MANAGEMENT_REQUEST.secondaryVariant}
    >
      {icon}
    </Button>
  );
}

/** Bold, list and link formatting toolbar. */
function StoryFormatToolbar({ contentModel }: { contentModel: StoryContentModel }) {
  return (
    <div
      aria-label={TRIBE_STORY_MANAGEMENT_COPY.toolbarAriaLabel}
      className={styles.TribeStoryManagement__toolbar}
      role="toolbar"
    >
      <StoryToolbarButton
        icon={<BoldIcon />}
        label={TRIBE_STORY_MANAGEMENT_COPY.toolbarBoldLabel}
        onClick={contentModel.handleBoldFormat}
      />
      <StoryToolbarButton
        icon={<ListIcon />}
        label={TRIBE_STORY_MANAGEMENT_COPY.toolbarListLabel}
        onClick={contentModel.handleListFormat}
      />
      <StoryToolbarButton
        icon={<LinkIcon />}
        label={TRIBE_STORY_MANAGEMENT_COPY.toolbarLinkLabel}
        onClick={contentModel.handleLinkFormat}
      />
    </div>
  );
}

type StorySectionIntroProps = {
  description: string;
  descriptionId?: string;
  heading: string;
  headingId: string;
};

/** Heading and description of a form section. */
function StorySectionIntro({
  description,
  descriptionId,
  heading,
  headingId,
}: StorySectionIntroProps) {
  return (
    <div className={styles.TribeStoryManagement__sectionIntro}>
      <h2 className={styles.TribeStoryManagement__sectionTitle} id={headingId}>
        {heading}
      </h2>
      <p
        className={styles.TribeStoryManagement__sectionDescription}
        id={descriptionId}
      >
        {description}
      </p>
    </div>
  );
}

type StoryContentSectionProps = {
  contentModel: StoryContentModel;
  onContentChange: () => void;
  showContentError: boolean;
  validationMessage: string | null;
};

/** Story content editor with its toolbar, error and character counter. */
function StoryContentSection({
  contentModel,
  onContentChange,
  showContentError,
  validationMessage,
}: StoryContentSectionProps) {
  const contentHeadingId = useId();
  const contentId = useId();
  const contentHintId = useId();
  const contentErrorId = useId();
  const { content, contentRef, setContent } = contentModel;
  const isContentNearLimit =
    content.length >=
    TRIBE_STORY_CONTENT_MAX_LENGTH * CONTENT_COUNTER_WARNING_RATIO;

  return (
    <section className={styles.TribeStoryManagement__section}>
      <StorySectionIntro
        description={TRIBE_STORY_MANAGEMENT_COPY.contentHint}
        descriptionId={contentHintId}
        heading={TRIBE_STORY_MANAGEMENT_COPY.contentLabel}
        headingId={contentHeadingId}
      />
      <div className={styles.TribeStoryManagement__sectionFields}>
        <div className={styles.TribeStoryManagement__editor}>
          <StoryFormatToolbar contentModel={contentModel} />
          <Textarea
            aria-describedby={
              showContentError
                ? `${contentHintId} ${contentErrorId}`
                : contentHintId
            }
            aria-invalid={showContentError}
            aria-labelledby={contentHeadingId}
            aria-required
            className={styles.TribeStoryManagement__textarea}
            id={contentId}
            maxLength={TRIBE_STORY_CONTENT_MAX_LENGTH}
            onChange={(event) => {
              setContent(event.target.value);
              onContentChange();
            }}
            placeholder={TRIBE_STORY_MANAGEMENT_COPY.contentPlaceholder}
            ref={contentRef}
            rows={STORY_TEXTAREA_ROWS}
            value={content}
          />
          <div className={styles.TribeStoryManagement__editorFooter}>
            {showContentError ? (
              <p
                className={styles.TribeStoryManagement__fieldError}
                id={contentErrorId}
                role={STORY_MANAGEMENT_ARIA.roleAlert}
              >
                {validationMessage}
              </p>
            ) : null}
            <p
              className={cn(
                styles.TribeStoryManagement__counter,
                isContentNearLimit &&
                  styles["TribeStoryManagement__counter--warning"]
              )}
            >
              {TRIBE_STORY_MANAGEMENT_COPY.contentCounter(
                content.length,
                TRIBE_STORY_CONTENT_MAX_LENGTH
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

type StoryWebsiteSectionProps = {
  isWebsiteInvalid: boolean;
  onWebsiteUrlChange: (websiteUrl: string) => void;
  websiteUrl: string;
};

/** Optional external website of the tribe. */
function StoryWebsiteSection({
  isWebsiteInvalid,
  onWebsiteUrlChange,
  websiteUrl,
}: StoryWebsiteSectionProps) {
  const websiteHeadingId = useId();
  const websiteId = useId();
  const websiteHintId = useId();

  return (
    <section className={styles.TribeStoryManagement__section}>
      <StorySectionIntro
        description={TRIBE_STORY_MANAGEMENT_COPY.websiteHint}
        descriptionId={websiteHintId}
        heading={TRIBE_STORY_MANAGEMENT_COPY.websiteLabel}
        headingId={websiteHeadingId}
      />
      <div className={styles.TribeStoryManagement__sectionFields}>
        <Input
          aria-describedby={websiteHintId}
          aria-labelledby={websiteHeadingId}
          error={
            isWebsiteInvalid
              ? TRIBE_STORY_MANAGEMENT_COPY.invalidWebsiteUrl
              : undefined
          }
          id={websiteId}
          onChange={(event) => {
            onWebsiteUrlChange(event.target.value);
          }}
          placeholder={TRIBE_STORY_MANAGEMENT_COPY.websitePlaceholder}
          value={websiteUrl}
        />
      </div>
    </section>
  );
}

/** Error of an invalid row URL, or the upload size note of an image row. */
function StoryMediaFieldMessage({
  errorId,
  isVideoItem,
  showMediaError,
}: {
  errorId: string;
  isVideoItem: boolean;
  showMediaError: boolean;
}) {
  if (showMediaError) {
    return (
      <p className={styles.TribeStoryManagement__fieldError} id={errorId}>
        {isVideoItem
          ? TRIBE_STORY_MANAGEMENT_COPY.invalidVideoUrl
          : TRIBE_STORY_MANAGEMENT_COPY.invalidImageUrl}
      </p>
    );
  }

  if (isVideoItem) {
    return null;
  }

  return (
    <p className={styles.TribeStoryManagement__fieldNote}>
      {TRIBE_STORY_MANAGEMENT_COPY.uploadLimitHint(UPLOAD_MAX_MEGABYTES)}
    </p>
  );
}

type StoryMediaRowProps = {
  editHandlers: StoryMediaEditHandlers;
  errorIdPrefix: string;
  mediaIndex: number;
  mediaItem: EditableStoryMediaItem;
  mediaCount: number;
  onMove: (mediaIndex: number, direction: number) => void;
  showMediaError: boolean;
  uploads: StoryImageUploads;
  drag: StoryMediaDrag;
};

/** Drag handle, position and the move and remove actions of a gallery row. */
function StoryMediaRowHeader({
  drag,
  editHandlers,
  mediaCount,
  mediaIndex,
  mediaItem,
  onMove,
}: Pick<StoryMediaRowProps, "drag" | "editHandlers" | "mediaCount" | "mediaIndex" | "mediaItem" | "onMove">) {
  const legend = buildLegend(mediaIndex, mediaCount);

  return (
    <div className={styles.TribeStoryManagement__mediaItemHeader}>
      <div className={styles.TribeStoryManagement__mediaLegendGroup}>
        {/* Pointer-only affordance: the arrow buttons are
            the keyboard and screen reader path. */}
        <span
          aria-hidden
          className={styles.TribeStoryManagement__dragHandle}
          draggable
          onDragEnd={drag.resetMediaDrag}
          onDragStart={(event) =>
            drag.handleMediaDragStart(event, mediaItem.clientId)
          }
          title={TRIBE_STORY_MANAGEMENT_COPY.dragHandleLabel}
        >
          <GripVerticalIcon />
        </span>
        <p className={styles.TribeStoryManagement__mediaLegend}>{legend}</p>
      </div>
      <div className={styles.TribeStoryManagement__mediaActions}>
        <Button
          aria-label={
            TRIBE_STORY_MANAGEMENT_COPY.moveUpLabel +
            MEDIA_LEGEND_SEPARATOR +
            legend
          }
          disabled={mediaIndex === 0}
          id={MEDIA_FOCUS_ID_PREFIX.moveUp + mediaItem.clientId}
          onClick={() => onMove(mediaIndex, -1)}
          size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
          title={TRIBE_STORY_MANAGEMENT_COPY.moveUpLabel}
          type={STORY_MANAGEMENT_REQUEST.buttonType}
          variant={STORY_MANAGEMENT_REQUEST.secondaryVariant}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          aria-label={
            TRIBE_STORY_MANAGEMENT_COPY.moveDownLabel +
            MEDIA_LEGEND_SEPARATOR +
            legend
          }
          disabled={mediaIndex === mediaCount - 1}
          id={MEDIA_FOCUS_ID_PREFIX.moveDown + mediaItem.clientId}
          onClick={() => onMove(mediaIndex, 1)}
          size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
          title={TRIBE_STORY_MANAGEMENT_COPY.moveDownLabel}
          type={STORY_MANAGEMENT_REQUEST.buttonType}
          variant={STORY_MANAGEMENT_REQUEST.secondaryVariant}
        >
          <ArrowDownIcon />
        </Button>
        <Button
          aria-label={TRIBE_STORY_MANAGEMENT_COPY.removeMediaLabel(legend)}
          onClick={() => editHandlers.handleRemoveMediaItem(mediaItem.clientId)}
          size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
          title={TRIBE_STORY_MANAGEMENT_COPY.removeMediaTitle}
          type={STORY_MANAGEMENT_REQUEST.buttonType}
          variant={STORY_MANAGEMENT_REQUEST.dangerVariant}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}

/** URL of a gallery row with its upload button and message. */
function StoryMediaUrlField({
  editHandlers,
  errorIdPrefix,
  mediaItem,
  showMediaError,
  uploads,
}: Pick<StoryMediaRowProps, "editHandlers" | "errorIdPrefix" | "mediaItem" | "showMediaError" | "uploads">) {
  const mediaUrlInputId = MEDIA_FOCUS_ID_PREFIX.url + mediaItem.clientId;
  const mediaErrorId = errorIdPrefix + mediaItem.clientId;
  const isVideoItem = mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video;

  return (
    <div className={styles.TribeStoryManagement__field}>
      <label
        className={styles.TribeStoryManagement__fieldLabel}
        htmlFor={mediaUrlInputId}
      >
        {isVideoItem
          ? TRIBE_STORY_MANAGEMENT_COPY.mediaUrlVideoLabel
          : TRIBE_STORY_MANAGEMENT_COPY.mediaUrlImageLabel}
      </label>
      <div className={styles.TribeStoryManagement__uploadRow}>
        <Input
          aria-describedby={showMediaError ? mediaErrorId : undefined}
          aria-invalid={showMediaError}
          aria-required
          id={mediaUrlInputId}
          onChange={(event) =>
            editHandlers.updateMediaItem(mediaItem.clientId, {
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
        {!isVideoItem ? (
          <ImageUploadButton
            isUploading={uploads.uploadingTargets.has(mediaItem.clientId)}
            onFileSelected={(imageFile) => {
              void uploads.handleImageFileUpload(
                mediaItem.clientId,
                imageFile,
                (deliveryUrl) =>
                  editHandlers.applyUploadedImageUrl(
                    mediaItem.clientId,
                    deliveryUrl
                  )
              );
            }}
          />
        ) : null}
      </div>
      <StoryMediaFieldMessage
        errorId={mediaErrorId}
        isVideoItem={isVideoItem}
        showMediaError={showMediaError}
      />
    </div>
  );
}

/** Header, thumbnail and fields of one gallery row. */
function StoryMediaRowContent(props: StoryMediaRowProps) {
  const { editHandlers, mediaIndex, mediaItem } = props;

  return (
    <div className={styles.TribeStoryManagement__mediaItemContent}>
      <StoryMediaRowHeader {...props} />
      <div className={styles.TribeStoryManagement__mediaItemBody}>
        <MediaThumbnail mediaItem={mediaItem} position={mediaIndex + 1} />
        <div className={styles.TribeStoryManagement__mediaFields}>
          <Select
            id={"story-media-type-" + mediaItem.clientId}
            label={TRIBE_STORY_MANAGEMENT_COPY.mediaTypeLabel}
            onValueChange={(value) =>
              editHandlers.updateMediaItem(mediaItem.clientId, {
                mediaType: value as TribeStoryMediaType,
              })
            }
            options={MEDIA_TYPE_OPTIONS}
            placeholder={TRIBE_STORY_MANAGEMENT_COPY.mediaTypePlaceholder}
            value={mediaItem.mediaType}
          />
          <StoryMediaUrlField {...props} />
        </div>
      </div>
    </div>
  );
}

type StoryMediaListProps = Omit<StoryMediaRowProps, "mediaIndex" | "mediaItem" | "mediaCount" | "showMediaError" | "onMove" | "errorIdPrefix"> & {
  media: StoryMediaModel;
};

/** Ordered gallery rows with drag and drop between them. */
function StoryMediaList({ drag, media, ...rowProps }: StoryMediaListProps) {
  const errorIdPrefix = useId();
  const { mediaItems } = media;
  const onMove = createStoryMediaMoveHandler(media);
  const onDrop = createStoryMediaDropHandler(media, drag);

  return (
    <ol className={styles.TribeStoryManagement__mediaList}>
      <AnimatePresence initial={false}>
        {mediaItems.map((mediaItem, mediaIndex) => (
          <AnimatedListItem
            className={cn(
              styles.TribeStoryManagement__mediaItem,
              drag.draggedMediaClientId === mediaItem.clientId &&
                styles["TribeStoryManagement__mediaItem--dragging"],
              drag.dropTargetClientId === mediaItem.clientId &&
                drag.draggedMediaClientId !== mediaItem.clientId &&
                styles["TribeStoryManagement__mediaItem--dropTarget"]
            )}
            key={mediaItem.clientId}
            onDragOver={(event) =>
              drag.handleMediaDragOver(event, mediaItem.clientId)
            }
            onDrop={(event) => onDrop(event, mediaItem.clientId)}
          >
            <StoryMediaRowContent
              {...rowProps}
              drag={drag}
              errorIdPrefix={errorIdPrefix}
              mediaCount={mediaItems.length}
              mediaIndex={mediaIndex}
              mediaItem={mediaItem}
              onMove={onMove}
              showMediaError={media.invalidMediaClientIds.has(mediaItem.clientId)}
            />
          </AnimatedListItem>
        ))}
      </AnimatePresence>
    </ol>
  );
}

type StoryMediaSectionProps = {
  drag: StoryMediaDrag;
  editHandlers: StoryMediaEditHandlers;
  media: StoryMediaModel;
  uploads: StoryImageUploads;
};

/** Gallery section: its rows, the add action and the move announcement. */
function StoryMediaSection({
  drag,
  editHandlers,
  media,
  uploads,
}: StoryMediaSectionProps) {
  const mediaHeadingId = useId();
  const { addMediaButtonRef, mediaAnnouncement, mediaItems } = media;

  return (
    <section className={styles.TribeStoryManagement__section}>
      <div className={styles.TribeStoryManagement__sectionIntro}>
        <div className={styles.TribeStoryManagement__sectionTitleRow}>
          <h2
            className={styles.TribeStoryManagement__sectionTitle}
            id={mediaHeadingId}
          >
            {TRIBE_STORY_MANAGEMENT_COPY.mediaHeading}
          </h2>
          <span className={styles.TribeStoryManagement__count}>
            <AnimatedCount value={mediaItems.length} />
            /{TRIBE_STORY_MEDIA_MAX_ITEMS}
          </span>
        </div>
        <p className={styles.TribeStoryManagement__sectionDescription}>
          {TRIBE_STORY_MANAGEMENT_COPY.mediaHint(TRIBE_STORY_MEDIA_MAX_ITEMS)}
        </p>
      </div>
      <div className={styles.TribeStoryManagement__sectionFields}>
        {mediaItems.length === 0 ? (
          <p className={styles.TribeStoryManagement__emptyState}>
            {TRIBE_STORY_MANAGEMENT_COPY.emptyMedia}
          </p>
        ) : (
          <StoryMediaList
            drag={drag}
            editHandlers={editHandlers}
            media={media}
            uploads={uploads}
          />
        )}
        <Button
          className={styles.TribeStoryManagement__addMedia}
          disabled={!editHandlers.canAddMedia}
          onClick={editHandlers.handleAddMediaItem}
          ref={addMediaButtonRef}
          type={STORY_MANAGEMENT_REQUEST.buttonType}
          variant={STORY_MANAGEMENT_REQUEST.secondaryVariant}
        >
          <PlusIcon />
          {TRIBE_STORY_MANAGEMENT_COPY.addMediaButton}
        </Button>
        <p
          aria-live="polite"
          className={styles.TribeStoryManagement__visuallyHidden}
        >
          {mediaAnnouncement}
        </p>
      </div>
    </section>
  );
}

/** Validation summary and the save button of the editor. */
function StorySaveFooter({
  isDisabled,
  isSaving,
  summaryMessage,
}: {
  isDisabled: boolean;
  isSaving: boolean;
  summaryMessage: string | null;
}) {
  return (
    <div className={styles.TribeStoryManagement__footer}>
      {summaryMessage !== null ? (
        <p
          className={styles.TribeStoryManagement__fieldError}
          role={STORY_MANAGEMENT_ARIA.roleAlert}
        >
          {summaryMessage}
        </p>
      ) : null}
      <Button
        aria-busy={isSaving || undefined}
        className={styles.TribeStoryManagement__saveButton}
        disabled={isDisabled}
        type={STORY_MANAGEMENT_REQUEST.submitButtonType}
      >
        {isSaving ? (
          <>
            <LoaderCircleIcon
              aria-hidden
              className={styles.TribeStoryManagement__saveSpinner}
            />
            {TRIBE_STORY_MANAGEMENT_COPY.savingButton}
          </>
        ) : (
          TRIBE_STORY_MANAGEMENT_COPY.saveButton
        )}
      </Button>
    </div>
  );
}

/** Preview of the draft as members see it, or a hint while it has no content. */
function StoryPreviewPanel({
  previewContext,
  previewStory,
  tribeSlug,
}: {
  previewContext?: TribeStoryPreviewContext;
  previewStory: TribeStoryResult | null;
  tribeSlug: string;
}) {
  return (
    <section className={styles.TribeStoryManagement__preview}>
      <p className={styles.TribeStoryManagement__previewNote}>
        {TRIBE_STORY_MANAGEMENT_COPY.previewNote}
      </p>
      {previewStory ? (
        <div className={styles.TribeStoryManagement__previewFrame}>
          <TribeStoryAbout
            headingLevel={PREVIEW_HEADING_LEVEL}
            offerPrice={null}
            onlineMembers={previewContext?.onlineMembers}
            stats={previewContext?.stats ?? null}
            story={previewStory}
            tribeName={previewContext?.tribeName ?? tribeSlug}
          />
        </div>
      ) : (
        <p className={styles.TribeStoryManagement__emptyState}>
          {TRIBE_STORY_MANAGEMENT_COPY.previewEmpty}
        </p>
      )}
    </section>
  );
}

/** Edit and preview tabs of the story editor. */
function StoryModeTabsList() {
  return (
    <TabsList className={styles.TribeStoryManagement__modeTabsList}>
      <TabsTrigger value={STORY_MODE_TAB.edit}>
        {TRIBE_STORY_MANAGEMENT_COPY.editTabLabel}
      </TabsTrigger>
      <TabsTrigger value={STORY_MODE_TAB.preview}>
        {TRIBE_STORY_MANAGEMENT_COPY.previewTabLabel}
      </TabsTrigger>
    </TabsList>
  );
}

/**
 * Leader-only editor for the tribe story "About" page: long-form content with
 * a formatting toolbar and safe markdown subset, an optional external website
 * link, and a media gallery of up to five images or videos (uploaded or
 * linked, reorderable), with an edit/preview mode switch. The preview renders
 * the same read-only «TribeStoryAbout» view members see, fed with the draft.
 */
export function TribeStoryManagement({
  previewContext,
  story,
  tribeSlug,
}: TribeStoryManagementProps) {
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const contentModel = useStoryContent(story?.content ?? "", setValidationMessage);
  const [websiteUrl, setWebsiteUrl] = useState(story?.websiteUrl ?? "");
  const [isWebsiteInvalid, setIsWebsiteInvalid] = useState(false);
  const media = useStoryMediaItems(story);
  const uploads = useStoryImageUploads(tribeSlug);
  const drag = useStoryMediaDrag();
  const { handleSubmit, isSaving } = useStorySubmit({ content: contentModel.content, mediaItems: media.mediaItems, setInvalidMediaClientIds: media.setInvalidMediaClientIds, setIsWebsiteInvalid, setValidationMessage, tribeSlug, websiteUrl });
  const trimmedContent = contentModel.content.trim();
  const showContentError = validationMessage !== null && trimmedContent.length === 0;
  const previewStory: TribeStoryResult | null = trimmedContent
    ? { content: trimmedContent, media: buildPreviewMedia(media.mediaItems), websiteUrl: getPreviewWebsiteUrl(websiteUrl) }
    : null;

  return (
    <section className={styles.TribeStoryManagement}>
      <StoryManagementHeader />

      <Tabs
        className={styles.TribeStoryManagement__modeTabs}
        defaultValue={STORY_MODE_TAB.edit}
      >
        <StoryModeTabsList />

        <TabsContent value={STORY_MODE_TAB.edit}>
          <form
            className={styles.TribeStoryManagement__form}
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <StoryContentSection
              contentModel={contentModel}
              onContentChange={() => setValidationMessage(null)}
              showContentError={showContentError}
              validationMessage={validationMessage}
            />
            <StoryWebsiteSection
              isWebsiteInvalid={isWebsiteInvalid}
              onWebsiteUrlChange={(nextWebsiteUrl) => {
                setWebsiteUrl(nextWebsiteUrl);
                setIsWebsiteInvalid(false);
                setValidationMessage(null);
              }}
              websiteUrl={websiteUrl}
            />
            <StoryMediaSection
              drag={drag}
              editHandlers={createStoryMediaEditHandlers(media, setValidationMessage)}
              media={media}
              uploads={uploads}
            />
            <StorySaveFooter
              isDisabled={isSaving || uploads.uploadingTargets.size > 0}
              isSaving={isSaving}
              summaryMessage={showContentError ? null : validationMessage}
            />
          </form>
        </TabsContent>

        <TabsContent value={STORY_MODE_TAB.preview}>
          <StoryPreviewPanel
            previewContext={previewContext}
            previewStory={previewStory}
            tribeSlug={tribeSlug}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
