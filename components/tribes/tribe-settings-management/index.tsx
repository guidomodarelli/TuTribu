"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TribeIdentityResult } from "@/src/modules/tribes/application/results/tribe-identity-result";
import styles from "./styles.module.scss";

const TRIBE_SETTINGS_COPY = {
  coverAlt: "Vista previa de la portada",
  coverHint:
    "Imagen ancha que encabeza la página de historia y la tarjeta para compartir.",
  coverLabel: "Portada",
  description:
    "Identidad visual de la tribu. El logo acompaña el nombre en la barra lateral y en la página de historia.",
  fallbackSaveError: "No pudimos guardar los ajustes.",
  fallbackUploadError: "No pudimos subir la imagen. Intentá de nuevo.",
  identityHeading: "Identidad",
  invalidUploadTypeError: "Elegí un archivo de imagen (JPG, PNG, GIF o WebP).",
  invalidUrl: "Ingresá una URL válida que empiece con http:// o https://",
  logoAlt: "Vista previa del logo",
  logoHint: "Imagen cuadrada que identifica a la tribu en toda la aplicación.",
  logoLabel: "Logo",
  saveButton: "Guardar",
  saveSuccess: "Ajustes actualizados.",
  savingButton: "Guardando...",
  title: "Ajustes",
  uploadButton: "Subir imagen",
  uploadingButton: "Subiendo...",
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
const LOGO_PREVIEW_SIZE = 72;
const COVER_PREVIEW_SIZES = "(min-width: 64rem) 42rem, 100vw";

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
  const reserveResponse = await fetch(buildImagesEndpoint(tribeSlug), {
    method: SETTINGS_REQUEST.postMethod,
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
      reserveBody.message ?? TRIBE_SETTINGS_COPY.fallbackUploadError
    );
  }

  const formData = new FormData();

  formData.append(SETTINGS_REQUEST.fileFormField, imageFile);

  const uploadResponse = await fetch(reserveBody.uploadUrl, {
    body: formData,
    method: SETTINGS_REQUEST.postMethod,
  });

  if (!uploadResponse.ok) {
    void fetch(
      buildImagesEndpoint(tribeSlug) +
        SETTINGS_ROUTE.pathSeparator +
        reserveBody.imageId,
      { method: SETTINGS_REQUEST.deleteMethod }
    ).catch(() => {
      // Deliberate no-op: the reservation stays a draft and the sweep reclaims it.
    });

    throw new Error(TRIBE_SETTINGS_COPY.fallbackUploadError);
  }

  return reserveBody.deliveryUrl;
}

