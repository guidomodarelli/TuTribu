/**
 * @file Composer draft handlers: reset, validation, payloads, and image, file, and video drafts.
 */
import type { ChangeEvent } from "react";
import { toast } from "@golfo/ui";
import { ATTACHMENT_FILE, isAllowedAttachmentMimeType } from "@/src/constants/attachment-files";
import { MESSAGE_FILES, MESSAGE_MEDIA, MESSAGE_MEDIA_KIND } from "@/src/modules/messages/constants/message-round";
import type { MessageMediaDraftCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import {
  COMPOSER_BODY_SCROLL,
  COMPOSER_FILE_UPLOAD_ERROR_COPIES,
  COMPOSER_FILE_UPLOAD_STATUS,
  COMPOSER_IMAGE_UPLOAD_ERROR_COPIES,
  COMPOSER_IMAGE_UPLOAD_STATUS,
  type ComposerFileDraft,
  type ComposerImageDraft,
  findInvalidVideoDraft,
  findUnfinishedUploadDraft,
  getBlockTargetByKey,
  includesAnyError,
  MESSAGE_COMPOSER_FIELD_ANCHOR_KEY,
  MESSAGE_COMPOSER_POLL_ERROR_COPIES,
  type MessageFileUploadResponse,
  type MessageImageUploadResponse,
  type ResetMessageComposerOptions,
  revokeMessageImageDraftPreviewUrls,
  revokeMessageImagePreviewUrl,
  submitJsonRequest,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_ENDPOINT,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_OPTIMISTIC,
  TRIBE_ROUND_POLL,
} from "./tribe-round-shared";
import type { TribeRoundController } from "./use-tribe-round-controller";

const cleanupTransientMessageImageDrafts = (controller: TribeRoundController, 
  imageDrafts: ComposerImageDraft[]
) => {
  const persistingMessageImageAssetIds =
    controller.persistingMessageImageAssetIdsRef.current;

  imageDrafts
    .filter(
      (imageDraft) =>
        !imageDraft.isPersisted &&
        (!imageDraft.assetId ||
          !persistingMessageImageAssetIds.has(imageDraft.assetId))
    )
    .forEach((imageDraft) => {
      controller.discardedMessageImageLocalIdsRef.current.add(imageDraft.localId);

      if (imageDraft.assetId) {
        controller.deleteMessageImageAsset(imageDraft.assetId);
      }
    });
};

/**
 * Discards every transient file draft that is not being persisted by an
 * in-flight message submission: drafts still uploading are marked discarded
 * so their upload callback cleans the reserved asset, and drafts with a
 * reserved asset get a best-effort server-side deletion.
 */
const cleanupTransientMessageFileDrafts = (controller: TribeRoundController, 
  transientCandidateFileDrafts: ComposerFileDraft[]
) => {
  const persistingMessageFileAssetIds =
    controller.persistingMessageFileAssetIdsRef.current;

  transientCandidateFileDrafts
    .filter(
      (fileDraft) =>
        !fileDraft.isPersisted &&
        (!fileDraft.assetId ||
          !persistingMessageFileAssetIds.has(fileDraft.assetId))
    )
    .forEach((fileDraft) => {
      controller.discardedMessageFileLocalIdsRef.current.add(fileDraft.localId);

      if (fileDraft.assetId) {
        controller.deleteMessageFileAsset(fileDraft.assetId);
      }
    });
};

export const resetMessageComposer = (controller: TribeRoundController, {
  shouldCleanupTransientUploads = false,
  shouldRevokeImagePreviewUrls = true,
}: ResetMessageComposerOptions = {}) => {
  if (shouldCleanupTransientUploads) {
    cleanupTransientMessageImageDrafts(controller, controller.messageImageDrafts);
    cleanupTransientMessageFileDrafts(controller, controller.fileDrafts);
  }

  if (shouldRevokeImagePreviewUrls) {
    revokeMessageImageDraftPreviewUrls(controller.messageImageDrafts);
  }
  controller.currentMessageImageDraftsRef.current = [];
  controller.setMessageTitle("");
  controller.messageEditor.reset();
  controller.setIsPollComposerEnabled(false);
  controller.setPollOptions(
    Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
  );
  controller.setPollAllowsMultipleVotes(false);
  controller.setMediaDrafts([]);
  controller.setFileDrafts([]);
  controller.setSelectedChannelId("");
  controller.setMessageComposerErrors([]);
  controller.setEditingMessageId(null);
};

export const handleMessageComposerOpenChange = (controller: TribeRoundController, isOpen: boolean) => {
  if (!isOpen) {
    resetMessageComposer(controller, { shouldCleanupTransientUploads: true });
  }

  controller.setIsMessageComposerOpen(isOpen);
};

export const buildMessageMediaPayload = (controller: TribeRoundController): MessageMediaDraftCommand[] =>
  controller.mediaDrafts.flatMap<MessageMediaDraftCommand>((mediaDraft) => {
    if (mediaDraft.kind === MESSAGE_MEDIA_KIND.image) {
      if (
        mediaDraft.status !== COMPOSER_IMAGE_UPLOAD_STATUS.uploaded ||
        !mediaDraft.assetId
      ) {
        return [];
      }

      return [
        {
          altText: mediaDraft.altText,
          assetId: mediaDraft.assetId,
          kind: MESSAGE_MEDIA_KIND.image,
        },
      ];
    }

    const trimmedUrl = mediaDraft.url.trim();

    if (trimmedUrl.length === 0) {
      return [];
    }

    return [{ kind: MESSAGE_MEDIA_KIND.video, url: trimmedUrl }];
  });

export const getPersistingTransientMessageImageAssetIds = (controller: TribeRoundController) =>
  controller.messageImageDrafts
    .filter(
      (image) =>
        !image.isPersisted &&
        image.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploaded &&
        Boolean(image.assetId)
    )
    .map((image) => image.assetId ?? "");

const getMessageImageDraftValidationError = (controller: TribeRoundController) => {
  if (
    controller.messageImageDrafts.some(
      (image) => image.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading
    )
  ) {
    return TRIBE_ROUND_COPY.imageUploadPendingError;
  }

  if (
    controller.messageImageDrafts.some(
      (image) => image.status === COMPOSER_IMAGE_UPLOAD_STATUS.error
    )
  ) {
    return TRIBE_ROUND_COPY.imageUploadError;
  }

  return null;
};

/**
 * Projects the ready file drafts to the `files` payload of the create and
 * edit endpoints. The array index expresses the author-chosen download slot.
 */
export const buildMessageFilesPayload = (controller: TribeRoundController): { assetId: string }[] =>
  controller.fileDrafts.flatMap((fileDraft) =>
    fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploaded &&
    fileDraft.assetId
      ? [{ assetId: fileDraft.assetId }]
      : []
  );

export const getPersistingTransientMessageFileAssetIds = (controller: TribeRoundController) =>
  controller.fileDrafts
    .filter(
      (fileDraft) =>
        !fileDraft.isPersisted &&
        fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploaded &&
        Boolean(fileDraft.assetId)
    )
    .map((fileDraft) => fileDraft.assetId ?? "");

const getMessageFileDraftValidationError = (controller: TribeRoundController) => {
  if (
    controller.fileDrafts.some(
      (fileDraft) =>
        fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploading
    )
  ) {
    return TRIBE_ROUND_COPY.fileUploadPendingError;
  }

  if (
    controller.fileDrafts.some(
      (fileDraft) => fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.error
    )
  ) {
    return TRIBE_ROUND_COPY.fileUploadError;
  }

  return null;
};

/**
 * Resolves the DOM node of the first field, in top-to-bottom visual order,
 * that the given validation errors point to, so the composer can bring it into
 * view. Media errors resolve to the specific offending draft; field-level
 * errors resolve to the registered title, content, poll or channel node.
 */
const getFirstComposerErrorAnchor = (controller: TribeRoundController, 
  errors: string[]
): HTMLElement | null | undefined => {
  const blockTargets = controller.composerBlockTargetsRef.current;

  if (errors.includes(TRIBE_ROUND_COPY.messageComposerMissingTitle)) {
    return blockTargets.get(MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.title);
  }

  if (errors.includes(TRIBE_ROUND_COPY.messageComposerMissingContent)) {
    return blockTargets.get(MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.content);
  }

  if (MESSAGE_COMPOSER_POLL_ERROR_COPIES.some((copy) => errors.includes(copy))) {
    return blockTargets.get(TRIBE_ROUND_POLL.composerBlockKey);
  }

  if (errors.includes(TRIBE_ROUND_COPY.videoMissing)) {
    return getBlockTargetByKey(
      blockTargets,
      findInvalidVideoDraft(controller.mediaDrafts)?.localId
    );
  }

  if (includesAnyError(errors, COMPOSER_IMAGE_UPLOAD_ERROR_COPIES)) {
    return getBlockTargetByKey(
      blockTargets,
      findUnfinishedUploadDraft(controller.messageImageDrafts, COMPOSER_IMAGE_UPLOAD_STATUS)?.localId
    );
  }

  if (includesAnyError(errors, COMPOSER_FILE_UPLOAD_ERROR_COPIES)) {
    return getBlockTargetByKey(
      blockTargets,
      findUnfinishedUploadDraft(controller.fileDrafts, COMPOSER_FILE_UPLOAD_STATUS)?.localId
    );
  }

  if (errors.includes(TRIBE_ROUND_COPY.mediaLimitError)) {
    return getBlockTargetByKey(blockTargets, controller.mediaDrafts.at(-1)?.localId);
  }

  if (errors.includes(TRIBE_ROUND_COPY.messageComposerMissingChannel)) {
    return blockTargets.get(MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.channel);
  }

  return undefined;
};

/**
 * Scrolls the first field that failed validation into view on the next frame,
 * after the inline errors have rendered, so the user notices the problem even
 * when it sits outside the visible area of the modal.
 */
const scrollToFirstComposerError = (controller: TribeRoundController, errors: string[]) => {
  window.requestAnimationFrame(() => {
    getFirstComposerErrorAnchor(controller, errors)?.scrollIntoView({
      behavior: COMPOSER_BODY_SCROLL.bottomBehavior,
      block: COMPOSER_BODY_SCROLL.focusBlockAlignment,
    });
  });
};

/**
 * Publishes a failed validation: lists the errors in the summary and inline,
 * and scrolls the first offending field into view so the user notices it.
 */
const reportComposerErrors = (controller: TribeRoundController, errors: string[]) => {
  controller.setMessageComposerErrors(errors);
  scrollToFirstComposerError(controller, errors);
};

/**
 * Reports the first failing composer check: missing requirements, then the
 * image drafts, then the file drafts.
 *
 * @returns Whether an error was reported.
 */
export const reportComposerValidationErrors = (controller: TribeRoundController, missingRequirements: string[]): boolean => {
  if (missingRequirements.length > 0) {
    reportComposerErrors(controller, missingRequirements);
    return true;
  }

  const imageDraftValidationError = getMessageImageDraftValidationError(controller);
  if (imageDraftValidationError) {
    reportComposerErrors(controller, [imageDraftValidationError]);
    return true;
  }

  const fileDraftValidationError = getMessageFileDraftValidationError(controller);
  if (fileDraftValidationError) {
    reportComposerErrors(controller, [fileDraftValidationError]);
    return true;
  }

  return false;
};

export const markMessageImagesAsPersisting = (controller: TribeRoundController, assetIds: string[]) => {
  assetIds.forEach((assetId) => {
    controller.persistingMessageImageAssetIdsRef.current.add(assetId);
  });
};

export const clearPersistingMessageImages = (controller: TribeRoundController, assetIds: string[]) => {
  assetIds.forEach((assetId) => {
    controller.persistingMessageImageAssetIdsRef.current.delete(assetId);
  });
};

export const cleanupPersistingMessageImages = (controller: TribeRoundController, 
  assetIds: string[],
  actionTribeSlug: string
) => {
  assetIds.forEach((assetId) => {
    controller.persistingMessageImageAssetIdsRef.current.delete(assetId);
    controller.deleteMessageImageAsset(assetId, actionTribeSlug);
  });
};

export const removeTransientMessageImageDraftsFromComposer = (controller: TribeRoundController) => {
  const persistedImageDrafts = controller.currentMessageImageDraftsRef.current.filter(
    (imageDraft) => imageDraft.isPersisted
  );
  const transientImageDrafts = controller.currentMessageImageDraftsRef.current.filter(
    (imageDraft) => !imageDraft.isPersisted
  );

  revokeMessageImageDraftPreviewUrls(transientImageDrafts);
  controller.currentMessageImageDraftsRef.current = persistedImageDrafts;
  controller.setMessageImageDrafts(persistedImageDrafts);
};

export const markMessageFilesAsPersisting = (controller: TribeRoundController, assetIds: string[]) => {
  assetIds.forEach((assetId) => {
    controller.persistingMessageFileAssetIdsRef.current.add(assetId);
  });
};

export const clearPersistingMessageFiles = (controller: TribeRoundController, assetIds: string[]) => {
  assetIds.forEach((assetId) => {
    controller.persistingMessageFileAssetIdsRef.current.delete(assetId);
  });
};

export const cleanupPersistingMessageFiles = (controller: TribeRoundController, 
  assetIds: string[],
  actionTribeSlug: string
) => {
  assetIds.forEach((assetId) => {
    controller.persistingMessageFileAssetIdsRef.current.delete(assetId);
    controller.deleteMessageFileAsset(assetId, actionTribeSlug);
  });
};

export const removeTransientMessageFileDraftsFromComposer = (controller: TribeRoundController) => {
  controller.setFileDrafts((currentFileDrafts) =>
    currentFileDrafts.filter((fileDraft) => fileDraft.isPersisted)
  );
};

/**
 * Releases the upload of an image draft the author removed meanwhile.
 * @returns Whether the draft was removed, so the upload must stop.
 */
const releaseDiscardedMessageImage = (
  controller: TribeRoundController,
  localId: string,
  assetId: string | null
): boolean => {
  if (!controller.discardedMessageImageLocalIdsRef.current.delete(localId)) {
    return false;
  }

  if (assetId && !controller.cleanedMessageImageAssetIdsRef.current.has(assetId)) {
    controller.deleteMessageImageAsset(assetId);
  }

  return true;
};

const patchMessageImageDraft = (
  controller: TribeRoundController,
  localId: string,
  patch: Partial<ComposerImageDraft>
) => {
  controller.setMessageImageDrafts((currentImages) =>
    currentImages.map((image) =>
      image.localId === localId ? { ...image, ...patch } : image
    )
  );
};

const uploadMessageImage = async (controller: TribeRoundController, file: File, localId: string) => {
  let createdAssetId: string | null = null;

  try {
    const upload = await submitJsonRequest<MessageImageUploadResponse>(
      TRIBE_ROUND_ENDPOINT.messageImageUploads(controller.tribeSlug),
      {}
    );

    if (!upload.assetId || !upload.uploadUrl) {
      throw new Error(TRIBE_ROUND_COPY.imageUploadError);
    }

    createdAssetId = upload.assetId;

    if (releaseDiscardedMessageImage(controller, localId, upload.assetId)) {
      return;
    }

    patchMessageImageDraft(controller, localId, { assetId: upload.assetId });

    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch(upload.uploadUrl, {
      body: formData,
      method: TRIBE_ROUND_FORM.method,
    });

    if (!uploadResponse.ok) {
      throw new Error(TRIBE_ROUND_COPY.imageUploadError);
    }

    if (releaseDiscardedMessageImage(controller, localId, upload.assetId)) {
      return;
    }

    patchMessageImageDraft(controller, localId, {
      status: COMPOSER_IMAGE_UPLOAD_STATUS.uploaded,
    });
  } catch {
    if (releaseDiscardedMessageImage(controller, localId, createdAssetId)) {
      return;
    }

    patchMessageImageDraft(controller, localId, {
      ...(createdAssetId ? { assetId: createdAssetId } : {}),
      status: COMPOSER_IMAGE_UPLOAD_STATUS.error,
    });
    toast.error(TRIBE_ROUND_COPY.imageUploadError);
  }
};

/** Takes the files picked in a file input and clears it, so picking the same files again still fires. */
const takeSelectedFiles = (event: ChangeEvent<HTMLInputElement>): File[] => {
  const selectedFiles = Array.from(event.currentTarget.files ?? []);

  event.currentTarget.value = "";

  return selectedFiles;
};

export const handleMessageImageSelection = (controller: TribeRoundController, 
  event: ChangeEvent<HTMLInputElement>
) => {
  const selectedFiles = takeSelectedFiles(event);

  if (selectedFiles.length === 0) {
    return;
  }

  if (controller.mediaDrafts.length + selectedFiles.length > MESSAGE_MEDIA.maxCount) {
    reportComposerErrors(controller, [TRIBE_ROUND_COPY.mediaLimitError]);
    return;
  }

  let firstAddedImageLocalId: string | null = null;

  for (const file of selectedFiles) {
    controller.messageImageCounterRef.current += 1;
    const localId = `${file.name}-${String(file.lastModified)}-${String(
      controller.messageImageCounterRef.current
    )}`;

    if (firstAddedImageLocalId === null) {
      firstAddedImageLocalId = localId;
    }
    const previewUrl =
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : "";

    controller.setMessageImageDrafts((currentImages) => [
      ...currentImages,
      {
        altText: "",
        localId,
        previewUrl,
        status: COMPOSER_IMAGE_UPLOAD_STATUS.uploading,
        isPersisted: false,
      },
    ]);
    void uploadMessageImage(controller, file, localId);
  }
  controller.setMessageComposerErrors([]);

  if (firstAddedImageLocalId !== null) {
    controller.revealComposerBlock(firstAddedImageLocalId, firstAddedImageLocalId);
  }
};

export const removeMessageImageDraft = (controller: TribeRoundController, imageDraft: ComposerImageDraft) => {
  revokeMessageImagePreviewUrl(imageDraft.previewUrl);
  controller.setMessageImageDrafts((currentImages) =>
    currentImages.filter((image) => image.localId !== imageDraft.localId)
  );

  if (!imageDraft.isPersisted) {
    controller.discardedMessageImageLocalIdsRef.current.add(imageDraft.localId);

    if (imageDraft.assetId) {
      controller.deleteMessageImageAsset(imageDraft.assetId);
    }
  }
};

/**
 * Reserves a draft asset for {@link file} and uploads the raw bytes to the
 * signed URL, mirroring {@link uploadMessageImage}: the draft is marked
 * `uploaded` on success, `error` on failure (keeping the reserved asset id
 * for cleanup), and a draft discarded mid-flight deletes its asset instead
 * of updating state.
 */
const patchMessageFileDraft = (controller: TribeRoundController, 
  localId: string,
  patch: Partial<ComposerFileDraft>
) => {
  controller.setFileDrafts((currentFileDrafts) =>
    currentFileDrafts.map((fileDraft) =>
      fileDraft.localId === localId ? { ...fileDraft, ...patch } : fileDraft
    )
  );
};

/**
 * Forgets an upload whose draft was removed meanwhile and deletes its asset
 * unless it was already cleaned up.
 *
 * @returns Whether the draft had been removed.
 */
const abandonDiscardedMessageFileUpload = (controller: TribeRoundController, 
  localId: string,
  assetId: string | null
): boolean => {
  if (!controller.discardedMessageFileLocalIdsRef.current.delete(localId)) {
    return false;
  }

  if (assetId && !controller.cleanedMessageFileAssetIdsRef.current.has(assetId)) {
    controller.deleteMessageFileAsset(assetId);
  }

  return true;
};

const uploadMessageFile = async (controller: TribeRoundController, file: File, localId: string) => {
  let createdAssetId: string | null = null;

  try {
    const upload = await submitJsonRequest<MessageFileUploadResponse>(
      TRIBE_ROUND_ENDPOINT.messageFileUploads(controller.tribeSlug),
      {
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
      }
    );

    if (!upload.assetId || !upload.uploadUrl) {
      throw new Error(TRIBE_ROUND_COPY.fileUploadError);
    }

    createdAssetId = upload.assetId;

    if (abandonDiscardedMessageFileUpload(controller, localId, upload.assetId)) {
      return;
    }

    patchMessageFileDraft(controller, localId, { assetId: upload.assetId });

    const uploadResponse = await fetch(upload.uploadUrl, {
      body: file,
      headers: {
        [TRIBE_ROUND_FORM.contentTypeHeader]: file.type,
        ...upload.uploadHeaders,
      },
      method: TRIBE_ROUND_FORM.putMethod,
    });

    if (!uploadResponse.ok) {
      throw new Error(TRIBE_ROUND_COPY.fileUploadError);
    }

    if (abandonDiscardedMessageFileUpload(controller, localId, upload.assetId)) {
      return;
    }

    patchMessageFileDraft(controller, localId, { status: COMPOSER_FILE_UPLOAD_STATUS.uploaded });
  } catch (error) {
    if (abandonDiscardedMessageFileUpload(controller, localId, createdAssetId)) {
      return;
    }

    patchMessageFileDraft(controller, localId, {
      ...(createdAssetId ? { assetId: createdAssetId } : {}),
      status: COMPOSER_FILE_UPLOAD_STATUS.error,
    });
    toast.error(
      error instanceof Error
        ? error.message
        : TRIBE_ROUND_COPY.fileUploadError
    );
  }
};

/**
 * Validates the picked files against the shared attachment contract before
 * any network call: disallowed types and oversized files are rejected with a
 * toast, and the whole selection is rejected when it would exceed the
 * per-message attachment limit.
 */
export const handleMessageFileSelection = (controller: TribeRoundController, 
  event: ChangeEvent<HTMLInputElement>
) => {
  const selectedFiles = takeSelectedFiles(event);

  if (selectedFiles.length === 0) {
    return;
  }

  const acceptedFiles: File[] = [];

  selectedFiles.forEach((file) => {
    if (!isAllowedAttachmentMimeType(file.type)) {
      toast.error(TRIBE_ROUND_COPY.fileTypeNotAllowedError);
      return;
    }

    if (file.size > ATTACHMENT_FILE.maxFileSizeBytes) {
      toast.error(TRIBE_ROUND_COPY.fileTooLargeError);
      return;
    }

    acceptedFiles.push(file);
  });

  if (acceptedFiles.length === 0) {
    return;
  }

  if (controller.fileDrafts.length + acceptedFiles.length > MESSAGE_FILES.maxCount) {
    toast.error(TRIBE_ROUND_COPY.fileLimitError);
    return;
  }

  let firstAddedFileLocalId: string | null = null;

  for (const file of acceptedFiles) {
    controller.messageFileCounterRef.current += 1;
    const localId =
      TRIBE_ROUND_OPTIMISTIC.fileLocalIdPrefix +
      String(controller.messageFileCounterRef.current);

    if (firstAddedFileLocalId === null) {
      firstAddedFileLocalId = localId;
    }

    controller.setFileDrafts((currentFileDrafts) => [
      ...currentFileDrafts,
      {
        fileName: file.name,
        fileSizeBytes: file.size,
        isPersisted: false,
        localId,
        mimeType: file.type,
        sourceFile: file,
        status: COMPOSER_FILE_UPLOAD_STATUS.uploading,
      },
    ]);
    void uploadMessageFile(controller, file, localId);
  }
  controller.setMessageComposerErrors([]);

  if (firstAddedFileLocalId !== null) {
    controller.revealComposerBlock(firstAddedFileLocalId, firstAddedFileLocalId);
  }
};

export const removeMessageFileDraft = (controller: TribeRoundController, fileDraft: ComposerFileDraft) => {
  controller.setFileDrafts((currentFileDrafts) =>
    currentFileDrafts.filter(
      (currentFileDraft) => currentFileDraft.localId !== fileDraft.localId
    )
  );

  if (!fileDraft.isPersisted) {
    controller.discardedMessageFileLocalIdsRef.current.add(fileDraft.localId);

    if (fileDraft.assetId) {
      controller.deleteMessageFileAsset(fileDraft.assetId);
    }
  }
};

/**
 * Retries a failed file upload from its kept source file. The stale asset
 * reserved by the failed attempt (if any) is deleted best-effort and the
 * draft restarts the reserve-and-upload flow with a fresh asset.
 */
export const retryMessageFileDraftUpload = (controller: TribeRoundController, fileDraft: ComposerFileDraft) => {
  const sourceFile = fileDraft.sourceFile;

  if (!sourceFile) {
    return;
  }

  if (fileDraft.assetId) {
    controller.deleteMessageFileAsset(fileDraft.assetId);
  }

  controller.setFileDrafts((currentFileDrafts) =>
    currentFileDrafts.map((currentFileDraft) =>
      currentFileDraft.localId === fileDraft.localId
        ? {
            ...currentFileDraft,
            assetId: undefined,
            status: COMPOSER_FILE_UPLOAD_STATUS.uploading,
          }
        : currentFileDraft
    )
  );
  controller.setMessageComposerErrors([]);
  void uploadMessageFile(controller, sourceFile, fileDraft.localId);
};

export const addVideoMediaDraft = (controller: TribeRoundController) => {
  if (controller.mediaDrafts.length >= MESSAGE_MEDIA.maxCount) {
    reportComposerErrors(controller, [TRIBE_ROUND_COPY.mediaLimitError]);
    return;
  }

  controller.mediaDraftCounterRef.current += 1;
  const localId =
    TRIBE_ROUND_OPTIMISTIC.mediaVideoLocalIdPrefix +
    String(controller.mediaDraftCounterRef.current);

  controller.setMediaDrafts((currentMediaDrafts) => [
    ...currentMediaDrafts,
    { kind: MESSAGE_MEDIA_KIND.video, localId, url: "" },
  ]);
  controller.setMessageComposerErrors([]);
  controller.revealComposerBlock(localId, localId);
};

export const updateVideoMediaDraftUrl = (controller: TribeRoundController, localId: string, url: string) => {
  controller.setMediaDrafts((currentMediaDrafts) =>
    currentMediaDrafts.map((mediaDraft) =>
      mediaDraft.kind === MESSAGE_MEDIA_KIND.video &&
      mediaDraft.localId === localId
        ? { ...mediaDraft, url }
        : mediaDraft
    )
  );
  controller.setMessageComposerErrors([]);
};

export const removeVideoMediaDraft = (controller: TribeRoundController, localId: string) => {
  controller.setMediaDrafts((currentMediaDrafts) =>
    currentMediaDrafts.filter(
      (mediaDraft) =>
        !(
          mediaDraft.kind === MESSAGE_MEDIA_KIND.video &&
          mediaDraft.localId === localId
        )
    )
  );
  controller.setMessageComposerErrors([]);
};
