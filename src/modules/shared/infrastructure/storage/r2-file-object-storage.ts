import "server-only";

import { Files, FilesError } from "files-sdk";
import { r2 } from "files-sdk/r2";

import type { CloudflareR2Environment } from "@/src/modules/shared/infrastructure/storage/cloudflare-r2-config";

/**
 * Default signed URL lifetimes for attachment objects.
 *
 * - `uploadSeconds`: how long the browser has to start the presigned PUT after
 *   reserving the draft row. Long enough for a slow connection to begin, short
 *   enough that a leaked URL goes stale quickly.
 * - `downloadSeconds`: how long the redirect target stays valid. Downloads
 *   start immediately after the authorized redirect, so the window stays tiny
 *   to keep a shared link from outliving the membership check that minted it.
 */
export const R2_SIGNED_URL_EXPIRATION = {
  downloadSeconds: 60,
  uploadSeconds: 600,
} as const;

export type SignedFileUploadTarget = {
  headers: Record<string, string>;
  uploadUrl: string;
};

export type CreateSignedUploadUrlInput = {
  contentType: string;
  expiresInSeconds?: number;
  storageKey: string;
};

export type CreateSignedDownloadUrlInput = {
  expiresInSeconds?: number;
  fileName: string;
  storageKey: string;
};

/**
 * Server-side contract for the R2 bucket that stores user file attachments.
 *
 * Infrastructure repositories (message files, course lesson files) depend on
 * this helper instead of wiring files-sdk themselves, so the bucket, signing
 * rules, and deletion semantics stay consistent across modules.
 */
export type FileObjectStorage = {
  /**
   * Presigns a browser PUT for a reserved storage key. The content type is
   * bound into the signature, so the client cannot upload under a different
   * MIME type than the one the draft row validated.
   */
  createSignedUploadUrl(
    input: CreateSignedUploadUrlInput
  ): Promise<SignedFileUploadTarget>;
  /**
   * Presigns a short-lived GET that forces `Content-Disposition: attachment`
   * with the stored file name, so user-uploaded content (HTML, SVG) can never
   * render inline at the bucket origin.
   */
  createSignedDownloadUrl(input: CreateSignedDownloadUrlInput): Promise<string>;
  /**
   * Deletes an object. Resolves `true` when the object is gone (deleted now or
   * already absent) and `false` on a transport/provider failure, so callers
   * can leave the row pending for the next sweep instead of throwing.
   */
  deleteObject(storageKey: string): Promise<boolean>;
  /**
   * Reads the stored object size without materializing the body. Resolves
   * `null` when the object does not exist (upload never completed).
   */
  getObjectSizeBytes(storageKey: string): Promise<number | null>;
};

const FILES_ERROR_CODE = {
  notFound: "NotFound",
} as const;

const SIGNED_UPLOAD_METHOD = {
  put: "PUT",
} as const;

const CONTENT_DISPOSITION_UNSAFE_CHARACTER = /[^ -~]/g;
const CONTENT_DISPOSITION_QUOTE_OR_BACKSLASH = /["\\]/g;
const CONTENT_DISPOSITION_REPLACEMENT = "_";

/**
 * Builds an `attachment` Content-Disposition header value carrying the
 * original file name: an ASCII-sanitized `filename` fallback plus the RFC 5987
 * `filename*` form so non-ASCII names survive on every browser.
 *
 * @param fileName - Stored file name chosen by the uploader.
 * @returns Header value safe to bind into a presigned URL.
 */
export function buildAttachmentContentDisposition(fileName: string): string {
  const asciiFallback = fileName
    .replace(CONTENT_DISPOSITION_UNSAFE_CHARACTER, CONTENT_DISPOSITION_REPLACEMENT)
    .replace(CONTENT_DISPOSITION_QUOTE_OR_BACKSLASH, CONTENT_DISPOSITION_REPLACEMENT);
  const utf8Encoded = encodeURIComponent(fileName);

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof FilesError && error.code === FILES_ERROR_CODE.notFound;
}

/**
 * Creates the files-sdk backed {@link FileObjectStorage} over the Cloudflare
 * R2 bucket configured for attachments. Uses HTTP (S3-compatible) credentials
 * so the same adapter works on Node and on the Cloudflare Workers runtime.
 *
 * @param environment - Validated R2 credentials and bucket name.
 * @returns Storage helper bound to the attachments bucket.
 */
export function createR2FileObjectStorage(
  environment: CloudflareR2Environment
): FileObjectStorage {
  const files = new Files({
    adapter: r2({
      accessKeyId: environment.accessKeyId,
      accountId: environment.accountId,
      bucket: environment.bucketName,
      secretAccessKey: environment.secretAccessKey,
    }),
  });

  return {
    async createSignedDownloadUrl({
      expiresInSeconds = R2_SIGNED_URL_EXPIRATION.downloadSeconds,
      fileName,
      storageKey,
    }: CreateSignedDownloadUrlInput): Promise<string> {
      return files.url(storageKey, {
        expiresIn: expiresInSeconds,
        responseContentDisposition: buildAttachmentContentDisposition(fileName),
      });
    },

    async createSignedUploadUrl({
      contentType,
      expiresInSeconds = R2_SIGNED_URL_EXPIRATION.uploadSeconds,
      storageKey,
    }: CreateSignedUploadUrlInput): Promise<SignedFileUploadTarget> {
      const signedUpload = await files.signedUploadUrl(storageKey, {
        contentType,
        expiresIn: expiresInSeconds,
      });

      return {
        headers:
          signedUpload.method === SIGNED_UPLOAD_METHOD.put
            ? (signedUpload.headers ?? {})
            : {},
        uploadUrl: signedUpload.url,
      };
    },

    async deleteObject(storageKey: string): Promise<boolean> {
      try {
        // files-sdk's delete already treats NotFound as success, so any throw
        // here is a real transport/provider failure the caller must retry.
        await files.delete(storageKey);

        return true;
      } catch {
        return false;
      }
    },

    async getObjectSizeBytes(storageKey: string): Promise<number | null> {
      try {
        const storedFile = await files.head(storageKey);

        return storedFile.size;
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
  };
}
