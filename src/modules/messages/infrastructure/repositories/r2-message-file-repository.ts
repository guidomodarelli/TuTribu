import "server-only";

import { sql } from "drizzle-orm";

import {
  MESSAGE_FILE_PREPARATION_STATUS,
  MESSAGE_FILE_STATUS,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import type {
  CleanupOrphanMessageFilesCommand,
  CleanupOrphanMessageFilesResult,
  CreateMessageFileDownloadUrlCommand,
  CreateMessageFileUploadCommand,
  DeleteMessageFileCommand,
  DeletePendingMessageFilesCommand,
  MessageFileDeletionResult,
  MessageFileDownloadUrlResult,
  MessageFileRepository,
  MessageFileUploadCreationResult,
  PrepareMessageFilesForAttachmentCommand,
  PreparedMessageFileAttachmentResult,
} from "@/src/modules/messages/domain/repositories/message-file-repository";
import { selectBooleanResult } from "@/src/modules/shared/infrastructure/database/database-executor";
import {
  R2AttachmentFileRepository,
  type PendingRemoteAttachmentFileRow,
} from "@/src/modules/shared/infrastructure/storage/r2-attachment-file-repository";
import {
  deleteRemoteAttachmentObjects,
  verifyUploadedDraftFileSizes,
  type AttachmentDeletionRollback,
} from "@/src/modules/shared/infrastructure/storage/r2-attachment-file-storage";

type TargetTribeRow = {
  can_write: boolean;
  tribe_id: string;
};

type InsertedMessageFileRow = {
  asset_id: string;
};

type AttachableMessageFileRow = {
  file_size_bytes: number | string;
  id: string;
  message_id: string | null;
  status: string;
  storage_key: string;
};

type DeletableMessageFileRow = {
  can_delete: boolean;
  id: string;
  sort_order: number | null;
  status: string;
  storage_key: string;
};

type DownloadableMessageFileRow = {
  file_name: string;
  id: string;
  storage_key: string;
};

type MarkedMessageFileRow = {
  asset_id: string;
};

type QueuedRemoteFileRow = {
  queue_id: string;
  storage_key: string;
};

type ReclaimedDraftsRow = {
  reclaimed: number | string;
};

const MESSAGE_FILE_LOG_RESULT = {
  failed: "failed",
} as const;

const MESSAGE_FILE_LOG = {
  fileIdKey: "assetId",
  localDeleteMarkFailed: "Message file local delete mark failed",
  pendingCleanupFailed: "Message file remote cleanup failed",
  remoteDeleteFailed: "Message file remote delete failed",
} as const;

const QUEUED_FILE_CLEANUP_FAILED_LOG = "Queued file remote cleanup failed";

const MESSAGE_FILE_STORAGE_KEY_PREFIX = "message-files";

function buildMessageFileStorageKey(tribeId: string, assetId: string): string {
  return `${MESSAGE_FILE_STORAGE_KEY_PREFIX}/${tribeId}/${assetId}`;
}

/**
 * R2-backed implementation of {@link MessageFileRepository}.
 *
 * Draft rows reserve the storage key before the browser uploads through a
 * presigned PUT, so every remote object always has an owning row; the
 * scheduled sweep deletes any object whose row was abandoned or removed.
 * Database access runs through the request-scoped executor so RLS stays the
 * authorization boundary, and the R2 calls go through the shared files-sdk
 * storage helper.
 */
export class R2MessageFileRepository
  extends R2AttachmentFileRepository<DeletePendingMessageFilesCommand>
  implements MessageFileRepository
{
  protected readonly logCopy = MESSAGE_FILE_LOG;

  async createUpload(
    command: CreateMessageFileUploadCommand
  ): Promise<MessageFileUploadCreationResult> {
    const storage = this.resolveStorage();

    if (!storage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    const targetTribe = await this.findWritableTribe(command.tribeSlug);

    if (!targetTribe) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
    }

    if (!targetTribe.can_write) {
      return { status: MESSAGE_MUTATION_STATUS.forbidden };
    }

    const assetId = crypto.randomUUID();
    const storageKey = buildMessageFileStorageKey(
      targetTribe.tribe_id,
      assetId
    );
    // Signing has no remote side effect, so it runs before the row exists; an
    // unused signed URL simply expires, while a row without a signed URL would
    // be an immediate orphan.
    const signedUpload = await storage.createSignedUploadUrl({
      contentType: command.mimeType,
      storageKey,
    });
    const insertedAsset = await this.insertDraftFile({
      assetId,
      fileName: command.fileName,
      fileSizeBytes: command.fileSizeBytes,
      mimeType: command.mimeType,
      storageKey,
      tribeId: targetTribe.tribe_id,
      userId: command.userId,
    });

    if (!insertedAsset) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    return {
      assetId: insertedAsset.asset_id,
      status: MESSAGE_MUTATION_STATUS.created,
      uploadHeaders: signedUpload.headers,
      uploadUrl: signedUpload.uploadUrl,
    };
  }

  async createDownloadUrl(
    command: CreateMessageFileDownloadUrlCommand
  ): Promise<MessageFileDownloadUrlResult> {
    // Visibility is decided before storage is required, so a missing or
    // hidden file answers `notFound` even when R2 is not configured.
    const file = await this.findDownloadableFile(command);

    if (!file) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
    }

    const storage = this.resolveStorage();

    if (!storage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    return {
      downloadUrl: await storage.createSignedDownloadUrl({
        fileName: file.file_name,
        storageKey: file.storage_key,
      }),
      status: MESSAGE_MUTATION_STATUS.created,
    };
  }

  async deleteFile(
    command: DeleteMessageFileCommand
  ): Promise<MessageFileDeletionResult> {
    // Existence and permission are read-only checks, so they run before
    // storage is required; nothing is marked until R2 is available.
    const file = await this.findDeletableFile(command);

    if (!file) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
    }

    if (!file.can_delete) {
      return { status: MESSAGE_MUTATION_STATUS.forbidden };
    }

    const storage = this.resolveStorage();

    if (!storage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    if (!(await this.markFilePendingDelete(file.id))) {
      this.warnFileFailure(
        "Message file local pending delete mark failed",
        file.id,
        command.tribeSlug
      );

      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    if (!(await storage.deleteObject(file.storage_key))) {
      const wasRestored = await this.restoreFileDeletionState({
        assetId: file.id,
        sortOrder: file.sort_order,
        status: file.status,
      });

      if (!wasRestored) {
        this.warnFileFailure(
          "Message file local delete rollback failed",
          file.id,
          command.tribeSlug
        );
      }

      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    if (!(await this.markFileDeleted(file.id))) {
      this.warnFileFailure(
        MESSAGE_FILE_LOG.localDeleteMarkFailed,
        file.id,
        command.tribeSlug
      );

      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    return { status: MESSAGE_MUTATION_STATUS.deleted };
  }

  /**
   * Scheduled sweep that deletes from R2 every attachment object whose owning
   * row is gone or abandoned, mirroring the orphan-image sweep: a bounded
   * batch of abandoned drafts is reclaimed into `pending_delete`, then the
   * `pending_delete` rows outside the interactive grace window and the
   * decoupled CASCADE queue are drained. The queue carries storage keys from
   * message files AND course lesson files; this sweep is its single drainer.
   *
   * @param command - Abandoned-draft TTL, per-source batch size, and
   *   interactive delete grace window.
   * @returns Counters describing the work performed in this sweep.
   */
  async cleanupOrphanFiles(
    command: CleanupOrphanMessageFilesCommand
  ): Promise<CleanupOrphanMessageFilesResult> {
    const storage = this.resolveStorage();

    if (!storage) {
      return {
        reclaimedDrafts: 0,
        remoteDeletedPending: 0,
        remoteDeletedQueued: 0,
        remoteFailures: 0,
      };
    }

    const pending = await this.sweepPendingFiles(storage, command);

    const queuedFiles = await this.listQueuedRemoteDeletions(
      command.batchLimit
    );

    const queuedDeletion = await deleteRemoteAttachmentObjects(
      storage,
      queuedFiles,
      {
        confirmDeleted: (queued) => this.dequeueRemoteDeletion(queued.queue_id),
        onRemoteFailure: (queued) =>
          this.logger?.warn({
            message: QUEUED_FILE_CLEANUP_FAILED_LOG,
            metadata: {
              queueId: queued.queue_id,
              result: MESSAGE_FILE_LOG_RESULT.failed,
            },
          }),
      }
    );

    return {
      reclaimedDrafts: pending.reclaimedDrafts,
      remoteDeletedPending: pending.remoteDeletedPending,
      remoteDeletedQueued: queuedDeletion.confirmed,
      remoteFailures: pending.remoteFailures + queuedDeletion.failures,
    };
  }

  async prepareForAttachment(
    command: PrepareMessageFilesForAttachmentCommand
  ): Promise<PreparedMessageFileAttachmentResult> {
    const storage = this.resolveStorage();

    if (!storage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    const files = await this.findAttachableFiles(command);

    if (files.length !== command.files.length) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    const areUploadsValid = await verifyUploadedDraftFileSizes(
      storage,
      files,
      MESSAGE_FILE_STATUS.draft,
      (fileId, sizeBytes) => this.updateFileSize(fileId, sizeBytes)
    );

    if (!areUploadsValid) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    return {
      files: command.files,
      status: MESSAGE_FILE_PREPARATION_STATUS.ready,
    };
  }

  protected async confirmRemoteDeleted(assetId: string): Promise<boolean> {
    return selectBooleanResult(
      this.executeWithDatabase,
      sql`
        select public.confirm_message_file_remote_deleted(${assetId}) as result
      `
    );
  }

  private async dequeueRemoteDeletion(queueId: string): Promise<boolean> {
    return selectBooleanResult(
      this.executeWithDatabase,
      sql`
        select public.delete_queued_remote_file_deletion(${queueId}) as result
      `
    );
  }

  protected async listPendingRemoteDeletions(
    batchLimit: number,
    interactiveDeleteGraceMinutes: number
  ): Promise<PendingRemoteAttachmentFileRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select asset_id, storage_key
        from public.list_message_files_pending_remote_deletion(
          ${batchLimit},
          make_interval(mins => ${interactiveDeleteGraceMinutes})
        )
      `);

      return result.rows as PendingRemoteAttachmentFileRow[];
    });
  }

  private async listQueuedRemoteDeletions(
    batchLimit: number
  ): Promise<QueuedRemoteFileRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select queue_id, storage_key
        from public.list_queued_remote_file_deletions(${batchLimit})
      `);

      return result.rows as QueuedRemoteFileRow[];
    });
  }

  protected async reclaimAbandonedDrafts(
    ttlHours: number,
    batchLimit: number
  ): Promise<number> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.reclaim_abandoned_draft_message_files(
          make_interval(hours => ${ttlHours}),
          ${batchLimit}
        ) as reclaimed
      `);
      const reclaimed = ((result.rows[0] ?? null) as ReclaimedDraftsRow | null)
        ?.reclaimed;

      return Number(reclaimed ?? 0);
    });
  }

  private async findAttachableFiles(
    command: PrepareMessageFilesForAttachmentCommand
  ): Promise<AttachableMessageFileRow[]> {
    if (command.files.length === 0) {
      return [];
    }

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          message_files.id,
          message_files.file_size_bytes,
          message_files.message_id,
          message_files.status,
          message_files.storage_key
        from public.message_files
        inner join public.tribes
          on tribes.id = message_files.tribe_id
        where message_files.id = any(${sql.param(command.files.map((file) => file.assetId))}::uuid[])
          and tribes.slug = ${command.tribeSlug}
          and message_files.uploaded_by = ${command.userId}
          and (
            message_files.status = ${MESSAGE_FILE_STATUS.draft}
            or (
              ${command.messageId ?? null}::uuid is not null
              and message_files.status = ${MESSAGE_FILE_STATUS.attached}
              and message_files.message_id = ${command.messageId ?? null}
            )
          )
      `);

      return result.rows as AttachableMessageFileRow[];
    });
  }

  private async findDeletableFile(
    command: DeleteMessageFileCommand
  ): Promise<DeletableMessageFileRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          message_files.id,
          message_files.storage_key,
          message_files.sort_order,
          message_files.status,
          (
            public.is_active_tribe_member(message_files.tribe_id)
            and (
              message_files.uploaded_by = ${command.userId}
              or messages.author_id = ${command.userId}
            )
          ) as can_delete
        from public.message_files
        inner join public.tribes
          on tribes.id = message_files.tribe_id
        left join public.messages
          on messages.id = message_files.message_id
        where message_files.id = ${command.assetId}
          and tribes.slug = ${command.tribeSlug}
          and message_files.status in (
            ${MESSAGE_FILE_STATUS.draft},
            ${MESSAGE_FILE_STATUS.attached},
            ${MESSAGE_FILE_STATUS.pendingDelete}
          )
        limit 1
      `);

      return (result.rows[0] ?? null) as DeletableMessageFileRow | null;
    });
  }

  private async findDownloadableFile(
    command: CreateMessageFileDownloadUrlCommand
  ): Promise<DownloadableMessageFileRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          message_files.id,
          message_files.file_name,
          message_files.storage_key
        from public.message_files
        inner join public.tribes
          on tribes.id = message_files.tribe_id
        where message_files.id = ${command.assetId}
          and tribes.slug = ${command.tribeSlug}
          -- The runtime role bypasses RLS: repeat the read rule before
          -- signing a URL. An attached file follows its message's channel; a
          -- draft belongs to its uploader while they can still write.
          and (
            (
              message_files.status = ${MESSAGE_FILE_STATUS.attached}
              and public.can_read_tribe_message(message_files.message_id)
            )
            or (
              message_files.status = ${MESSAGE_FILE_STATUS.draft}
              and message_files.uploaded_by = ${command.userId}
              and public.is_active_tribe_member(tribes.id)
            )
          )
        limit 1
      `);

      return (result.rows[0] ?? null) as DownloadableMessageFileRow | null;
    });
  }

  protected async findPendingDeleteFiles(
    command: DeletePendingMessageFilesCommand
  ): Promise<DeletableMessageFileRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          message_files.id,
          message_files.storage_key,
          message_files.sort_order,
          message_files.status,
          true as can_delete
        from public.message_files
        left join public.messages
          on messages.id = message_files.message_id
        inner join public.tribes
          on tribes.id = message_files.tribe_id
        where (
            message_files.message_id = ${command.messageId}
            or message_files.deleted_message_id = ${command.messageId}
          )
          and tribes.slug = ${command.tribeSlug}
          and (
            message_files.uploaded_by = ${command.userId}
            or messages.author_id = ${command.userId}
            or public.can_pin_tribe_messages(message_files.tribe_id)
          )
          and message_files.status = ${MESSAGE_FILE_STATUS.pendingDelete}
      `);

      return result.rows as DeletableMessageFileRow[];
    });
  }

  private async findWritableTribe(
    tribeSlug: string
  ): Promise<TargetTribeRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribes.id as tribe_id,
          public.is_active_tribe_member(tribes.id) as can_write
        from public.tribes
        where tribes.slug = ${tribeSlug}
        limit 1
      `);

      return (result.rows[0] ?? null) as TargetTribeRow | null;
    });
  }

  private async insertDraftFile({
    assetId,
    fileName,
    fileSizeBytes,
    mimeType,
    storageKey,
    tribeId,
    userId,
  }: {
    assetId: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    storageKey: string;
    tribeId: string;
    userId: string;
  }): Promise<InsertedMessageFileRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        insert into public.message_files (
          id,
          tribe_id,
          uploaded_by,
          storage_key,
          file_name,
          mime_type,
          file_size_bytes,
          status,
          created_at,
          updated_at
        )
        values (
          ${assetId},
          ${tribeId},
          ${userId},
          ${storageKey},
          ${fileName},
          ${mimeType},
          ${fileSizeBytes},
          ${MESSAGE_FILE_STATUS.draft},
          timezone('utc', now()),
          timezone('utc', now())
        )
        returning message_files.id as asset_id
      `);

      return (result.rows[0] ?? null) as InsertedMessageFileRow | null;
    });
  }

  protected async markFileDeleted(assetId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.message_files
        set status = ${MESSAGE_FILE_STATUS.deleted},
            updated_at = timezone('utc', now())
        where message_files.id = ${assetId}
        returning message_files.id as asset_id
      `);

      return Boolean(
        ((result.rows[0] ?? null) as MarkedMessageFileRow | null)?.asset_id
      );
    });
  }

  private async markFilePendingDelete(assetId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.message_files
        set status = ${MESSAGE_FILE_STATUS.pendingDelete},
            sort_order = null,
            updated_at = timezone('utc', now())
        where message_files.id = ${assetId}
        returning message_files.id as asset_id
      `);

      return Boolean(
        ((result.rows[0] ?? null) as MarkedMessageFileRow | null)?.asset_id
      );
    });
  }

  /**
   * Rolls a message file back to its pre-deletion state after a transient
   * remote delete failure, but only while the row is still `pending_delete`,
   * so a concurrent sweep that already confirmed the remote delete is never
   * overwritten with a visible row pointing at a deleted object.
   *
   * @returns Whether the row was still `pending_delete` and was restored.
   */
  private async restoreFileDeletionState({
    assetId,
    sortOrder,
    status,
  }: AttachmentDeletionRollback): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.message_files
        set status = ${status},
            sort_order = ${sortOrder},
            updated_at = timezone('utc', now())
        where message_files.id = ${assetId}
          and message_files.status = ${MESSAGE_FILE_STATUS.pendingDelete}
        returning message_files.id as asset_id
      `);

      return Boolean(
        ((result.rows[0] ?? null) as MarkedMessageFileRow | null)?.asset_id
      );
    });
  }

  private async updateFileSize(
    assetId: string,
    fileSizeBytes: number
  ): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public.message_files
        set file_size_bytes = ${fileSizeBytes},
            updated_at = timezone('utc', now())
        where message_files.id = ${assetId}
      `);
    });
  }
}
