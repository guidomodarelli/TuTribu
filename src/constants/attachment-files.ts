/**
 * Shared contract for user-uploaded file attachments (fogon messages and
 * course lessons). Both modules and their composers validate against the same
 * allowlist and size ceiling so a file accepted by the UI is never rejected by
 * the server for type or size.
 */

const BYTES_PER_KIBIBYTE = 1024;
const BYTES_PER_MEGABYTE = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;
const ATTACHMENT_FILE_MAX_MEGABYTES = 25;

export const ATTACHMENT_FILE = {
  maxFileNameLength: 160,
  maxFileSizeBytes: ATTACHMENT_FILE_MAX_MEGABYTES * BYTES_PER_MEGABYTE,
  maxMimeTypeLength: 255,
} as const;

/**
 * MIME types a user can attach. Documents, spreadsheets, presentations, plain
 * text, archives, images, and audio. Executables and scripts are excluded by
 * not being listed; anything outside this allowlist is rejected before a
 * draft row or signed upload URL is created.
 */
export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/zip",
  "application/x-zip-compressed",
  "application/epub+zip",
  "application/rtf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
] as const;

export type AttachmentAllowedMimeType =
  (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number];

/**
 * Value for the file input `accept` attribute, derived from the allowlist so
 * the picker and the server always agree.
 */
export const ATTACHMENT_FILE_INPUT_ACCEPT =
  ATTACHMENT_ALLOWED_MIME_TYPES.join(",");

/**
 * Checks a candidate MIME type against the attachment allowlist.
 *
 * @param mimeType - Raw MIME type reported by the browser or the request.
 * @returns `true` when the type is allowed for attachments.
 */
export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  return (ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(
    mimeType.trim().toLowerCase()
  );
}
