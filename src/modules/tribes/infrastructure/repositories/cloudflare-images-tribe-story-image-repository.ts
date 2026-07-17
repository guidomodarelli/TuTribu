import { sql } from "drizzle-orm";

import { TRIBE_STORY_IMAGE_UPLOAD_STATUS } from "@/src/modules/tribes/constants/tribe-story";
import {
  buildCloudflareImagesDeliveryUrl,
  readCloudflareImagesEnvironment,
} from "@/src/modules/shared/infrastructure/cloudflare/cloudflare-images-config";
import type {
  CreateTribeStoryImageUploadCommand,
  DeleteTribeStoryImageUploadCommand,
  TribeStoryImageCleanupSummary,
  TribeStoryImageRepository,
  TribeStoryImageUploadResult,
} from "@/src/modules/tribes/domain/repositories/tribe-story-image-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type StoryImageLogger = {
  error: (entry: {
    error?: unknown;
    message: string;
    metadata?: Record<string, unknown>;
  }) => void;
};

type StoryImageRepositoryOptions = {
  logger: StoryImageLogger;
};

type InsertedImageRow = {
  id: string;
};

type StoredImageRow = {
  cloudflare_image_id: string;
  id: string;
};

type CloudflareDirectUploadResponse = {
  result?: {
    id?: string;
    uploadURL?: string;
  };
  success?: boolean;
};

const CLOUDFLARE_IMAGES_API = {
  baseUrl: "https://api.cloudflare.com/client/v4/accounts",
  deleteNotFoundStatus: 404,
  directUploadPath: "images/v2/direct_upload",
  imagePath: "images/v1",
  requireSignedUrlsField: "requireSignedURLs",
  requireSignedUrlsValue: "false",
} as const;

const STORY_IMAGE_LOG = {
  directUploadFailedMessage: "Tribe story image direct upload creation failed",
  remoteDeleteFailedMessage: "Tribe story image remote delete failed",
} as const;

const STORY_IMAGE_STATUS_DRAFT = "draft";

/**
 * Ceiling of concurrent reserved drafts per tribe: enough for a whole gallery
 * plus logo and cover retries, low enough to stop a runaway reservation loop.
 */
const STORY_IMAGE_MAX_DRAFTS_PER_TRIBE = 20;

const STORY_IMAGE_CLEANUP_BATCH_SIZE = 50;

const POSTGRES_ERROR_CODE = {
  insufficientPrivilege: "42501",
  undefinedTable: "42P01",
} as const;

function readPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const postgresError = error as { cause?: unknown; code?: string };

  if (postgresError.code) {
    return postgresError.code;
  }

  return postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
    ? (postgresError.cause as { code?: string }).code
    : undefined;
}

