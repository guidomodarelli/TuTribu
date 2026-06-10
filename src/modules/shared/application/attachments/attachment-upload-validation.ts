import {
  ATTACHMENT_FILE,
  isAllowedAttachmentMimeType,
} from "@/src/constants/attachment-files";

const ATTACHMENT_ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks whether a value is a valid R2-backed attachment asset id.
 *
 * @param value - Candidate asset id.
 * @returns `true` when the value matches the UUID asset id contract.
 */
export function isAttachmentAssetId(value: string): boolean {
  return ATTACHMENT_ASSET_ID_PATTERN.test(value);
}

/**
 * Trims a raw attachment file name into its canonical persisted form.
 *
 * @param fileName - Raw file name coming from the upload request.
 * @returns The trimmed file name.
 */
export function normalizeAttachmentFileName(
  fileName: string | null | undefined
): string {
  return (fileName ?? "").trim();
}

/**
 * Validates the declared metadata of an attachment upload against the shared
 * attachment contract: non-blank bounded file name, allowlisted MIME type, and
 * a positive declared size within the ceiling. The real uploaded size is
 * verified again server-side before the file can be attached.
 *
 * @param declaration - Declared file name, MIME type, and size.
 * @returns `true` when the upload may be reserved.
 */
export function isValidAttachmentUploadDeclaration(declaration: {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
}): boolean {
  const fileName = normalizeAttachmentFileName(declaration.fileName);

  return (
    fileName.length > 0 &&
    fileName.length <= ATTACHMENT_FILE.maxFileNameLength &&
    isAllowedAttachmentMimeType(declaration.mimeType) &&
    Number.isFinite(declaration.fileSizeBytes) &&
    declaration.fileSizeBytes > 0 &&
    declaration.fileSizeBytes <= ATTACHMENT_FILE.maxFileSizeBytes
  );
}
