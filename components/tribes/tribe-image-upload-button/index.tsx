import { UploadIcon } from "lucide-react";
import { buttonClassName, cn } from "@golfo/ui";
import styles from "./styles.module.scss";

const TRIBE_IMAGE_UPLOAD_BUTTON_COPY = {
  uploadButton: "Subir imagen",
  uploadingButton: "Subiendo...",
} as const;

const IMAGE_ACCEPT_TYPES = "image/*";

type TribeImageUploadButtonProps = {
  /** Announces the upload in progress, for hosts that expose it. */
  "aria-busy"?: boolean;
  /** Extra class of the button-looking label, for layout owned by the host. */
  className?: string;
  isUploading: boolean;
  onFileSelected: (imageFile: File | undefined) => void;
};

/**
 * Outline button wrapping a visually hidden file input, so the upload control
 * looks like every other button while staying keyboard and screen-reader
 * accessible. The input is cleared after each pick, so choosing the same file
 * again still fires.
 * @param props - Host class, upload state and the file handler.
 * @returns The upload control.
 */
export function TribeImageUploadButton({
  "aria-busy": ariaBusy,
  className,
  isUploading,
  onFileSelected,
}: TribeImageUploadButtonProps) {
  return (
    <label
      className={buttonClassName({
        variant: "secondary",
        className: cn(styles.TribeImageUploadButton, className),
      })}
      aria-busy={ariaBusy}
      data-disabled={isUploading ? true : undefined}
    >
      <UploadIcon />
      {isUploading
        ? TRIBE_IMAGE_UPLOAD_BUTTON_COPY.uploadingButton
        : TRIBE_IMAGE_UPLOAD_BUTTON_COPY.uploadButton}
      <input
        accept={IMAGE_ACCEPT_TYPES}
        className={styles.TribeImageUploadButton__input}
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
