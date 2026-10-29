import { UploadIcon } from "lucide-react";
import { buttonClassName } from "@golfo/ui";

const TRIBE_IMAGE_UPLOAD_BUTTON_COPY = {
  uploadButton: "Subir imagen",
  uploadingButton: "Subiendo...",
} as const;

const IMAGE_ACCEPT_TYPES = "image/*";

type TribeImageUploadButtonProps = {
  /** Announces the upload in progress, for hosts that expose it. */
  "aria-busy"?: boolean;
  /** Class of the button-looking label. */
  className: string;
  /** Class that visually hides the real file input. */
  inputClassName: string;
  isUploading: boolean;
  onFileSelected: (imageFile: File | undefined) => void;
};

/**
 * Outline button wrapping a visually hidden file input, so the upload control
 * looks like every other button while staying keyboard and screen-reader
 * accessible. The input is cleared after each pick, so choosing the same file
 * again still fires.
 * @param props - Classes, upload state and the file handler.
 * @returns The upload control.
 */
export function TribeImageUploadButton({
  "aria-busy": ariaBusy,
  className,
  inputClassName,
  isUploading,
  onFileSelected,
}: TribeImageUploadButtonProps) {
  return (
    <label
      className={buttonClassName({ variant: "secondary", className })}
      aria-busy={ariaBusy}
      data-disabled={isUploading ? true : undefined}
    >
      <UploadIcon />
      {isUploading
        ? TRIBE_IMAGE_UPLOAD_BUTTON_COPY.uploadingButton
        : TRIBE_IMAGE_UPLOAD_BUTTON_COPY.uploadButton}
      <input
        accept={IMAGE_ACCEPT_TYPES}
        className={inputClassName}
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
