"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { ImageIcon, ImageOffIcon, UploadIcon } from "lucide-react";
import { toast, Button, Input } from "beez-ui";

import { PresenceSwap } from "@/components/motion/presence-swap";
import { joinClassNames } from "@/lib/motion/join-class-names";
import type { TribeIdentityResult } from "@/src/modules/tribes/application/results/tribe-identity-result";
import styles from "./styles.module.scss";

const TRIBE_SETTINGS_COPY = {
  coverAlt: "Vista previa de la portada",
  coverEmpty: "Sin portada",
  coverHint:
    "Imagen ancha, ideal en proporción 3:1. Encabeza la página de historia y la tarjeta para compartir.",
  coverLabel: "Portada",
  coverPreviewError: "No pudimos cargar la portada",
  description:
    "Identidad visual de la tribu. Se usa en la barra lateral, en la página de historia y al compartir el link.",
  fallbackSaveError: "No pudimos guardar los ajustes.",
  fallbackUploadError: "No pudimos subir la imagen. Intentá de nuevo.",
  identityDescription:
    "Subí una imagen desde tu computadora o pegá la URL de una que ya esté publicada.",
  identityHeading: "Identidad",
  invalidUploadTypeError: "Elegí un archivo de imagen (JPG, PNG, GIF o WebP).",
  invalidUrl: "Ingresá una URL válida que empiece con http:// o https://",
  logoAlt: "Vista previa del logo",
  logoEmpty: "Sin logo",
  logoHint: "Imagen cuadrada. Acompaña el nombre de la tribu en toda la aplicación.",
  logoLabel: "Logo",
  logoPreviewError: "No pudimos cargar el logo",
  saveButton: "Guardar",
  saveSuccess: "Ajustes actualizados.",
  savingButton: "Guardando...",
  title: "Ajustes",
  uploadButton: "Subir imagen",
  uploadSuccess: "Imagen subida. Guardá los cambios para aplicarla.",
  uploadingButton: "Subiendo...",
  uploadLimitHint: (maxMegabytes: number) =>
    `JPG, PNG, GIF o WebP de hasta ${maxMegabytes} MB.`,
  uploadTooLargeError: (maxMegabytes: number) =>
    `La imagen no puede superar los ${maxMegabytes} MB.`,
  urlPlaceholder: "https://...",
} as const;

const SETTINGS_ROUTE = {
  apiPrefix: "/api/tribes/",
  imagesSegment: "/images",
  pathSeparator: "/",
  settingsSegment: "/settings",
} as const;

const SETTINGS_REQUEST = {
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  fileFormField: "file",
  imageAcceptTypes: "image/*",
  jsonContentType: "application/json",
  outlineVariant: "outline",
  postMethod: "POST",
  putMethod: "PUT",
  submitButtonType: "submit",
} as const;

const UPLOAD_TARGET = {
  cover: "cover",
  logo: "logo",
} as const;

const URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

const UPLOAD_IMAGE_MIME_PREFIX = "image/";
const UPLOAD_MAX_MEGABYTES = 10;
const BYTES_PER_KIBIBYTE = 1024;
const UPLOAD_MAX_BYTES =
  UPLOAD_MAX_MEGABYTES * BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;
const LOGO_PREVIEW_SIZE = 96;
const COVER_PREVIEW_SIZES = "(min-width: 64rem) 36rem, 100vw";

/** States of an image preview box, used as presence keys for its cross-fade. */
const PREVIEW_STATE = {
  broken: "broken",
  empty: "empty",
  image: "image",
} as const;

type PreviewState = (typeof PREVIEW_STATE)[keyof typeof PREVIEW_STATE];

/** Presence keys for the note that swaps with the validation error under each field. */
const FIELD_FEEDBACK_KEY = {
  error: "error",
  note: "note",
} as const;

/** Error whose message is safe to show: it comes from the tribes API or a Spanish fallback. */
class TribeSettingsRequestError extends Error {
  override name = "TribeSettingsRequestError";
}

/**
 * Sends a settings request, turning network failures (reported by browsers in
 * English) into a safe Spanish error.
 * @param url - Endpoint to call.
 * @param init - Fetch options.
 * @param fallbackErrorMessage - Message shown when the network fails.
 * @returns The fetch response.
 * @throws {TribeSettingsRequestError} When the request cannot reach the server.
 */
