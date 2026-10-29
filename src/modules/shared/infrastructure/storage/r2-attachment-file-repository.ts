/**
 * Base of the R2-backed attachment file repositories (message files and
 * course lesson files): the lazily created storage, the failure logs, the
 * remote deletion of files a mutation marked `pending_delete`, and the sweep
 * of abandoned drafts and pending deletions. Each repository supplies its own
 * SQL through the abstract row operations.
 *
 * @module r2-attachment-file-repository
 */

import type { DatabaseExecutor } from "@/src/modules/shared/infrastructure/database/database-executor";
import {
  createLazyFileObjectStorage,
  deleteRemoteAttachmentObjects,
  type AttachmentFileLogger,
  type AttachmentFileRepositoryOptions,
} from "@/src/modules/shared/infrastructure/storage/r2-attachment-file-storage";
import type { FileObjectStorage } from "@/src/modules/shared/infrastructure/storage/r2-file-object-storage";

/** File row whose remote object waits for deletion after its local `pending_delete` mark. */
export type PendingRemoteAttachmentFileRow = {
  asset_id: string;
  storage_key: string;
};

/** Log copy of one attachment file repository. */
export type AttachmentFileLogCopy = {
  /** Metadata key that carries the file id in every log entry. */
  fileIdKey: "assetId" | "fileId";
  localDeleteMarkFailed: string;
  pendingCleanupFailed: string;
  remoteDeleteFailed: string;
};

/** Settings of one sweep over abandoned drafts and pending deletions. */
type PendingFilesSweepCommand = {
  abandonedDraftTtlHours: number;
  batchLimit: number;
  interactiveDeleteGraceMinutes: number;
};

/** Counters of the drafts reclaimed and the pending deletions drained by one sweep. */
type PendingFilesSweepResult = {
  reclaimedDrafts: number;
  remoteDeletedPending: number;
  remoteFailures: number;
};

const ATTACHMENT_FILE_LOG_RESULT = {
  failed: "failed",
} as const;

/**
 * R2 attachment file repository: the storage and remote deletion lifecycle
 * shared by every attachment table.
 */
export abstract class R2AttachmentFileRepository<
  PendingDeleteCommand extends { tribeSlug: string },
> {
  protected readonly logger?: AttachmentFileLogger;
  protected readonly resolveStorage: () => FileObjectStorage | null;
  protected abstract readonly logCopy: AttachmentFileLogCopy;

  constructor(
    protected readonly executeWithDatabase: DatabaseExecutor,
    options: AttachmentFileRepositoryOptions = {}
  ) {
    this.logger = options.logger;
    this.resolveStorage = createLazyFileObjectStorage(options.storageFactory);
  }

  /** Rows marked `pending_delete` by the mutation the command describes. */
  protected abstract findPendingDeleteFiles(
    command: PendingDeleteCommand
  ): Promise<{ id: string; storage_key: string }[]>;

  /** Marks one row `deleted` once its remote object is gone. */
  protected abstract markFileDeleted(fileId: string): Promise<boolean>;

  /** Confirms the remote deletion of one row drained by the sweep. */
  protected abstract confirmRemoteDeleted(fileId: string): Promise<boolean>;

  /** Rows marked `pending_delete` outside the interactive delete grace window. */
  protected abstract listPendingRemoteDeletions(
    batchLimit: number,
    interactiveDeleteGraceMinutes: number
  ): Promise<PendingRemoteAttachmentFileRow[]>;

  /** Moves a bounded batch of drafts past their TTL into `pending_delete`. */
  protected abstract reclaimAbandonedDrafts(
    ttlHours: number,
    batchLimit: number
  ): Promise<number>;

  async deletePendingFiles(command: PendingDeleteCommand): Promise<void> {
    const storage = this.resolveStorage();

    if (!storage) {
      return;
    }

    const files = await this.findPendingDeleteFiles(command);

    await deleteRemoteAttachmentObjects(storage, files, {
      confirmDeleted: async (file) => {
        const wasMarked = await this.markFileDeleted(file.id);

        if (!wasMarked) {
          this.warnFileFailure(
            this.logCopy.localDeleteMarkFailed,
            file.id,
            command.tribeSlug
          );
        }

        return wasMarked;
      },
      onRemoteFailure: (file) =>
        this.warnFileFailure(
          this.logCopy.remoteDeleteFailed,
          file.id,
          command.tribeSlug
        ),
    });
  }

  protected warnFileFailure(
    message: string,
    fileId: string,
    tribeSlug: string
  ): void {
    this.logger?.warn({
      message,
      metadata: {
        [this.logCopy.fileIdKey]: fileId,
        result: ATTACHMENT_FILE_LOG_RESULT.failed,
        tribeSlug,
      },
    });
  }

  /**
   * Reclaims abandoned drafts past their TTL into `pending_delete`, then
   * drains the `pending_delete` rows outside the interactive delete grace
   * window.
   *
   * @param storage - R2 storage holding the objects.
   * @param command - Abandoned-draft TTL, per-source batch size, and
   *   interactive delete grace window.
   * @returns Counters describing the work performed.
   */
  protected async sweepPendingFiles(
    storage: FileObjectStorage,
    command: PendingFilesSweepCommand
  ): Promise<PendingFilesSweepResult> {
    const reclaimedDrafts = await this.reclaimAbandonedDrafts(
      command.abandonedDraftTtlHours,
      command.batchLimit
    );

    const pendingFiles = await this.listPendingRemoteDeletions(
      command.batchLimit,
      command.interactiveDeleteGraceMinutes
    );

    const pendingDeletion = await deleteRemoteAttachmentObjects(
      storage,
      pendingFiles,
      {
        confirmDeleted: (file) => this.confirmRemoteDeleted(file.asset_id),
        onRemoteFailure: (file) =>
          this.logger?.warn({
            message: this.logCopy.pendingCleanupFailed,
            metadata: {
              [this.logCopy.fileIdKey]: file.asset_id,
              result: ATTACHMENT_FILE_LOG_RESULT.failed,
            },
          }),
      }
    );

    return {
      reclaimedDrafts,
      remoteDeletedPending: pendingDeletion.confirmed,
      remoteFailures: pendingDeletion.failures,
    };
  }
}
