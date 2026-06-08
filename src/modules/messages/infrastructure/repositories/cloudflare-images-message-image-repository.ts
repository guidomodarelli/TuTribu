import "server-only";

import { sql } from "drizzle-orm";

import {
  MESSAGE_IMAGE_PREPARATION_STATUS,
  MESSAGE_IMAGE_STATUS,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import {
  buildCloudflareImagesDeliveryUrl,
  readCloudflareImagesEnvironment,
  type CloudflareImagesEnvironment,
} from "@/src/modules/shared/infrastructure/cloudflare/cloudflare-images-config";
import type {
  CreateMessageImageUploadCommand,
  DeleteMessageImageCommand,
  DeletePendingMessageImagesCommand,
  MessageImageDeletionResult,
  MessageImageRepository,
  MessageImageUploadCreationResult,
  PrepareMessageImagesForAttachmentCommand,
  PreparedMessageImageAttachmentResult,
} from "@/src/modules/messages/domain/repositories/message-image-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type Fetcher = typeof fetch;

type MessageImageLogger = {
  warn: (entry: { message: string; metadata?: Record<string, unknown> }) => void;
};

type TargetTribeRow = {
  can_write: boolean;
  tribe_id: string;
};

type DraftMessageImageRow = {
  cloudflare_image_id: string;
  id: string;
  message_id: string | null;
  status: string;
};

type InsertedMessageImageRow = {
  asset_id: string;
};

type DeletableMessageImageRow = {
  can_delete: boolean;
  cloudflare_image_id: string;
  id: string;
  sort_order: number | null;
  status: string;
};

type MarkedMessageImageRow = {
  asset_id: string;
};

type CloudflareDirectUploadResponse = {
  result?: {
    id?: string;
    uploadURL?: string;
  };
  success?: boolean;
};

type CloudflareImageDetailsResponse = {
  result?: {
    draft?: boolean;
    id?: string;
  };
  success?: boolean;
};

type CloudflareImagesRepositoryOptions = {
  fetcher?: Fetcher;
  imageReadinessRetry?: {
    delayMs: number;
    maxAttempts: number;
  };
  logger?: MessageImageLogger;
};

const CLOUDFLARE_IMAGES_API = {
  baseUrl: "https://api.cloudflare.com/client/v4/accounts",
  directUploadPath: "images/v2/direct_upload",
  imagePath: "images/v1",
} as const;

const DIRECT_UPLOAD_FORM = {
  requireSignedUrls: "requireSignedURLs",
  unsigned: "false",
} as const;

const HTTP_STATUS = {
  notFound: 404,
} as const;

const MESSAGE_IMAGE_LOG_RESULT = {
  failed: "failed",
} as const;

const MESSAGE_IMAGE_READINESS_RETRY = {
  delayMs: 500,
  maxAttempts: 6,
} as const;

function buildCloudflareImageApiUrl(
  environment: CloudflareImagesEnvironment,
  path: string
): string {
  return `${CLOUDFLARE_IMAGES_API.baseUrl}/${environment.accountId}/${path}`;
}

function createCloudflareHeaders(
  environment: CloudflareImagesEnvironment
): HeadersInit {
  return {
    Authorization: `Bearer ${environment.apiToken}`,
  };
}

function isCloudflareImageReady(
  response: CloudflareImageDetailsResponse
): boolean {
  return Boolean(
    response.success && response.result?.id && response.result.draft !== true
  );
}

export class CloudflareImagesMessageImageRepository
  implements MessageImageRepository
{
  private readonly fetcher: Fetcher;
  private readonly imageReadinessRetry: { delayMs: number; maxAttempts: number };
  private readonly logger?: MessageImageLogger;

  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    options: CloudflareImagesRepositoryOptions = {}
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.imageReadinessRetry =
      options.imageReadinessRetry ?? MESSAGE_IMAGE_READINESS_RETRY;
    this.logger = options.logger;
  }

  async createUpload(
    command: CreateMessageImageUploadCommand
  ): Promise<MessageImageUploadCreationResult> {
    const environment = readCloudflareImagesEnvironment();

    if (!environment) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    const targetTribe = await this.findWritableTribe(command);

    if (!targetTribe) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
    }

    if (!targetTribe.can_write) {
      return { status: MESSAGE_MUTATION_STATUS.forbidden };
    }

    const upload = await this.createDirectUpload(environment);

    if (!upload) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    const deliveryUrl = buildCloudflareImagesDeliveryUrl({
      accountHash: environment.accountHash,
      deliveryVariant: environment.deliveryVariant,
      imageId: upload.imageId,
    });
    let insertedAsset: InsertedMessageImageRow | null;

    try {
      insertedAsset = await this.insertDraftImage({
        cloudflareImageId: upload.imageId,
        deliveryUrl,
        tribeId: targetTribe.tribe_id,
        userId: command.userId,
      });
    } catch (error) {
      await this.deleteRemoteImage(environment, upload.imageId);
      throw error;
    }

    if (!insertedAsset) {
      await this.deleteRemoteImage(environment, upload.imageId);

      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    return {
      assetId: insertedAsset.asset_id,
      imageId: upload.imageId,
      status: MESSAGE_MUTATION_STATUS.created,
      uploadUrl: upload.uploadUrl,
    };
  }

  async deleteImage(
    command: DeleteMessageImageCommand
  ): Promise<MessageImageDeletionResult> {
    const environment = readCloudflareImagesEnvironment();

    if (!environment) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    const image = await this.findDeletableImage(command);

    if (!image) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
    }

    if (!image.can_delete) {
      return { status: MESSAGE_MUTATION_STATUS.forbidden };
    }

    if (!(await this.markImagePendingDelete(image.id))) {
      this.logger?.warn({
        message: "Message image local pending delete mark failed",
        metadata: {
          assetId: image.id,
          result: MESSAGE_IMAGE_LOG_RESULT.failed,
          tribeSlug: command.tribeSlug,
        },
      });

      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    if (!(await this.deleteRemoteImage(environment, image.cloudflare_image_id))) {
      const wasRestored = await this.restoreImageDeletionState({
        assetId: image.id,
        status: image.status,
        sortOrder: image.sort_order,
      });

      if (!wasRestored) {
        this.logger?.warn({
          message: "Message image local delete rollback failed",
          metadata: {
            assetId: image.id,
            result: MESSAGE_IMAGE_LOG_RESULT.failed,
            tribeSlug: command.tribeSlug,
          },
        });
      }

      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    if (!(await this.markImageDeleted(image.id))) {
      this.logger?.warn({
        message: "Message image local delete mark failed",
        metadata: {
          assetId: image.id,
          result: MESSAGE_IMAGE_LOG_RESULT.failed,
          tribeSlug: command.tribeSlug,
        },
      });

      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    return { status: MESSAGE_MUTATION_STATUS.deleted };
  }

  async deletePendingImages(
    command: DeletePendingMessageImagesCommand
  ): Promise<void> {
    const environment = readCloudflareImagesEnvironment();

    if (!environment) {
      return;
    }

    const images = await this.findPendingDeleteImages(command);

    for (const image of images) {
      const wasDeleted = await this.deleteRemoteImage(
        environment,
        image.cloudflare_image_id
      );

      if (wasDeleted) {
        const wasMarkedDeleted = await this.markImageDeleted(image.id);

        if (!wasMarkedDeleted) {
          this.logger?.warn({
            message: "Message image local delete mark failed",
            metadata: {
              assetId: image.id,
              result: MESSAGE_IMAGE_LOG_RESULT.failed,
              tribeSlug: command.tribeSlug,
            },
          });
        }
      } else {
        this.logger?.warn({
          message: "Message image remote delete failed",
          metadata: {
            assetId: image.id,
            result: MESSAGE_IMAGE_LOG_RESULT.failed,
            tribeSlug: command.tribeSlug,
          },
        });
      }
    }
  }

  async prepareForAttachment(
    command: PrepareMessageImagesForAttachmentCommand
  ): Promise<PreparedMessageImageAttachmentResult> {
    const environment = readCloudflareImagesEnvironment();

    if (!environment) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    const images = await this.findAttachableImages(command);

    if (images.length !== command.images.length) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    for (const image of images) {
      if (
        image.status === MESSAGE_IMAGE_STATUS.draft &&
        !(await this.waitForRemoteImageReady(
          environment,
          image.cloudflare_image_id
        ))
      ) {
        return { status: MESSAGE_MUTATION_STATUS.invalidImage };
      }
    }

    return {
      images: command.images,
      status: MESSAGE_IMAGE_PREPARATION_STATUS.ready,
    };
  }

  private async createDirectUpload(
    environment: CloudflareImagesEnvironment
  ): Promise<{ imageId: string; uploadUrl: string } | null> {
    const body = new FormData();
    body.set(DIRECT_UPLOAD_FORM.requireSignedUrls, DIRECT_UPLOAD_FORM.unsigned);

    const response = await this.fetcher(
      buildCloudflareImageApiUrl(
        environment,
        CLOUDFLARE_IMAGES_API.directUploadPath
      ),
      {
        body,
        headers: createCloudflareHeaders(environment),
        method: "POST",
      }
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as CloudflareDirectUploadResponse;
    const imageId = payload.result?.id;
    const uploadUrl = payload.result?.uploadURL;

    if (!payload.success || !imageId || !uploadUrl) {
      return null;
    }

    return { imageId, uploadUrl };
  }

  private async deleteRemoteImage(
    environment: CloudflareImagesEnvironment,
    imageId: string
  ): Promise<boolean> {
    const response = await this.fetcher(
      buildCloudflareImageApiUrl(
        environment,
        `${CLOUDFLARE_IMAGES_API.imagePath}/${imageId}`
      ),
      {
        headers: createCloudflareHeaders(environment),
        method: "DELETE",
      }
    ).catch(() => null);

    return Boolean(response?.ok || response?.status === HTTP_STATUS.notFound);
  }

  private async findAttachableImages(
    command: PrepareMessageImagesForAttachmentCommand
  ): Promise<DraftMessageImageRow[]> {
    if (command.images.length === 0) {
      return [];
    }

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          message_images.id,
          message_images.cloudflare_image_id,
          message_images.message_id,
          message_images.status
        from public.message_images
        inner join public.tribes
          on tribes.id = message_images.tribe_id
        where message_images.id = any(${sql.param(command.images.map((image) => image.assetId))}::uuid[])
          and tribes.slug = ${command.tribeSlug}
          and message_images.uploaded_by = ${command.userId}
          and (
            message_images.status = ${MESSAGE_IMAGE_STATUS.draft}
            or (
              ${command.messageId ?? null}::uuid is not null
              and message_images.status = ${MESSAGE_IMAGE_STATUS.attached}
              and message_images.message_id = ${command.messageId ?? null}
            )
          )
      `);

      return (result.rows ?? []) as DraftMessageImageRow[];
    });
  }

  private async findDeletableImage(
    command: DeleteMessageImageCommand
  ): Promise<DeletableMessageImageRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          message_images.id,
          message_images.cloudflare_image_id,
          message_images.sort_order,
          message_images.status,
          (
            public.is_active_tribe_member(message_images.tribe_id)
            and (
              message_images.uploaded_by = ${command.userId}
              or messages.author_id = ${command.userId}
            )
          ) as can_delete
        from public.message_images
        inner join public.tribes
          on tribes.id = message_images.tribe_id
        left join public.messages
          on messages.id = message_images.message_id
        where message_images.id = ${command.assetId}
          and tribes.slug = ${command.tribeSlug}
          and message_images.status in (
            ${MESSAGE_IMAGE_STATUS.draft},
            ${MESSAGE_IMAGE_STATUS.attached},
            ${MESSAGE_IMAGE_STATUS.pendingDelete}
          )
        limit 1
      `);

      return (result.rows?.[0] ?? null) as DeletableMessageImageRow | null;
    });
  }

  private async findPendingDeleteImages(
    command: DeletePendingMessageImagesCommand
  ): Promise<DeletableMessageImageRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          message_images.id,
          message_images.cloudflare_image_id,
          message_images.sort_order,
          message_images.status,
          true as can_delete
        from public.message_images
        left join public.messages
          on messages.id = message_images.message_id
        inner join public.tribes
          on tribes.id = message_images.tribe_id
        where (
            message_images.message_id = ${command.messageId}
            or message_images.deleted_message_id = ${command.messageId}
          )
          and tribes.slug = ${command.tribeSlug}
          and (
            message_images.uploaded_by = ${command.userId}
            or messages.author_id = ${command.userId}
            or public.can_pin_tribe_messages(message_images.tribe_id)
          )
          and message_images.status = ${MESSAGE_IMAGE_STATUS.pendingDelete}
      `);

      return (result.rows ?? []) as DeletableMessageImageRow[];
    });
  }

  private async findWritableTribe(
    command: CreateMessageImageUploadCommand
  ): Promise<TargetTribeRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribes.id as tribe_id,
          public.is_active_tribe_member(tribes.id) as can_write
        from public.tribes
        where tribes.slug = ${command.tribeSlug}
        limit 1
      `);

      return (result.rows?.[0] ?? null) as TargetTribeRow | null;
    });
  }

  private async insertDraftImage({
    cloudflareImageId,
    deliveryUrl,
    tribeId,
    userId,
  }: {
    cloudflareImageId: string;
    deliveryUrl: string;
    tribeId: string;
    userId: string;
  }): Promise<InsertedMessageImageRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        insert into public.message_images (
          tribe_id,
          uploaded_by,
          cloudflare_image_id,
          delivery_url,
          status,
          created_at,
          updated_at
        )
        values (
          ${tribeId},
          ${userId},
          ${cloudflareImageId},
          ${deliveryUrl},
          ${MESSAGE_IMAGE_STATUS.draft},
          timezone('utc', now()),
          timezone('utc', now())
        )
        returning message_images.id as asset_id
      `);

      return (result.rows?.[0] ?? null) as InsertedMessageImageRow | null;
    });
  }

  private async isRemoteImageReady(
    environment: CloudflareImagesEnvironment,
    imageId: string
  ): Promise<boolean> {
    const response = await this.fetcher(
      buildCloudflareImageApiUrl(
        environment,
        `${CLOUDFLARE_IMAGES_API.imagePath}/${imageId}`
      ),
      {
        headers: createCloudflareHeaders(environment),
        method: "GET",
      }
    );

    if (!response.ok) {
      return false;
    }

    return isCloudflareImageReady(
      (await response.json()) as CloudflareImageDetailsResponse
    );
  }

  /**
   * Waits briefly for Cloudflare to finish promoting a Direct Creator Upload
   * from draft to available before the message mutation attaches it.
   *
   * @param environment - Cloudflare Images configuration for the request.
   * @param imageId - Cloudflare image identifier to verify.
   * @returns Whether the remote image became attachable within the retry window.
   */
  private async waitForRemoteImageReady(
    environment: CloudflareImagesEnvironment,
    imageId: string
  ): Promise<boolean> {
    for (
      let attemptNumber = 1;
      attemptNumber <= this.imageReadinessRetry.maxAttempts;
      attemptNumber += 1
    ) {
      if (await this.isRemoteImageReady(environment, imageId)) {
        return true;
      }

      if (attemptNumber < this.imageReadinessRetry.maxAttempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, this.imageReadinessRetry.delayMs);
        });
      }
    }

    return false;
  }

  private async markImageDeleted(assetId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.message_images
        set status = ${MESSAGE_IMAGE_STATUS.deleted},
            updated_at = timezone('utc', now())
        where message_images.id = ${assetId}
        returning message_images.id as asset_id
      `);

      return Boolean(
        ((result.rows?.[0] ?? null) as MarkedMessageImageRow | null)?.asset_id
      );
    });
  }

  private async markImagePendingDelete(assetId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.message_images
        set status = ${MESSAGE_IMAGE_STATUS.pendingDelete},
            sort_order = null,
            updated_at = timezone('utc', now())
        where message_images.id = ${assetId}
        returning message_images.id as asset_id
      `);

      return Boolean(
        ((result.rows?.[0] ?? null) as MarkedMessageImageRow | null)?.asset_id
      );
    });
  }

  private async restoreImageDeletionState({
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
        update public.message_images
        set status = ${status},
            sort_order = ${sortOrder},
            updated_at = timezone('utc', now())
        where message_images.id = ${assetId}
        returning message_images.id as asset_id
      `);

      return Boolean(
        ((result.rows?.[0] ?? null) as MarkedMessageImageRow | null)?.asset_id
      );
    });
  }
}