async function fetchSettingsEndpoint(
  url: string,
  init: RequestInit,
  fallbackErrorMessage: string
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (networkError) {
    throw new TribeSettingsRequestError(fallbackErrorMessage, {
      cause: networkError,
    });
  }
}

/**
 * Picks the user-facing message of a failed settings operation.
 * @param error - Caught error.
 * @param fallbackMessage - Spanish fallback for unexpected failures.
 * @returns A safe message.
 */
function resolveSettingsErrorMessage(
  error: unknown,
  fallbackMessage: string
): string {
  return error instanceof TribeSettingsRequestError
    ? error.message
    : fallbackMessage;
}

/**
 * Resolves what a preview box shows for the current URL.
 * @param hasValidUrl - Whether the input holds an http(s) URL.
 * @param isBroken - Whether that URL already failed to load.
 * @returns The preview state.
 */
function resolvePreviewState(
  hasValidUrl: boolean,
  isBroken: boolean
): PreviewState {
  if (!hasValidUrl) {
    return PREVIEW_STATE.empty;
  }

  return isBroken ? PREVIEW_STATE.broken : PREVIEW_STATE.image;
}

type TribeSettingsManagementProps = {
  identity: TribeIdentityResult | null;
  tribeSlug: string;
};

function buildSettingsEndpoint(tribeSlug: string): string {
  return (
    SETTINGS_ROUTE.apiPrefix + tribeSlug + SETTINGS_ROUTE.settingsSegment
  );
}

function buildImagesEndpoint(tribeSlug: string): string {
  return SETTINGS_ROUTE.apiPrefix + tribeSlug + SETTINGS_ROUTE.imagesSegment;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    return (
      parsedUrl.protocol === URL_PROTOCOL.http ||
      parsedUrl.protocol === URL_PROTOCOL.https
    );
  } catch {
    return false;
  }
}

/**
 * Uploads an image through the leader-only direct upload flow and returns its
 * delivery URL, releasing the reservation when the binary upload fails.
 */
async function uploadTribeImage(
  tribeSlug: string,
  imageFile: File
): Promise<string> {
  const reserveResponse = await fetchSettingsEndpoint(
    buildImagesEndpoint(tribeSlug),
    { method: SETTINGS_REQUEST.postMethod },
    TRIBE_SETTINGS_COPY.fallbackUploadError
  );
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
    throw new TribeSettingsRequestError(
      reserveBody.message ?? TRIBE_SETTINGS_COPY.fallbackUploadError
    );
  }

  const formData = new FormData();

  formData.append(SETTINGS_REQUEST.fileFormField, imageFile);

  const uploadResponse = await fetchSettingsEndpoint(
    reserveBody.uploadUrl,
    { body: formData, method: SETTINGS_REQUEST.postMethod },
    TRIBE_SETTINGS_COPY.fallbackUploadError
  );

  if (!uploadResponse.ok) {
    void fetch(
      buildImagesEndpoint(tribeSlug) +
        SETTINGS_ROUTE.pathSeparator +
        reserveBody.imageId,
      { method: SETTINGS_REQUEST.deleteMethod }
    ).catch(() => {
      // Deliberate no-op: the reservation stays a draft and the sweep reclaims it.
    });

    throw new TribeSettingsRequestError(TRIBE_SETTINGS_COPY.fallbackUploadError);
  }

  return reserveBody.deliveryUrl;
}

async function submitIdentityUpdate(
  tribeSlug: string,
  payload: { coverUrl: string | null; logoUrl: string | null }
): Promise<string> {
  const response = await fetchSettingsEndpoint(
    buildSettingsEndpoint(tribeSlug),
    {
      body: JSON.stringify(payload),
      headers: {
        [SETTINGS_REQUEST.contentTypeHeader]: SETTINGS_REQUEST.jsonContentType,
      },
      method: SETTINGS_REQUEST.putMethod,
    },
    TRIBE_SETTINGS_COPY.fallbackSaveError
  );
  const responseBody = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new TribeSettingsRequestError(
      responseBody.message ?? TRIBE_SETTINGS_COPY.fallbackSaveError
    );
  }

  return responseBody.message ?? TRIBE_SETTINGS_COPY.saveSuccess;
}

