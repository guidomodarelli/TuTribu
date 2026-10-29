/**
 * Storage lifecycle shared by the R2-backed attachment file repositories
 * (message files and course lesson files).
 *
 * @module r2-attachment-file-storage
 */

import { ATTACHMENT_FILE } from "@/src/constants/attachment-files";
import {
  readCloudflareR2Environment,
  type CloudflareR2Environment,
} from "@/src/modules/shared/infrastructure/storage/cloudflare-r2-config";
import {
  createR2FileObjectStorage,
  type FileObjectStorage,
} from "@/src/modules/shared/infrastructure/storage/r2-file-object-storage";

export type AttachmentFileLogger = {
  warn: (entry: { message: string; metadata?: Record<string, unknown> }) => void;
};

export type AttachmentFileRepositoryOptions = {
  logger?: AttachmentFileLogger;
  storageFactory?: (environment: CloudflareR2Environment) => FileObjectStorage;
};

/** Attachment row whose uploaded object may still need its size verified. */
type UploadedAttachmentFileRow = {
  file_size_bytes: number | string;
  id: string;
  status: string;
  storage_key: string;
};

/**
 * Creates the R2 storage on first use, once its environment is configured.
 *
 * @param storageFactory - Builds the storage for a configured environment.
 * @returns Resolver returning the memoized storage, or null while R2 is not configured.
 */
export function createLazyFileObjectStorage(
  storageFactory: (
    environment: CloudflareR2Environment
  ) => FileObjectStorage = createR2FileObjectStorage
): () => FileObjectStorage | null {
  let storage: FileObjectStorage | undefined;

  return () => {
    if (storage) {
      return storage;
    }

    const environment = readCloudflareR2Environment();

    if (!environment) {
      return null;
    }

    storage = storageFactory(environment);

    return storage;
  };
}

/**
 * Verifies the size actually uploaded for each draft file. The presigned PUT
 * cannot enforce a size ceiling on R2, so this runs before a draft can ever be
 * attached; stored sizes that differ from the uploaded object are corrected.
 *
 * @param storage - R2 storage holding the uploaded objects.
 * @param files - Attachable file rows; only rows in `draftStatus` are checked.
 * @param draftStatus - Status of files whose upload is not yet verified.
 * @param updateFileSize - Persists the uploaded size of one file.
 * @returns False as soon as one draft is missing, empty or above the size limit.
 */
export async function verifyUploadedDraftFileSizes(
  storage: FileObjectStorage,
  files: UploadedAttachmentFileRow[],
  draftStatus: string,
  updateFileSize: (fileId: string, sizeBytes: number) => Promise<unknown>
): Promise<boolean> {
  for (const file of files) {
    if (file.status !== draftStatus) {
      continue;
    }

    const uploadedSizeBytes = await storage.getObjectSizeBytes(
      file.storage_key
    );

    if (
      uploadedSizeBytes === null ||
      uploadedSizeBytes <= 0 ||
      uploadedSizeBytes > ATTACHMENT_FILE.maxFileSizeBytes
    ) {
      return false;
    }

    if (uploadedSizeBytes !== Number(file.file_size_bytes)) {
      await updateFileSize(file.id, uploadedSizeBytes);
    }
  }

  return true;
}

/**
 * Deletes the remote object of each row, one at a time, and confirms the
 * deletion locally only after R2 accepted it.
 *
 * @param storage - R2 storage holding the objects.
 * @param rows - Rows whose objects must be removed.
 * @param handlers - Local confirmation and remote failure reporting.
 * @returns How many rows were confirmed and how many remote deletions failed.
 */
export async function deleteRemoteAttachmentObjects<
  T extends { storage_key: string },
>(
  storage: FileObjectStorage,
  rows: T[],
  handlers: {
    confirmDeleted: (row: T) => Promise<boolean>;
    onRemoteFailure: (row: T) => void;
  }
): Promise<{ confirmed: number; failures: number }> {
  let confirmed = 0;
  let failures = 0;

  for (const row of rows) {
    if (await storage.deleteObject(row.storage_key)) {
      if (await handlers.confirmDeleted(row)) {
        confirmed += 1;
      }
    } else {
      failures += 1;
      handlers.onRemoteFailure(row);
    }
  }

  return { confirmed, failures };
}
