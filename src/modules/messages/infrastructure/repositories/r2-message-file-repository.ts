import "server-only";

import { sql } from "drizzle-orm";

import { ATTACHMENT_FILE } from "@/src/constants/attachment-files";
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
import {
  readCloudflareR2Environment,
  type CloudflareR2Environment,
} from "@/src/modules/shared/infrastructure/storage/cloudflare-r2-config";
import {
  createR2FileObjectStorage,
  type FileObjectStorage,
} from "@/src/modules/shared/infrastructure/storage/r2-file-object-storage";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MessageFileLogger = {
  warn: (entry: { message: string; metadata?: Record<string, unknown> }) => void;
};

type MessageFileRepositoryOptions = {
  logger?: MessageFileLogger;
  storageFactory?: (environment: CloudflareR2Environment) => FileObjectStorage;
};

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

type PendingRemoteFileRow = {
  asset_id: string;
  storage_key: string;
};

type QueuedRemoteFileRow = {
  queue_id: string;
  storage_key: string;
};

type ReclaimedDraftsRow = {
  reclaimed: number | string;
};

type BooleanResultRow = {
  result: boolean | null;
};

const MESSAGE_FILE_LOG_RESULT = {
  failed: "failed",
} as const;

const MESSAGE_FILE_CLEANUP_LOG = {
  pendingFailed: "Message file remote cleanup failed",
  queuedFailed: "Queued file remote cleanup failed",
} as const;

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
export class R2MessageFileRepository implements MessageFileRepository {
  private readonly logger?: MessageFileLogger;
  private readonly storageFactory: (
    environment: CloudflareR2Environment
  ) => FileObjectStorage;
  private storage?: FileObjectStorage;

  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    options: MessageFileRepositoryOptions = {}
  ) {
    this.logger = options.logger;
    this.storageFactory = options.storageFactory ?? createR2FileObjectStorage;
  }

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
    const storage = this.resolveStorage();

    if (!storage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    const file = await this.findDownloadableFile(command);

    if (!file) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
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
    const storage = this.resolveStorage();

    if (!storage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    const file = await this.findDeletableFile(command);

    if (!file) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
    }

    if (!file.can_delete) {
      return { status: MESSAGE_MUTATION_STATUS.forbidden };
    }

    if (!(await this.markFilePendingDelete(file.id))) {
      this.logger?.warn({
        message: "Message file local pending delete mark failed",
        metadata: {
          assetId: file.id,
          result: MESSAGE_FILE_LOG_RESULT.failed,
          tribeSlug: command.tribeSlug,
        },
      });

      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    if (!(await storage.deleteObject(file.storage_key))) {
      const wasRestored = await this.restoreFileDeletionState({
        assetId: file.id,
        sortOrder: file.sort_order,
        status: file.status,
      });

      if (!wasRestored) {
        this.logger?.warn({
          message: "Message file local delete rollback failed",
          metadata: {
            assetId: file.id,
            result: MESSAGE_FILE_LOG_RESULT.failed,
            tribeSlug: command.tribeSlug,
          },
        });
      }

      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    if (!(await this.markFileDeleted(file.id))) {
      this.logger?.warn({
        message: "Message file local delete mark failed",
        metadata: {
          assetId: file.id,
          result: MESSAGE_FILE_LOG_RESULT.failed,
          tribeSlug: command.tribeSlug,
        },
      });

      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    return { status: MESSAGE_MUTATION_STATUS.deleted };
  }

  async deletePendingFiles(
    command: DeletePendingMessageFilesCommand
  ): Promise<void> {
    const storage = this.resolveStorage();

    if (!storage) {
      return;
    }

    const files = await this.findPendingDeleteFiles(command);

    for (const file of files) {
      if (await storage.deleteObject(file.storage_key)) {
        if (!(await this.markFileDeleted(file.id))) {
          this.logger?.warn({
            message: "Message file local delete mark failed",
            metadata: {
              assetId: file.id,
              result: MESSAGE_FILE_LOG_RESULT.failed,
              tribeSlug: command.tribeSlug,
            },
          });
        }
      } else {
        this.logger?.warn({
          message: "Message file remote delete failed",
          metadata: {
            assetId: file.id,
            result: MESSAGE_FILE_LOG_RESULT.failed,
            tribeSlug: command.tribeSlug,
          },
        });
      }
    }
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
    const result: CleanupOrphanMessageFilesResult = {
      reclaimedDrafts: 0,
      remoteDeletedPending: 0,
      remoteDeletedQueued: 0,
      remoteFailures: 0,
    };
    const storage = this.resolveStorage();

    if (!storage) {
      return result;
    }

    result.reclaimedDrafts = await this.reclaimAbandonedDrafts(
      command.abandonedDraftTtlHours,
      command.batchLimit
    );

    const pendingFiles = await this.listPendingRemoteDeletions(
      command.batchLimit,
      command.interactiveDeleteGraceMinutes
    );

    for (const file of pendingFiles) {
      if (await storage.deleteObject(file.storage_key)) {
        if (await this.confirmRemoteDeleted(file.asset_id)) {
          result.remoteDeletedPending += 1;
        }
      } else {
        result.remoteFailures += 1;
        this.logger?.warn({
          message: MESSAGE_FILE_CLEANUP_LOG.pendingFailed,
          metadata: {
            assetId: file.asset_id,
            result: MESSAGE_FILE_LOG_RESULT.failed,
          },
        });
      }
    }

    const queuedFiles = await this.listQueuedRemoteDeletions(
      command.batchLimit
    );

    for (const queued of queuedFiles) {
      if (await storage.deleteObject(queued.storage_key)) {
        if (await this.dequeueRemoteDeletion(queued.queue_id)) {
          result.remoteDeletedQueued += 1;
        }
      } else {
        result.remoteFailures += 1;
        this.logger?.warn({
          message: MESSAGE_FILE_CLEANUP_LOG.queuedFailed,
          metadata: {
            queueId: queued.queue_id,
            result: MESSAGE_FILE_LOG_RESULT.failed,
          },
        });
      }
    }

    return result;
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

    for (const file of files) {
      if (file.status !== MESSAGE_FILE_STATUS.draft) {
        continue;
      }

      // The presigned PUT cannot enforce a size ceiling on R2, so the actual
      // uploaded size is verified here, before the draft can ever be attached.
      const uploadedSizeBytes = await storage.getObjectSizeBytes(
        file.storage_key
      );

      if (
        uploadedSizeBytes === null ||
        uploadedSizeBytes <= 0 ||
        uploadedSizeBytes > ATTACHMENT_FILE.maxFileSizeBytes
      ) {
        return { status: MESSAGE_MUTATION_STATUS.invalidFile };
      }

      if (uploadedSizeBytes !== Number(file.file_size_bytes)) {
        await this.updateFileSize(file.id, uploadedSizeBytes);
      }
    }

    return {
      files: command.files,
      status: MESSAGE_FILE_PREPARATION_STATUS.ready,
    };
  }

  private resolveStorage(): FileObjectStorage | null {
    if (this.storage) {
      return this.storage;
    }

    const environment = readCloudflareR2Environment();

    if (!environment) {
      return null;
    }

    this.storage = this.storageFactory(environment);

    return this.storage;
  }

  private async confirmRemoteDeleted(assetId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.confirm_message_file_remote_deleted(${assetId}) as result
      `);

      return Boolean(
        ((result.rows?.[0] ?? null) as BooleanResultRow | null)?.result
      );
    });
  }

  private async dequeueRemoteDeletion(queueId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.delete_queued_remote_file_deletion(${queueId}) as result
      `);

      return Boolean(
        ((result.rows?.[0] ?? null) as BooleanResultRow | null)?.result
      );
    });
  }

  private async listPendingRemoteDeletions(
    batchLimit: number,
    interactiveDeleteGraceMinutes: number
  ): Promise<PendingRemoteFileRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select asset_id, storage_key
        from public.list_message_files_pending_remote_deletion(
          ${batchLimit},
          make_interval(mins => ${interactiveDeleteGraceMinutes})
        )
      `);

      return (result.rows ?? []) as PendingRemoteFileRow[];
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

      return (result.rows ?? []) as QueuedRemoteFileRow[];
    });
  }

  private async reclaimAbandonedDrafts(
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
      const reclaimed = ((result.rows?.[0] ?? null) as ReclaimedDraftsRow | null)
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

      return (result.rows ?? []) as AttachableMessageFileRow[];
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

      return (result.rows?.[0] ?? null) as DeletableMessageFileRow | null;
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
          and (
            message_files.status = ${MESSAGE_FILE_STATUS.attached}
            or (
              message_files.status = ${MESSAGE_FILE_STATUS.draft}
              and message_files.uploaded_by = ${command.userId}
            )
          )
        limit 1
      `);

      return (result.rows?.[0] ?? null) as DownloadableMessageFileRow | null;
    });
  }

  private async findPendingDeleteFiles(
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

      return (result.rows ?? []) as DeletableMessageFileRow[];
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

      return (result.rows?.[0] ?? null) as TargetTribeRow | null;
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

      return (result.rows?.[0] ?? null) as InsertedMessageFileRow | null;
    });
  }

  private async markFileDeleted(assetId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.message_files
        set status = ${MESSAGE_FILE_STATUS.deleted},
            updated_at = timezone('utc', now())
        where message_files.id = ${assetId}
        returning message_files.id as asset_id
      `);

      return Boolean(
        ((result.rows?.[0] ?? null) as MarkedMessageFileRow | null)?.asset_id
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
        ((result.rows?.[0] ?? null) as MarkedMessageFileRow | null)?.asset_id
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
  }: {
    assetId: string;
    sortOrder: number | null;
    status: string;
  }): Promise<boolean> {
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
        ((result.rows?.[0] ?? null) as MarkedMessageFileRow | null)?.asset_id
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
