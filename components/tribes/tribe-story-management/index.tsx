"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
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
import { toast, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "beez-ui";






import { AnimatedCount } from "@/components/motion/animated-count";
import { AnimatedListItem } from "@/components/motion/animated-list-item";
import { TribeStoryAbout } from "@/components/tribes/tribe-story-about";
import { joinClassNames } from "@/lib/motion/join-class-names";
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
  destructiveVariant: "destructive",
  fileFormField: "file",
  iconButtonSize: "icon",
  imageAcceptTypes: "image/*",
  jsonContentType: "application/json",
  outlineVariant: "outline",
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
    <Button
      asChild
      className={styles.TribeStoryManagement__uploadButton}
      variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
    >
      <label data-disabled={isUploading ? true : undefined}>
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
    </Button>
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
  const [content, setContent] = useState(story?.content ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(story?.websiteUrl ?? "");
  const mediaClientIdPrefix = useId();
  const [mediaItems, setMediaItems] = useState<EditableStoryMediaItem[]>(() =>
    buildEditableMediaItems(story, mediaClientIdPrefix)
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [invalidMediaClientIds, setInvalidMediaClientIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isWebsiteInvalid, setIsWebsiteInvalid] = useState(false);
  const [uploadingTargets, setUploadingTargets] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [draggedMediaClientId, setDraggedMediaClientId] = useState<
    string | null
  >(null);
  const [dropTargetClientId, setDropTargetClientId] = useState<string | null>(
    null
  );
  const [mediaAnnouncement, setMediaAnnouncement] = useState("");
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const addMediaButtonRef = useRef<HTMLButtonElement | null>(null);
  const draggedMediaClientIdRef = useRef<string | null>(null);
  const pendingFocusElementIdRef = useRef<string | null>(null);
  const pendingTextareaSelectionRef = useRef<{
    end: number;
    start: number;
  } | null>(null);
  const isSavingRef = useRef(false);
  const contentHeadingId = useId();
  const contentId = useId();
  const contentHintId = useId();
  const contentErrorId = useId();
  const websiteHeadingId = useId();
  const websiteId = useId();
  const websiteHintId = useId();
  const websiteErrorId = useId();
  const mediaHeadingId = useId();
  const mediaErrorIdPrefix = useId();
  const trimmedContent = content.trim();
  const showContentError =
    validationMessage !== null && trimmedContent.length === 0;
  const canAddMedia = mediaItems.length < TRIBE_STORY_MEDIA_MAX_ITEMS;
  const isContentNearLimit =
    content.length >=
    TRIBE_STORY_CONTENT_MAX_LENGTH * CONTENT_COUNTER_WARNING_RATIO;
  const trimmedWebsiteUrlForPreview = websiteUrl.trim();
  const previewStory: TribeStoryResult | null = trimmedContent
    ? {
        content: trimmedContent,
        media: buildPreviewMedia(mediaItems),
        websiteUrl:
          trimmedWebsiteUrlForPreview.length > 0 &&
          isHttpUrl(trimmedWebsiteUrlForPreview)
            ? trimmedWebsiteUrlForPreview
            : null,
      }
    : null;

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
  const applyTextareaFormat = (
    format: (selectedText: string) => StoryTextFormat
  ) => {
    const textarea = contentRef.current;

    if (!textarea) {
      return;
    }

    const selectionStart = textarea.selectionStart ?? content.length;
    const selectionEnd = textarea.selectionEnd ?? content.length;
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
  // Bold keeps the wrapped words selected so a second click can be undone.
  const handleBoldFormat = () =>
    applyTextareaFormat((selectedText) => ({
      selectionEnd: STORY_FORMAT.boldMarker.length + selectedText.length,
      selectionStart: STORY_FORMAT.boldMarker.length,
      text: STORY_FORMAT.boldMarker + selectedText + STORY_FORMAT.boldMarker,
    }));
  // Lists leave the caret after the inserted items, ready to keep typing.
  const handleListFormat = () =>
    applyTextareaFormat((selectedText) => {
      const text = selectedText
        ? selectedText
            .split(STORY_FORMAT.listLineBreak)
            .map((line) => STORY_FORMAT.listPrefix + line)
            .join(STORY_FORMAT.listLineBreak)
        : STORY_FORMAT.listPrefix;

      return { selectionEnd: text.length, selectionStart: text.length, text };
    });
  // Links select the URL placeholder so the leader can paste the address.
  const handleLinkFormat = () =>
    applyTextareaFormat((selectedText) => {
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
    });
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
  // The id is created outside the updater so the updater stays pure (React may
  // call it twice) and focus can move to the new row's URL field.
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
    if (!canAddMedia) {
      return;
    }

    const createdClientId = createMediaClientId();

    pendingFocusElementIdRef.current =
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
    addMediaButtonRef.current?.focus();
  };
  const announceMediaPosition = (targetIndex: number) => {
    setMediaAnnouncement(
      TRIBE_STORY_MANAGEMENT_COPY.mediaMovedAnnouncement(
        targetIndex + 1,
        mediaItems.length
      )
    );
  };
  const handleMoveMediaItem = (mediaIndex: number, direction: number) => {
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

    pendingFocusElementIdRef.current =
      (shouldFocusMoveUp
        ? MEDIA_FOCUS_ID_PREFIX.moveUp
        : MEDIA_FOCUS_ID_PREFIX.moveDown) + movedItem.clientId;
    setMediaItems((currentItems) =>
      moveItem(currentItems, mediaIndex, targetIndex)
    );
    announceMediaPosition(targetIndex);
  };
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
  const handleMediaDrop = (
    event: DragEvent<HTMLElement>,
    targetClientId: string
  ) => {
    const draggedClientId = draggedMediaClientIdRef.current;

    resetMediaDrag();

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

    setMediaItems((currentItems) =>
      moveItem(currentItems, draggedIndex, targetIndex)
    );
    announceMediaPosition(targetIndex);
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // A second submit (double click, Enter held down) must not start another
    // request before the first one re-renders the disabled button.
    if (isSavingRef.current) {
      return;
    }

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

  const addMediaButton = (
    <Button
      className={styles.TribeStoryManagement__addMedia}
      disabled={!canAddMedia}
      onClick={handleAddMediaItem}
      ref={addMediaButtonRef}
      type={STORY_MANAGEMENT_REQUEST.buttonType}
      variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
    >
      <PlusIcon />
      {TRIBE_STORY_MANAGEMENT_COPY.addMediaButton}
    </Button>
  );

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

      <Tabs
        className={styles.TribeStoryManagement__modeTabs}
        defaultValue={STORY_MODE_TAB.edit}
      >
        <TabsList className={styles.TribeStoryManagement__modeTabsList}>
          <TabsTrigger value={STORY_MODE_TAB.edit}>
            {TRIBE_STORY_MANAGEMENT_COPY.editTabLabel}
          </TabsTrigger>
          <TabsTrigger value={STORY_MODE_TAB.preview}>
            {TRIBE_STORY_MANAGEMENT_COPY.previewTabLabel}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={STORY_MODE_TAB.edit}>
          <form
            className={styles.TribeStoryManagement__form}
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <section className={styles.TribeStoryManagement__section}>
              <div className={styles.TribeStoryManagement__sectionIntro}>
                <h2
                  className={styles.TribeStoryManagement__sectionTitle}
                  id={contentHeadingId}
                >
                  {TRIBE_STORY_MANAGEMENT_COPY.contentLabel}
                </h2>
                <p
                  className={styles.TribeStoryManagement__sectionDescription}
                  id={contentHintId}
                >
                  {TRIBE_STORY_MANAGEMENT_COPY.contentHint}
                </p>
              </div>
              <div className={styles.TribeStoryManagement__sectionFields}>
                <div className={styles.TribeStoryManagement__editor}>
                  <div
                    aria-label={TRIBE_STORY_MANAGEMENT_COPY.toolbarAriaLabel}
                    className={styles.TribeStoryManagement__toolbar}
                    role="toolbar"
                  >
                    <Button
                      aria-label={TRIBE_STORY_MANAGEMENT_COPY.toolbarBoldLabel}
                      onClick={handleBoldFormat}
                      size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
                      title={TRIBE_STORY_MANAGEMENT_COPY.toolbarBoldLabel}
                      type={STORY_MANAGEMENT_REQUEST.buttonType}
                      variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
                    >
                      <BoldIcon />
                    </Button>
                    <Button
                      aria-label={TRIBE_STORY_MANAGEMENT_COPY.toolbarListLabel}
                      onClick={handleListFormat}
                      size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
                      title={TRIBE_STORY_MANAGEMENT_COPY.toolbarListLabel}
                      type={STORY_MANAGEMENT_REQUEST.buttonType}
                      variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
                    >
                      <ListIcon />
                    </Button>
                    <Button
                      aria-label={TRIBE_STORY_MANAGEMENT_COPY.toolbarLinkLabel}
                      onClick={handleLinkFormat}
                      size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
                      title={TRIBE_STORY_MANAGEMENT_COPY.toolbarLinkLabel}
                      type={STORY_MANAGEMENT_REQUEST.buttonType}
                      variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
                    >
                      <LinkIcon />
                    </Button>
                  </div>
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
                      setValidationMessage(null);
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
                      className={joinClassNames(
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

            <section className={styles.TribeStoryManagement__section}>
              <div className={styles.TribeStoryManagement__sectionIntro}>
                <h2
                  className={styles.TribeStoryManagement__sectionTitle}
                  id={websiteHeadingId}
                >
                  {TRIBE_STORY_MANAGEMENT_COPY.websiteLabel}
                </h2>
                <p
                  className={styles.TribeStoryManagement__sectionDescription}
                  id={websiteHintId}
                >
                  {TRIBE_STORY_MANAGEMENT_COPY.websiteHint}
                </p>
              </div>
              <div className={styles.TribeStoryManagement__sectionFields}>
                <div className={styles.TribeStoryManagement__field}>
                  <Input
                    aria-describedby={
                      isWebsiteInvalid
                        ? `${websiteHintId} ${websiteErrorId}`
                        : websiteHintId
                    }
                    aria-invalid={isWebsiteInvalid}
                    aria-labelledby={websiteHeadingId}
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
                    <p
                      className={styles.TribeStoryManagement__fieldError}
                      id={websiteErrorId}
                    >
                      {TRIBE_STORY_MANAGEMENT_COPY.invalidWebsiteUrl}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

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
                  {TRIBE_STORY_MANAGEMENT_COPY.mediaHint(
                    TRIBE_STORY_MEDIA_MAX_ITEMS
                  )}
                </p>
              </div>
              <div className={styles.TribeStoryManagement__sectionFields}>
                {mediaItems.length === 0 ? (
                  <p className={styles.TribeStoryManagement__emptyState}>
                    {TRIBE_STORY_MANAGEMENT_COPY.emptyMedia}
                  </p>
                ) : (
                  <ol className={styles.TribeStoryManagement__mediaList}>
                    <AnimatePresence initial={false}>
                    {mediaItems.map((mediaItem, mediaIndex) => {
                      const mediaTypeSelectId =
                        "story-media-type-" + mediaItem.clientId;
                      const mediaUrlInputId =
                        MEDIA_FOCUS_ID_PREFIX.url + mediaItem.clientId;
                      const mediaErrorId = mediaErrorIdPrefix + mediaItem.clientId;
                      const showMediaError = invalidMediaClientIds.has(
                        mediaItem.clientId
                      );
                      const isVideoItem =
                        mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video;
                      const legend = buildLegend(mediaIndex, mediaItems.length);

                      return (
                        <AnimatedListItem
                          className={joinClassNames(
                            styles.TribeStoryManagement__mediaItem,
                            draggedMediaClientId === mediaItem.clientId &&
                              styles["TribeStoryManagement__mediaItem--dragging"],
                            dropTargetClientId === mediaItem.clientId &&
                              draggedMediaClientId !== mediaItem.clientId &&
                              styles["TribeStoryManagement__mediaItem--dropTarget"]
                          )}
                          key={mediaItem.clientId}
                          onDragOver={(event) =>
                            handleMediaDragOver(event, mediaItem.clientId)
                          }
                          onDrop={(event) =>
                            handleMediaDrop(event, mediaItem.clientId)
                          }
                        >
                          <div className={styles.TribeStoryManagement__mediaItemContent}>
                          <div className={styles.TribeStoryManagement__mediaItemHeader}>
                            <div className={styles.TribeStoryManagement__mediaLegendGroup}>
                              {/* Pointer-only affordance: the arrow buttons are
                                  the keyboard and screen reader path. */}
                              <span
                                aria-hidden
                                className={styles.TribeStoryManagement__dragHandle}
                                draggable
                                onDragEnd={resetMediaDrag}
                                onDragStart={(event) =>
                                  handleMediaDragStart(event, mediaItem.clientId)
                                }
                                title={TRIBE_STORY_MANAGEMENT_COPY.dragHandleLabel}
                              >
                                <GripVerticalIcon />
                              </span>
                              <p className={styles.TribeStoryManagement__mediaLegend}>
                                {legend}
                              </p>
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
                                onClick={() => handleMoveMediaItem(mediaIndex, -1)}
                                size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
                                title={TRIBE_STORY_MANAGEMENT_COPY.moveUpLabel}
                                type={STORY_MANAGEMENT_REQUEST.buttonType}
                                variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
                              >
                                <ArrowUpIcon />
                              </Button>
                              <Button
                                aria-label={
                                  TRIBE_STORY_MANAGEMENT_COPY.moveDownLabel +
                                  MEDIA_LEGEND_SEPARATOR +
                                  legend
                                }
                                disabled={mediaIndex === mediaItems.length - 1}
                                id={
                                  MEDIA_FOCUS_ID_PREFIX.moveDown + mediaItem.clientId
                                }
                                onClick={() => handleMoveMediaItem(mediaIndex, 1)}
                                size={STORY_MANAGEMENT_REQUEST.iconButtonSize}
                                title={TRIBE_STORY_MANAGEMENT_COPY.moveDownLabel}
                                type={STORY_MANAGEMENT_REQUEST.buttonType}
                                variant={STORY_MANAGEMENT_REQUEST.outlineVariant}
                              >
                                <ArrowDownIcon />
                              </Button>
                              <Button
                                aria-label={TRIBE_STORY_MANAGEMENT_COPY.removeMediaLabel(
                                  legend
                                )}
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
                          </div>
                          <div className={styles.TribeStoryManagement__mediaItemBody}>
                            <MediaThumbnail
                              mediaItem={mediaItem}
                              position={mediaIndex + 1}
                            />
                            <div className={styles.TribeStoryManagement__mediaFields}>
                              <div className={styles.TribeStoryManagement__field}>
                                <label
                                  className={styles.TribeStoryManagement__fieldLabel}
                                  htmlFor={mediaTypeSelectId}
                                >
                                  {TRIBE_STORY_MANAGEMENT_COPY.mediaTypeLabel}
                                </label>
                                <Select
                                  onValueChange={(value) =>
                                    updateMediaItem(mediaItem.clientId, {
                                      mediaType: value as TribeStoryMediaType,
                                    })
                                  }
                                  value={mediaItem.mediaType}
                                >
                                  <SelectTrigger
                                    className={styles.TribeStoryManagement__selectTrigger}
                                    id={mediaTypeSelectId}
                                  >
                                    <SelectValue
                                      placeholder={
                                        TRIBE_STORY_MANAGEMENT_COPY.mediaTypePlaceholder
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={TRIBE_STORY_MEDIA_TYPE.image}>
                                      {TRIBE_STORY_MANAGEMENT_COPY.mediaTypeImage}
                                    </SelectItem>
                                    <SelectItem value={TRIBE_STORY_MEDIA_TYPE.video}>
                                      {TRIBE_STORY_MANAGEMENT_COPY.mediaTypeVideo}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
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
                                <div className={styles.TribeStoryManagement__uploadRow}>
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
                                  {!isVideoItem ? (
                                    <ImageUploadButton
                                      isUploading={uploadingTargets.has(
                                        mediaItem.clientId
                                      )}
                                      onFileSelected={(imageFile) => {
                                        void handleImageFileUpload(
                                          mediaItem.clientId,
                                          imageFile,
                                          (deliveryUrl) =>
                                            applyUploadedImageUrl(
                                              mediaItem.clientId,
                                              deliveryUrl
                                            )
                                        );
                                      }}
                                    />
                                  ) : null}
                                </div>
                                {showMediaError ? (
                                  <p
                                    className={styles.TribeStoryManagement__fieldError}
                                    id={mediaErrorId}
                                  >
                                    {isVideoItem
                                      ? TRIBE_STORY_MANAGEMENT_COPY.invalidVideoUrl
                                      : TRIBE_STORY_MANAGEMENT_COPY.invalidImageUrl}
                                  </p>
                                ) : !isVideoItem ? (
                                  <p className={styles.TribeStoryManagement__fieldNote}>
                                    {TRIBE_STORY_MANAGEMENT_COPY.uploadLimitHint(
                                      UPLOAD_MAX_MEGABYTES
                                    )}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          </div>
                        </AnimatedListItem>
                      );
                    })}
                    </AnimatePresence>
                  </ol>
                )}
                {addMediaButton}
                <p
                  aria-live="polite"
                  className={styles.TribeStoryManagement__visuallyHidden}
                >
                  {mediaAnnouncement}
                </p>
              </div>
            </section>

            <div className={styles.TribeStoryManagement__footer}>
              {validationMessage !== null && !showContentError ? (
                <p
                  className={styles.TribeStoryManagement__fieldError}
                  role={STORY_MANAGEMENT_ARIA.roleAlert}
                >
                  {validationMessage}
                </p>
              ) : null}
              <Button
                aria-busy={isSaving || undefined}
                className={styles.TribeStoryManagement__saveButton}
                disabled={isSaving || uploadingTargets.size > 0}
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
          </form>
        </TabsContent>

        <TabsContent value={STORY_MODE_TAB.preview}>
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
        </TabsContent>
      </Tabs>
    </section>
  );
}