async function submitIdentityUpdate(
  tribeSlug: string,
  payload: { coverUrl: string | null; logoUrl: string | null }
): Promise<string> {
  const response = await fetch(buildSettingsEndpoint(tribeSlug), {
    body: JSON.stringify(payload),
    headers: {
      [SETTINGS_REQUEST.contentTypeHeader]: SETTINGS_REQUEST.jsonContentType,
    },
    method: SETTINGS_REQUEST.putMethod,
  });
  const responseBody = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? TRIBE_SETTINGS_COPY.fallbackSaveError
    );
  }

  return responseBody.message ?? TRIBE_SETTINGS_COPY.saveSuccess;
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
  const [uploadingTargets, setUploadingTargets] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const logoId = useId();
  const logoErrorId = useId();
  const coverId = useId();
  const coverErrorId = useId();
  const trimmedLogoUrl = logoUrl.trim();
  const trimmedCoverUrl = coverUrl.trim();

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
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error
          ? uploadError.message
          : TRIBE_SETTINGS_COPY.fallbackUploadError
      );
    } finally {
      setUploadingTarget(target, false);
    }
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
        saveError instanceof Error
          ? saveError.message
          : TRIBE_SETTINGS_COPY.fallbackSaveError
      );
    } finally {
      setIsSaving(false);
    }
  };
  const renderImageUploadButton = (
    target: string,
    applyDeliveryUrl: (deliveryUrl: string) => void
  ) => {
    const isUploading = uploadingTargets.has(target);

    return (
      <label className={styles.TribeSettingsManagement__uploadButton}>
        <UploadIcon className={styles.TribeSettingsManagement__uploadIcon} />
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
            void handleImageFileUpload(target, selectedFile, applyDeliveryUrl);
          }}
          type="file"
        />
      </label>
    );
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
        <h2 className={styles.TribeSettingsManagement__subtitle}>
          {TRIBE_SETTINGS_COPY.identityHeading}
        </h2>

        <div className={styles.TribeSettingsManagement__field}>
          <label
            className={styles.TribeSettingsManagement__fieldLabel}
            htmlFor={logoId}
          >
            {TRIBE_SETTINGS_COPY.logoLabel}
          </label>
          <span className={styles.TribeSettingsManagement__fieldHelper}>
            {TRIBE_SETTINGS_COPY.logoHint}
          </span>
          <div className={styles.TribeSettingsManagement__uploadRow}>
            <Input
              aria-describedby={isLogoInvalid ? logoErrorId : undefined}
              aria-invalid={isLogoInvalid}
              id={logoId}
              onChange={(event) => {
                setLogoUrl(event.target.value);
                setIsLogoInvalid(false);
              }}
              placeholder={TRIBE_SETTINGS_COPY.urlPlaceholder}
              value={logoUrl}
            />
            {renderImageUploadButton(UPLOAD_TARGET.logo, (deliveryUrl) => {
              setLogoUrl(deliveryUrl);
              setIsLogoInvalid(false);
            })}
          </div>
          {isLogoInvalid ? (
            <span
              className={styles.TribeSettingsManagement__fieldError}
              id={logoErrorId}
              role="alert"
            >
              {TRIBE_SETTINGS_COPY.invalidUrl}
            </span>
          ) : null}
          {trimmedLogoUrl && isHttpUrl(trimmedLogoUrl) ? (
            <Image
              alt={TRIBE_SETTINGS_COPY.logoAlt}
              className={styles.TribeSettingsManagement__logoPreview}
              height={LOGO_PREVIEW_SIZE}
              src={trimmedLogoUrl}
              unoptimized
              width={LOGO_PREVIEW_SIZE}
            />
          ) : null}
        </div>

        <div className={styles.TribeSettingsManagement__field}>
          <label
            className={styles.TribeSettingsManagement__fieldLabel}
            htmlFor={coverId}
          >
            {TRIBE_SETTINGS_COPY.coverLabel}
          </label>
          <span className={styles.TribeSettingsManagement__fieldHelper}>
            {TRIBE_SETTINGS_COPY.coverHint}
          </span>
          <div className={styles.TribeSettingsManagement__uploadRow}>
            <Input
              aria-describedby={isCoverInvalid ? coverErrorId : undefined}
              aria-invalid={isCoverInvalid}
              id={coverId}
              onChange={(event) => {
                setCoverUrl(event.target.value);
                setIsCoverInvalid(false);
              }}
              placeholder={TRIBE_SETTINGS_COPY.urlPlaceholder}
              value={coverUrl}
            />
            {renderImageUploadButton(UPLOAD_TARGET.cover, (deliveryUrl) => {
              setCoverUrl(deliveryUrl);
              setIsCoverInvalid(false);
            })}
          </div>
          {isCoverInvalid ? (
            <span
              className={styles.TribeSettingsManagement__fieldError}
              id={coverErrorId}
              role="alert"
            >
              {TRIBE_SETTINGS_COPY.invalidUrl}
            </span>
          ) : null}
          {trimmedCoverUrl && isHttpUrl(trimmedCoverUrl) ? (
            <div className={styles.TribeSettingsManagement__coverPreview}>
              <Image
                alt={TRIBE_SETTINGS_COPY.coverAlt}
                className={styles.TribeSettingsManagement__coverPreviewImage}
                fill
                sizes={COVER_PREVIEW_SIZES}
                src={trimmedCoverUrl}
                unoptimized
              />
            </div>
          ) : null}
        </div>

        <div className={styles.TribeSettingsManagement__actions}>
          <Button
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
