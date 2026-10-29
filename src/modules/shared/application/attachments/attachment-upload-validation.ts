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

/**
 * Orders attachment drafts by the position the author arranged, rejecting
 * more than `maxCount` drafts and malformed or repeated asset ids.
 *
 * @param drafts - Raw file drafts from the payload.
 * @param maxCount - Maximum number of attachments the owner accepts.
 * @returns The normalized drafts, or null when any draft is invalid.
 */
export function normalizeAttachmentFileDrafts(
  drafts: { assetId: string }[] | null | undefined,
  maxCount: number
): { assetId: string; sortOrder: number }[] | null {
  const rawDrafts = drafts ?? [];

  if (rawDrafts.length > maxCount) {
    return null;
  }

  const files: { assetId: string; sortOrder: number }[] = [];
  const seenAssetIds = new Set<string>();

  for (const draft of rawDrafts) {
    const assetId = draft.assetId.trim();

    if (!isAttachmentAssetId(assetId) || seenAssetIds.has(assetId)) {
      return null;
    }

    seenAssetIds.add(assetId);
    files.push({ assetId, sortOrder: files.length });
  }

  return files;
}

/**
 * Normalizes an upload reservation request and validates its declared metadata.
 *
 * @param command - Raw upload request of the authenticated author.
 * @returns The canonical reservation, or null when the declaration is invalid.
 */
export function normalizeAttachmentUploadRequest(command: {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  tribeSlug: string;
  userId: string;
}): {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  tribeSlug: string;
  userId: string;
} | null {
  const fileName = normalizeAttachmentFileName(command.fileName);
  const mimeType = command.mimeType.trim().toLowerCase();

  if (
    !isValidAttachmentUploadDeclaration({
      fileName,
      fileSizeBytes: command.fileSizeBytes,
      mimeType,
    })
  ) {
    return null;
  }

  return {
    fileName,
    fileSizeBytes: command.fileSizeBytes,
    mimeType,
    tribeSlug: command.tribeSlug.trim(),
    userId: command.userId.trim(),
  };
}
