import type { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventOccurrenceComment,
  TribeEventOccurrenceMaterial,
  TribeEventOccurrenceReaction,
  TribeEventOccurrenceReactionSummary,
  TribeEventOccurrenceRecording,
} from "@/src/modules/events/domain/entities/tribe-event-post-event";

/**
 * Persistence of the post-event resources of one occurrence. Every read
 * repeats `can_read_tribe_content` in SQL and every write repeats its own
 * guard (`can_manage_tribe_events` for resources, `is_active_tribe_member`
 * plus ownership for reactions and comments) because the runtime role
 * bypasses RLS. Writes also revalidate the occurrence slot in their own
 * transaction.
 */

export type TribeEventOccurrenceKeyQuery = {
  eventId: string;
  originalStartsAt: string;
  tribeSlug: string;
};

/**
 * What the viewer may do with the resources of an occurrence.
 */
export type TribeEventPostEventViewerPermissions = {
  /** Event managers publish the recording and the materials. */
  canManageResources: boolean;
  /** Active members react and comment (muted members only read). */
  canParticipate: boolean;
};

export type TribeEventPostEventResources = {
  materials: TribeEventOccurrenceMaterial[];
  reactions: TribeEventOccurrenceReactionSummary;
  recording: TribeEventOccurrenceRecording | null;
  viewerPermissions: TribeEventPostEventViewerPermissions;
};

/**
 * Resources already validated by the use case: the recording URL parsed into
 * a supported provider, materials trimmed and within the limits.
 */
export type SaveTribeEventPostEventResourcesCommand = TribeEventOccurrenceKeyQuery & {
  materials: TribeEventOccurrenceMaterial[];
  recording: TribeEventOccurrenceRecording | null;
};

type PostEventFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;

/**
 * Slot checks every write repeats inside its own transaction, under the
 * membership and event row locks: the use case resolved the occurrence in an
 * earlier transaction, and a manager may have cancelled or moved the date,
 * or edited the schedule, in between.
 */
type OccurrenceSlotFailureStatus = typeof TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence;

type FinishedOccurrenceFailureStatus =
  | OccurrenceSlotFailureStatus
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished;

export type TribeEventPostEventSaveResult =
  | {
      resources: TribeEventPostEventResources;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.postEventSaved;
    }
  | { status: FinishedOccurrenceFailureStatus | PostEventFailureStatus };

/**
 * `reaction: null` removes the viewer's reaction (idempotent).
 */
export type SetTribeEventOccurrenceReactionCommand = TribeEventOccurrenceKeyQuery & {
  reaction: TribeEventOccurrenceReaction | null;
};

export type TribeEventOccurrenceReactionResult =
  | {
      reactions: TribeEventOccurrenceReactionSummary;
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.reactionCleared
        | typeof TRIBE_EVENT_MUTATION_STATUS.reactionSaved;
    }
  | { status: FinishedOccurrenceFailureStatus | PostEventFailureStatus };

export type TribeEventPostEventRepository = {
  /**
   * @returns The resources, or null when the event does not exist in the
   * tribe or the viewer cannot read the tribe.
   */
  getResources: (
    query: TribeEventOccurrenceKeyQuery
  ) => Promise<TribeEventPostEventResources | null>;
  saveResources: (
    command: SaveTribeEventPostEventResourcesCommand
  ) => Promise<TribeEventPostEventSaveResult>;
  setReaction: (
    command: SetTribeEventOccurrenceReactionCommand
  ) => Promise<TribeEventOccurrenceReactionResult>;
};

/**
 * `clientRequestId` is the client operation key: a replay of the same key by
 * the same author on the same occurrence answers the comment it already
 * created instead of writing a duplicate.
 */
export type CreateTribeEventOccurrenceCommentCommand = TribeEventOccurrenceKeyQuery & {
  clientRequestId: string;
  content: string;
};

export type DeleteTribeEventOccurrenceCommentCommand = {
  commentId: string;
  tribeSlug: string;
};

export type TribeEventOccurrenceCommentListResult =
  | {
      canComment: boolean;
      comments: TribeEventOccurrenceComment[];
      status: typeof TRIBE_EVENT_MUTATION_STATUS.found;
    }
  | { status: typeof TRIBE_EVENT_MUTATION_STATUS.notFound };

export type TribeEventOccurrenceCommentCreateResult =
  | {
      comment: TribeEventOccurrenceComment;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.commentCreated;
    }
  | { status: OccurrenceSlotFailureStatus | PostEventFailureStatus };

export type TribeEventOccurrenceCommentDeleteResult = {
  status: typeof TRIBE_EVENT_MUTATION_STATUS.commentDeleted | PostEventFailureStatus;
};

/**
 * Conversation of one occurrence (oldest first, bounded list).
 */
export type TribeEventOccurrenceCommentRepository = {
  create: (
    command: CreateTribeEventOccurrenceCommentCommand
  ) => Promise<TribeEventOccurrenceCommentCreateResult>;
  delete: (
    command: DeleteTribeEventOccurrenceCommentCommand
  ) => Promise<TribeEventOccurrenceCommentDeleteResult>;
  list: (query: TribeEventOccurrenceKeyQuery) => Promise<TribeEventOccurrenceCommentListResult>;
};