export class CloudflareImagesTribeStoryImageRepository
  implements TribeStoryImageRepository
{
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly options: StoryImageRepositoryOptions
  ) {}

  async createUpload({
    tribeSlug,
  }: CreateTribeStoryImageUploadCommand): Promise<TribeStoryImageUploadResult> {
    const environment = readCloudflareImagesEnvironment();

    if (!environment) {
      return { status: TRIBE_STORY_IMAGE_UPLOAD_STATUS.invalidImage };
    }

    const directUpload = await this.createDirectUpload(
      environment.accountId,
      environment.apiToken,
      tribeSlug
    );

    if (!directUpload) {
      return { status: TRIBE_STORY_IMAGE_UPLOAD_STATUS.invalidImage };
    }

    const deliveryUrl = buildCloudflareImagesDeliveryUrl({
      accountHash: environment.accountHash,
      deliveryVariant: environment.deliveryVariant,
      imageId: directUpload.remoteImageId,
    });

    try {
      const insertedImageId = await this.insertDraftImage({
        cloudflareImageId: directUpload.remoteImageId,
        deliveryUrl,
        tribeSlug,
      });

      if (!insertedImageId) {
        await this.deleteRemoteImage(
          environment,
          directUpload.remoteImageId,
          tribeSlug
        );

        return { status: TRIBE_STORY_IMAGE_UPLOAD_STATUS.forbidden };
      }

      return {
        deliveryUrl,
        imageId: insertedImageId,
        status: TRIBE_STORY_IMAGE_UPLOAD_STATUS.created,
        uploadUrl: directUpload.uploadUrl,
      };
    } catch (insertError) {
      await this.deleteRemoteImage(
        environment,
        directUpload.remoteImageId,
        tribeSlug
      );

      const errorCode = readPostgresErrorCode(insertError);

      if (
        errorCode === POSTGRES_ERROR_CODE.insufficientPrivilege ||
        errorCode === POSTGRES_ERROR_CODE.undefinedTable
      ) {
        return { status: TRIBE_STORY_IMAGE_UPLOAD_STATUS.forbidden };
      }

      throw insertError;
    }
  }

  async deleteUpload({
    imageId,
    tribeSlug,
  }: DeleteTribeStoryImageUploadCommand): Promise<boolean> {
    const storedImage = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        delete from public.tribe_story_images
        using public.tribes
        where tribe_story_images.id = ${imageId}
          and tribes.id = tribe_story_images.tribe_id
          and tribes.slug = ${tribeSlug}
          and tribe_story_images.status = ${STORY_IMAGE_STATUS_DRAFT}
        returning
          tribe_story_images.id,
          tribe_story_images.cloudflare_image_id
      `);

      return (result.rows?.[0] ?? null) as StoredImageRow | null;
    }).catch((error: unknown) => {
      const errorCode = readPostgresErrorCode(error);

      if (
        errorCode === POSTGRES_ERROR_CODE.insufficientPrivilege ||
        errorCode === POSTGRES_ERROR_CODE.undefinedTable
      ) {
        return null;
      }

      throw error;
    });

    if (!storedImage) {
      return false;
    }

    const environment = readCloudflareImagesEnvironment();

    if (environment) {
      await this.deleteRemoteImage(
        environment,
        storedImage.cloudflare_image_id,
        tribeSlug
      );
    }

    return true;
  }

  /**
   * Maintenance sweep: reclaims abandoned drafts through the owner-only
   * definer function and deletes their remote Cloudflare assets best-effort.
   * Runs on the scheduled cron with the maintenance connection, never on
   * behalf of an end user.
   */
  async cleanupOrphanUploads(): Promise<TribeStoryImageCleanupSummary> {
    const reclaimedImages = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          reclaimed_images.id,
          reclaimed_images.cloudflare_image_id
        from public.reclaim_abandoned_tribe_story_images(
          ${STORY_IMAGE_CLEANUP_BATCH_SIZE}
        ) as reclaimed_images
      `);

      return (result.rows ?? []) as StoredImageRow[];
    });

    if (reclaimedImages.length === 0) {
      return { deletedCount: 0, failedRemoteDeleteCount: 0 };
    }

    const environment = readCloudflareImagesEnvironment();
    let failedRemoteDeleteCount = 0;

    if (environment) {
      for (const reclaimedImage of reclaimedImages) {
        const remoteDeleted = await this.deleteRemoteImageReporting(
          environment,
          reclaimedImage.cloudflare_image_id
        );

        if (!remoteDeleted) {
          failedRemoteDeleteCount += 1;
        }
      }
    } else {
      failedRemoteDeleteCount = reclaimedImages.length;
    }

    return {
      deletedCount: reclaimedImages.length,
      failedRemoteDeleteCount,
    };
  }

  private async deleteRemoteImageReporting(
    environment: { accountId: string; apiToken: string },
    remoteImageId: string
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${CLOUDFLARE_IMAGES_API.baseUrl}/${environment.accountId}/${CLOUDFLARE_IMAGES_API.imagePath}/${remoteImageId}`,
        {
          headers: {
            Authorization: `Bearer ${environment.apiToken}`,
          },
          method: "DELETE",
        }
      );

      return (
        response.ok ||
        response.status === CLOUDFLARE_IMAGES_API.deleteNotFoundStatus
      );
    } catch (deleteError) {
      this.options.logger.error({
        error: deleteError,
        message: STORY_IMAGE_LOG.remoteDeleteFailedMessage,
        metadata: { remoteImageId },
      });

      return false;
    }
  }

  private async insertDraftImage({
    cloudflareImageId,
    deliveryUrl,
    tribeSlug,
  }: {
    cloudflareImageId: string;
    deliveryUrl: string;
    tribeSlug: string;
  }): Promise<string | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        insert into public.tribe_story_images (
          tribe_id,
          cloudflare_image_id,
          delivery_url,
          status,
          created_at,
          updated_at
        )
        select
          tribes.id,
          ${cloudflareImageId},
          ${deliveryUrl},
          ${STORY_IMAGE_STATUS_DRAFT},
          timezone('utc', now()),
          timezone('utc', now())
        from public.tribes
        where tribes.slug = ${tribeSlug}
          and (
            select count(*)
            from public.tribe_story_images as reserved_drafts
            where reserved_drafts.tribe_id = tribes.id
              and reserved_drafts.status = ${STORY_IMAGE_STATUS_DRAFT}
          ) < ${STORY_IMAGE_MAX_DRAFTS_PER_TRIBE}
        returning tribe_story_images.id
      `);
      const row = (result.rows?.[0] ?? null) as InsertedImageRow | null;

      return row?.id ?? null;
    });
  }

  private async createDirectUpload(
    accountId: string,
    apiToken: string,
    tribeSlug: string
  ): Promise<{ remoteImageId: string; uploadUrl: string } | null> {
    try {
      const formData = new FormData();

      formData.append(
        CLOUDFLARE_IMAGES_API.requireSignedUrlsField,
        CLOUDFLARE_IMAGES_API.requireSignedUrlsValue
      );

      const response = await fetch(
        `${CLOUDFLARE_IMAGES_API.baseUrl}/${accountId}/${CLOUDFLARE_IMAGES_API.directUploadPath}`,
        {
          body: formData,
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
          method: "POST",
        }
      );
      const responseBody =
        (await response.json()) as CloudflareDirectUploadResponse;

      if (
        !response.ok ||
        !responseBody.result?.id ||
        !responseBody.result.uploadURL
      ) {
        this.options.logger.error({
          message: STORY_IMAGE_LOG.directUploadFailedMessage,
          metadata: {
            responseStatus: response.status,
            tribeSlug,
          },
        });

        return null;
      }

      return {
        remoteImageId: responseBody.result.id,
        uploadUrl: responseBody.result.uploadURL,
      };
    } catch (requestError) {
      this.options.logger.error({
        error: requestError,
        message: STORY_IMAGE_LOG.directUploadFailedMessage,
        metadata: { tribeSlug },
      });

      return null;
    }
  }

  private async deleteRemoteImage(
    environment: { accountId: string; apiToken: string },
    remoteImageId: string,
    tribeSlug: string
  ): Promise<void> {
    try {
      const response = await fetch(
        `${CLOUDFLARE_IMAGES_API.baseUrl}/${environment.accountId}/${CLOUDFLARE_IMAGES_API.imagePath}/${remoteImageId}`,
        {
          headers: {
            Authorization: `Bearer ${environment.apiToken}`,
          },
          method: "DELETE",
        }
      );

      if (
        !response.ok &&
        response.status !== CLOUDFLARE_IMAGES_API.deleteNotFoundStatus
      ) {
        this.options.logger.error({
          message: STORY_IMAGE_LOG.remoteDeleteFailedMessage,
          metadata: {
            responseStatus: response.status,
            tribeSlug,
          },
        });
      }
    } catch (deleteError) {
      this.options.logger.error({
        error: deleteError,
        message: STORY_IMAGE_LOG.remoteDeleteFailedMessage,
        metadata: { tribeSlug },
      });
    }
  }
}
