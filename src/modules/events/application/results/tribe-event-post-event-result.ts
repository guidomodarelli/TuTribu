import type { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventOccurrenceComment,
  TribeEventOccurrenceMaterial,
  TribeEventOccurrenceReactionSummary,
} from "@/src/modules/events/domain/entities/tribe-event-post-event";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Recording ready for the UI: the provider player URL to embed, the original
 * link, and a deterministic thumbnail when the provider has one (YouTube).
 */
export type TribeEventRecordingResult = {
  embedUrl: string;
  externalVideoId: string;
  provider: VideoProvider;
  sourceUrl: string;
  thumbnailUrl: string | null;
};

export type TribeEventPostEventPermissionsResult = {
  canManageResources: boolean;
  canParticipate: boolean;
};

/**
 * Post-event view of one occurrence. `isFinished` and `isCancelled` tell the
 * UI which blocks apply: recordings and reactions only exist for finished,
 * non-cancelled occurrences.
 */
export type TribeEventPostEventResult = {
  isCancelled: boolean;
  isFinished: boolean;
  materials: TribeEventOccurrenceMaterial[];
  reactions: TribeEventOccurrenceReactionSummary;
  recording: TribeEventRecordingResult | null;
  viewerPermissions: TribeEventPostEventPermissionsResult;
};

type OccurrenceLookupFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;

export type TribeEventPostEventLookupResult =
  | {
      postEvent: TribeEventPostEventResult;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.found;
    }
  | { status: OccurrenceLookupFailureStatus };

export type TribeEventPostEventMutationResult =
  | {
      postEvent: TribeEventPostEventResult;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.postEventSaved;
    }
  | {
      status:
        | OccurrenceLookupFailureStatus
        | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidRecordingUrl
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished;
    };

export type TribeEventReactionMutationResult =
  | {
      reactions: TribeEventOccurrenceReactionSummary;
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.reactionCleared
        | typeof TRIBE_EVENT_MUTATION_STATUS.reactionSaved;
    }
  | {
      status:
        | OccurrenceLookupFailureStatus
        | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished;
    };

export type TribeEventCommentResult = TribeEventOccurrenceComment;

export type TribeEventConversationResult = {
  canComment: boolean;
  comments: TribeEventCommentResult[];
};

export type TribeEventConversationLookupResult =
  | (TribeEventConversationResult & { status: typeof TRIBE_EVENT_MUTATION_STATUS.found })
  | { status: OccurrenceLookupFailureStatus };

export type TribeEventCommentCreateResult =
  | {
      comment: TribeEventCommentResult;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.commentCreated;
    }
  | {
      status: OccurrenceLookupFailureStatus | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden;
    };

export type TribeEventCommentDeleteResult = {
  status:
    | typeof TRIBE_EVENT_MUTATION_STATUS.commentDeleted
    | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
    | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;
};

/**
 * Recording of a finished occurrence as the source of a course lesson: the
 * event copy (title, description) to prefill the lesson plus the parsed
 * video. The courses module receives these values; it never reads events.
 */
export type TribeEventRecordingLessonSourceResult = {
  description: string | null;
  eventId: string;
  externalVideoId: string;
  occurrenceStartsAt: string;
  provider: VideoProvider;
  startsAt: string;
  title: string;
};

export type TribeEventRecordingLessonSourceLookupResult =
  | {
      source: TribeEventRecordingLessonSourceResult;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.found;
    }
  | {
      status:
        | OccurrenceLookupFailureStatus
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished;
    };