type ImageUploadButtonProps = {
  isUploading: boolean;
  onFileSelected: (imageFile: File | undefined) => void;
};

/**
 * Outline button that wraps a visually hidden file input so the whole control
 * stays keyboard and screen-reader accessible while looking like a button.
 * The label mirrors the focus ring of the hidden input.
 */
function ImageUploadButton({ isUploading, onFileSelected }: ImageUploadButtonProps) {
  return (
    <Button
      asChild
      className={styles.TribeSettingsManagement__uploadButton}
      variant={SETTINGS_REQUEST.outlineVariant}
    >
      <label aria-busy={isUploading || undefined} data-disabled={isUploading ? true : undefined}>
        <UploadIcon />
        {isUploading
          ? TRIBE_SETTINGS_COPY.uploadingButton
          : TRIBE_SETTINGS_COPY.uploadButton}
        <input
          accept={SETTINGS_REQUEST.imageAcceptTypes}
          className={styles.TribeSettingsManagement__uploadInput}
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

/** Visual variant of an identity image field. */
type IdentityImageVariant = (typeof UPLOAD_TARGET)[keyof typeof UPLOAD_TARGET];

type IdentityImageFieldProps = {
  brokenPreviewLabel: string;
  emptyPreviewLabel: string;
  hint: string;
  isInvalid: boolean;
  isPreviewBroken: boolean;
  isUploading: boolean;
  label: string;
  onFileSelected: (imageFile: File | undefined) => void;
  onPreviewError: (failedUrl: string) => void;
  onUrlChange: (url: string) => void;
  previewAlt: string;
  url: string;
  variant: IdentityImageVariant;
};

/**
 * One identity image (logo or cover): live preview, URL input, upload button
 * and the validation message rendered next to the input.
 */
function IdentityImageField({
  brokenPreviewLabel,
  emptyPreviewLabel,
  hint,
  isInvalid,
  isPreviewBroken,
  isUploading,
  label,
  onFileSelected,
  onPreviewError,
  onUrlChange,
  previewAlt,
  url,
  variant,
}: IdentityImageFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const trimmedUrl = url.trim();
  const previewState = resolvePreviewState(
    trimmedUrl.length > 0 && isHttpUrl(trimmedUrl),
    isPreviewBroken
  );
  const isLogo = variant === UPLOAD_TARGET.logo;

  return (
    <div className={styles.TribeSettingsManagement__field}>
      <div className={styles.TribeSettingsManagement__fieldHeading}>
        <label
          className={styles.TribeSettingsManagement__fieldLabel}
          htmlFor={inputId}
        >
          {label}
        </label>
        <p className={styles.TribeSettingsManagement__fieldHelper} id={hintId}>
          {hint}
        </p>
      </div>
      <div
        className={joinClassNames(
          styles.TribeSettingsManagement__fieldBody,
          isLogo && styles["TribeSettingsManagement__fieldBody--logo"]
        )}
      >
        <div
          className={
            isLogo
              ? styles.TribeSettingsManagement__logoPreview
              : styles.TribeSettingsManagement__coverPreview
          }
        >
          <PresenceSwap
            className={styles.TribeSettingsManagement__previewSwap}
            presenceKey={previewState}
          >
            {previewState === PREVIEW_STATE.image ? (
              <Image
                alt={previewAlt}
                className={styles.TribeSettingsManagement__previewImage}
                onError={() => {
                  onPreviewError(trimmedUrl);
                }}
                src={trimmedUrl}
                unoptimized
                {...(isLogo
                  ? { height: LOGO_PREVIEW_SIZE, width: LOGO_PREVIEW_SIZE }
                  : { fill: true, sizes: COVER_PREVIEW_SIZES })}
              />
            ) : (
              <span className={styles.TribeSettingsManagement__previewEmpty}>
                {previewState === PREVIEW_STATE.broken ? (
                  <ImageOffIcon
                    aria-hidden
                    className={styles.TribeSettingsManagement__previewEmptyIcon}
                  />
                ) : (
                  <ImageIcon
                    aria-hidden
                    className={styles.TribeSettingsManagement__previewEmptyIcon}
                  />
                )}
                <span className={styles.TribeSettingsManagement__previewEmptyLabel}>
                  {previewState === PREVIEW_STATE.broken
                    ? brokenPreviewLabel
                    : emptyPreviewLabel}
                </span>
              </span>
            )}
          </PresenceSwap>
        </div>
        <div className={styles.TribeSettingsManagement__fieldControls}>
          <Input
            aria-describedby={isInvalid ? `${hintId} ${errorId}` : hintId}
            aria-invalid={isInvalid}
            disabled={isUploading}
            id={inputId}
            onChange={(event) => {
              onUrlChange(event.target.value);
            }}
            placeholder={TRIBE_SETTINGS_COPY.urlPlaceholder}
            value={url}
          />
          <ImageUploadButton
            isUploading={isUploading}
            onFileSelected={onFileSelected}
          />
          <PresenceSwap
            className={styles.TribeSettingsManagement__fieldFeedback}
            presenceKey={isInvalid ? FIELD_FEEDBACK_KEY.error : FIELD_FEEDBACK_KEY.note}
          >
            {isInvalid ? (
              <p
                className={styles.TribeSettingsManagement__fieldError}
                id={errorId}
                role="alert"
              >
                {TRIBE_SETTINGS_COPY.invalidUrl}
              </p>
            ) : (
              <p className={styles.TribeSettingsManagement__fieldNote}>
                {TRIBE_SETTINGS_COPY.uploadLimitHint(UPLOAD_MAX_MEGABYTES)}
              </p>
            )}
          </PresenceSwap>
        </div>
      </div>
    </div>
  );
}

/**
 * Leader-only tribe settings: the visual identity (logo and cover) that the
 * app chrome, the story page and the shareable card all read.
 */
export function TribeSettingsManagement({
  identity,
  tribeSlug,
}: TribeSettingsManagementProps) {
  const [logoUrl, setLogoUrl] = useState(identity?.logoUrl ?? "");
  const [coverUrl, setCoverUrl] = useState(identity?.coverUrl ?? "");
  const [isLogoInvalid, setIsLogoInvalid] = useState(false);
  const [isCoverInvalid, setIsCoverInvalid] = useState(false);
  const [brokenLogoUrl, setBrokenLogoUrl] = useState<string | null>(null);
  const [brokenCoverUrl, setBrokenCoverUrl] = useState<string | null>(null);
  const [uploadingTargets, setUploadingTargets] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const identityHeadingId = useId();
  const trimmedLogoUrl = logoUrl.trim();
  const trimmedCoverUrl = coverUrl.trim();
  const isUploadingLogo = uploadingTargets.has(UPLOAD_TARGET.logo);
  const isUploadingCover = uploadingTargets.has(UPLOAD_TARGET.cover);

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
    target: IdentityImageVariant,
    imageFile: File | undefined,
    applyDeliveryUrl: (deliveryUrl: string) => void
  ) => {
    if (!imageFile || uploadingTargets.has(target)) {
      return;
    }

    if (!imageFile.type.startsWith(UPLOAD_IMAGE_MIME_PREFIX)) {
      toast.error(TRIBE_SETTINGS_COPY.invalidUploadTypeError);
      return;
    }

    if (imageFile.size > UPLOAD_MAX_BYTES) {
      toast.error(
        TRIBE_SETTINGS_COPY.uploadTooLargeError(UPLOAD_MAX_MEGABYTES)
      );
      return;
    }

    setUploadingTarget(target, true);

    try {
      const deliveryUrl = await uploadTribeImage(tribeSlug, imageFile);

      applyDeliveryUrl(deliveryUrl);
      toast.success(TRIBE_SETTINGS_COPY.uploadSuccess);
    } catch (uploadError) {
      toast.error(
        resolveSettingsErrorMessage(
          uploadError,
          TRIBE_SETTINGS_COPY.fallbackUploadError
        )
      );
    } finally {
      setUploadingTarget(target, false);
    }
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const nextLogoInvalid =
      trimmedLogoUrl.length > 0 && !isHttpUrl(trimmedLogoUrl);
    const nextCoverInvalid =
      trimmedCoverUrl.length > 0 && !isHttpUrl(trimmedCoverUrl);

    setIsLogoInvalid(nextLogoInvalid);
    setIsCoverInvalid(nextCoverInvalid);

    if (nextLogoInvalid || nextCoverInvalid) {
      return;
    }

    setIsSaving(true);

    try {
      const message = await submitIdentityUpdate(tribeSlug, {
        coverUrl: trimmedCoverUrl.length > 0 ? trimmedCoverUrl : null,
        logoUrl: trimmedLogoUrl.length > 0 ? trimmedLogoUrl : null,
      });

      toast.success(message);
    } catch (saveError) {
      toast.error(
        resolveSettingsErrorMessage(
          saveError,
          TRIBE_SETTINGS_COPY.fallbackSaveError
        )
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={styles.TribeSettingsManagement}>
      <header className={styles.TribeSettingsManagement__header}>
        <h1 className={styles.TribeSettingsManagement__title}>
          {TRIBE_SETTINGS_COPY.title}
        </h1>
        <p className={styles.TribeSettingsManagement__description}>
          {TRIBE_SETTINGS_COPY.description}
        </p>
      </header>

      <form
        className={styles.TribeSettingsManagement__form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <section
          aria-labelledby={identityHeadingId}
          className={styles.TribeSettingsManagement__section}
        >
          <div className={styles.TribeSettingsManagement__sectionIntro}>
            <h2
              className={styles.TribeSettingsManagement__sectionTitle}
              id={identityHeadingId}
            >
              {TRIBE_SETTINGS_COPY.identityHeading}
            </h2>
            <p className={styles.TribeSettingsManagement__sectionDescription}>
              {TRIBE_SETTINGS_COPY.identityDescription}
            </p>
          </div>

          <div className={styles.TribeSettingsManagement__sectionFields}>
            <IdentityImageField
              brokenPreviewLabel={TRIBE_SETTINGS_COPY.logoPreviewError}
              emptyPreviewLabel={TRIBE_SETTINGS_COPY.logoEmpty}
              hint={TRIBE_SETTINGS_COPY.logoHint}
              isInvalid={isLogoInvalid}
              isPreviewBroken={brokenLogoUrl === trimmedLogoUrl}
              isUploading={isUploadingLogo}
              label={TRIBE_SETTINGS_COPY.logoLabel}
              onFileSelected={(imageFile) => {
                void handleImageFileUpload(
                  UPLOAD_TARGET.logo,
                  imageFile,
                  (deliveryUrl) => {
                    setLogoUrl(deliveryUrl);
                    setIsLogoInvalid(false);
                  }
                );
              }}
              onPreviewError={setBrokenLogoUrl}
              onUrlChange={(nextUrl) => {
                setLogoUrl(nextUrl);
                setIsLogoInvalid(false);
              }}
              previewAlt={TRIBE_SETTINGS_COPY.logoAlt}
              url={logoUrl}
              variant={UPLOAD_TARGET.logo}
            />
            <IdentityImageField
              brokenPreviewLabel={TRIBE_SETTINGS_COPY.coverPreviewError}
              emptyPreviewLabel={TRIBE_SETTINGS_COPY.coverEmpty}
              hint={TRIBE_SETTINGS_COPY.coverHint}
              isInvalid={isCoverInvalid}
              isPreviewBroken={brokenCoverUrl === trimmedCoverUrl}
              isUploading={isUploadingCover}
              label={TRIBE_SETTINGS_COPY.coverLabel}
              onFileSelected={(imageFile) => {
                void handleImageFileUpload(
                  UPLOAD_TARGET.cover,
                  imageFile,
                  (deliveryUrl) => {
                    setCoverUrl(deliveryUrl);
                    setIsCoverInvalid(false);
                  }
                );
              }}
              onPreviewError={setBrokenCoverUrl}
              onUrlChange={(nextUrl) => {
                setCoverUrl(nextUrl);
                setIsCoverInvalid(false);
              }}
              previewAlt={TRIBE_SETTINGS_COPY.coverAlt}
              url={coverUrl}
              variant={UPLOAD_TARGET.cover}
            />
          </div>
        </section>

        <div className={styles.TribeSettingsManagement__actions}>
          <Button
            aria-busy={isSaving || undefined}
            className={styles.TribeSettingsManagement__saveButton}
            disabled={isSaving || uploadingTargets.size > 0}
            type={SETTINGS_REQUEST.submitButtonType}
          >
            {isSaving
              ? TRIBE_SETTINGS_COPY.savingButton
              : TRIBE_SETTINGS_COPY.saveButton}
          </Button>
        </div>
      </form>
    </section>
  );
}
