import type {
  CreateTribeEventOccurrenceCommentCommand,
  DeleteTribeEventOccurrenceCommentCommand,
  SaveTribeEventPostEventCommand,
  SetTribeEventOccurrenceReactionCommand,
  TribeEventOccurrenceQuery,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventCommentCreateResult,
  TribeEventCommentDeleteResult,
  TribeEventConversationLookupResult,
  TribeEventPostEventLookupResult,
  TribeEventPostEventMutationResult,
  TribeEventPostEventResult,
  TribeEventReactionMutationResult,
  TribeEventRecordingLessonSourceLookupResult,
  TribeEventRecordingResult,
} from "@/src/modules/events/application/results/tribe-event-post-event-result";
import { TRIBE_EVENT_POST_EVENT_LIMIT } from "@/src/modules/events/constants/tribe-event-post-event";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventOccurrenceRecording } from "@/src/modules/events/domain/entities/tribe-event-post-event";
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type {
  TribeEventOccurrenceCommentRepository,
  TribeEventPostEventRepository,
  TribeEventPostEventResources,
} from "@/src/modules/events/domain/repositories/tribe-event-post-event-repository";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import type { TribeEventResolvedOccurrence } from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";
import {
  isTribeEventOccurrenceFinished,
  resolveTribeEventOccurrenceSlot,
} from "@/src/modules/events/domain/services/tribe-event-post-event";
import { buildPlayerEmbedSource } from "@/src/modules/shared/application/video/build-player-embed-source";
import { buildVideoThumbnailSource } from "@/src/modules/shared/application/video/build-video-thumbnail-source";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";

/**
 * Post-event use cases of one occurrence: recording and materials (event
 * managers), "¿Cómo estuvo?" reactions (active members), the conversation,
 * and the recording as a lesson source. The occurrence is always resolved
 * from the series first, so a key can only address a real slot, and its
 * effective times (moved dates) decide whether it already finished.
 *
 * That resolution runs in its own transactions, so it only fails fast and
 * builds the response: every write repeats the slot checks (still a slot of
 * the current schedule, not cancelled, finished when required) and the
 * permission in the write transaction, under the membership and event row
 * locks, and its status (`invalidOccurrence`, `occurrenceCancelled`,
 * `occurrenceNotFinished`, `forbidden`) is passed through as is.
 */

type OccurrenceDependencies = {
  /** Current time in epoch milliseconds (injectable for tests). */
  clock?: () => number;
  tribeEventOccurrenceExceptionRepository: TribeEventOccurrenceExceptionRepository;
  tribeEventRepository: TribeEventRepository;
};

type PostEventDependencies = OccurrenceDependencies & {
  tribeEventPostEventRepository: TribeEventPostEventRepository;
};

type ConversationDependencies = OccurrenceDependencies & {
  tribeEventOccurrenceCommentRepository: TribeEventOccurrenceCommentRepository;
};

type ResolvedOccurrence =
  | { event: TribeEvent; isResolved: true; slot: TribeEventResolvedOccurrence }
  | {
      isResolved: false;
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence
        | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;
    };

async function resolveOccurrence(
  { tribeEventOccurrenceExceptionRepository, tribeEventRepository }: OccurrenceDependencies,
  query: TribeEventOccurrenceQuery
): Promise<ResolvedOccurrence> {
  const event = await tribeEventRepository.findById({
    eventId: query.eventId,
    tribeSlug: query.tribeSlug,
  });

  if (!event) {
    return { isResolved: false, status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  const exception = await tribeEventOccurrenceExceptionRepository.find(query);
  const slot = resolveTribeEventOccurrenceSlot(event, exception, query.originalStartsAt);

  return slot
    ? { event, isResolved: true, slot }
    : { isResolved: false, status: TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence };
}

function isCancelledSlot(slot: TribeEventResolvedOccurrence): boolean {
  return slot.exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled;
}

function readNow(clock: (() => number) | undefined): number {
  return clock ? clock() : Date.now();
}

function toRecordingResult(recording: TribeEventOccurrenceRecording): TribeEventRecordingResult {
  return {
    embedUrl: buildPlayerEmbedSource(recording.provider, recording.externalVideoId),
    externalVideoId: recording.externalVideoId,
    provider: recording.provider,
    sourceUrl: recording.sourceUrl,
    thumbnailUrl: buildVideoThumbnailSource(recording.provider, recording.externalVideoId),
  };
}

function toPostEventResult(
  resources: TribeEventPostEventResources,
  slot: TribeEventResolvedOccurrence,
  nowTime: number
): TribeEventPostEventResult {
  return {
    isCancelled: isCancelledSlot(slot),
    isFinished: isTribeEventOccurrenceFinished(slot, nowTime),
    materials: resources.materials,
    reactions: resources.reactions,
    recording: resources.recording ? toRecordingResult(resources.recording) : null,
    viewerPermissions: resources.viewerPermissions,
  };
}

/**
 * Rejects a finished-only action on a cancelled or not yet finished date.
 */
function checkFinishedSlot(
  slot: TribeEventResolvedOccurrence,
  nowTime: number
):
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished
  | null {
  if (isCancelledSlot(slot)) {
    return TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled;
  }

  return isTribeEventOccurrenceFinished(slot, nowTime)
    ? null
    : TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished;
}

/**
 * Resources of one occurrence for the detail dialog: recording, materials,
 * reaction counts with the viewer's own, and what the viewer may do.
 */
export function getTribeEventPostEvent(dependencies: PostEventDependencies) {
  return async (query: TribeEventOccurrenceQuery): Promise<TribeEventPostEventLookupResult> => {
    const occurrence = await resolveOccurrence(dependencies, query);

    if (!occurrence.isResolved) {
      return { status: occurrence.status };
    }

    const resources = await dependencies.tribeEventPostEventRepository.getResources(query);

    if (!resources) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
    }

    return {
      postEvent: toPostEventResult(resources, occurrence.slot, readNow(dependencies.clock)),
      status: TRIBE_EVENT_MUTATION_STATUS.found,
    };
  };
}

/**
 * "Agregar grabación y materiales" (event managers): replaces the recording
 * and the materials of a finished, non-cancelled occurrence. The recording
 * URL must be a supported provider (YouTube, Vimeo, Wistia, Loom), the same
 * parser course lessons use, and its parsed id must fit the stored id limit
 * (`recordingExternalIdMaxLength`). Publishing the first recording notifies the
 * attendees in the same transaction (database trigger).
 */
export function saveTribeEventPostEvent(dependencies: PostEventDependencies) {
  return async (
    command: SaveTribeEventPostEventCommand
  ): Promise<TribeEventPostEventMutationResult> => {
    const occurrence = await resolveOccurrence(dependencies, command);

    if (!occurrence.isResolved) {
      return { status: occurrence.status };
    }

    const nowTime = readNow(dependencies.clock);
    const slotFailure = checkFinishedSlot(occurrence.slot, nowTime);

    if (slotFailure) {
      return { status: slotFailure };
    }

    let recording: TribeEventOccurrenceRecording | null = null;

    if (command.recordingUrl !== null) {
      try {
        const parsedVideo = parseExternalVideoUrl(command.recordingUrl);

        // The shared parser accepts unbounded Wistia and Vimeo ids; the
        // recording table stores at most this many characters.
        if (
          parsedVideo.externalId.length > TRIBE_EVENT_POST_EVENT_LIMIT.recordingExternalIdMaxLength
        ) {
          return { status: TRIBE_EVENT_MUTATION_STATUS.invalidRecordingUrl };
        }

        recording = {
          externalVideoId: parsedVideo.externalId,
          provider: parsedVideo.provider,
          sourceUrl: command.recordingUrl.trim(),
        };
      } catch (error) {
        if (error instanceof InvalidVideoUrlError) {
          return { status: TRIBE_EVENT_MUTATION_STATUS.invalidRecordingUrl };
        }

        throw error;
      }
    }

    const result = await dependencies.tribeEventPostEventRepository.saveResources({
      eventId: command.eventId,
      materials: command.materials,
      originalStartsAt: occurrence.slot.originalStartsAt,
      recording,
      tribeSlug: command.tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.postEventSaved) {
      return { status: result.status };
    }

    return {
      postEvent: toPostEventResult(result.resources, occurrence.slot, nowTime),
      status: result.status,
    };
  };
}

/**
 * "¿Cómo estuvo?": one reaction per member on a finished, non-cancelled
 * occurrence; `null` removes it. Never notifies.
 */
export function setTribeEventOccurrenceReaction(dependencies: PostEventDependencies) {
  return async (
    command: SetTribeEventOccurrenceReactionCommand
  ): Promise<TribeEventReactionMutationResult> => {
    const occurrence = await resolveOccurrence(dependencies, command);

    if (!occurrence.isResolved) {
      return { status: occurrence.status };
    }

    const slotFailure = checkFinishedSlot(occurrence.slot, readNow(dependencies.clock));

    // Removing a reaction stays possible on any real date, so a member can
    // always take back what they left.
    if (slotFailure && command.reaction !== null) {
      return { status: slotFailure };
    }

    return dependencies.tribeEventPostEventRepository.setReaction({
      eventId: command.eventId,
      originalStartsAt: occurrence.slot.originalStartsAt,
      reaction: command.reaction,
      tribeSlug: command.tribeSlug,
    });
  };
}

/**
 * The recording of a finished, non-cancelled occurrence as the source of a
 * course lesson (title and description of the event plus the parsed video).
 * A published recording can outlive the finished state (a manager extends
 * the series end or cancels the date later), so the slot is checked again
 * here; the conversion transaction repeats the check under the event lock
 * (`lockTribeEventOccurrenceRecordingForShare`).
 */
export function getTribeEventRecordingLessonSource(dependencies: PostEventDependencies) {
  return async (
    query: TribeEventOccurrenceQuery
  ): Promise<TribeEventRecordingLessonSourceLookupResult> => {
    const occurrence = await resolveOccurrence(dependencies, query);

    if (!occurrence.isResolved) {
      return { status: occurrence.status };
    }

    const slotFailure = checkFinishedSlot(occurrence.slot, readNow(dependencies.clock));

    if (slotFailure) {
      return { status: slotFailure };
    }

    const resources = await dependencies.tribeEventPostEventRepository.getResources(query);

    if (!resources?.recording) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
    }

    return {
      source: {
        description: occurrence.event.description,
        eventId: occurrence.event.id,
        externalVideoId: resources.recording.externalVideoId,
        occurrenceStartsAt: occurrence.slot.originalStartsAt,
        provider: resources.recording.provider,
        startsAt: occurrence.slot.startsAt,
        title: occurrence.event.title,
      },
      status: TRIBE_EVENT_MUTATION_STATUS.found,
    };
  };
}

/**
 * Conversation of one occurrence (questions before, comments after).
 */
export function listTribeEventOccurrenceComments(dependencies: ConversationDependencies) {
  return async (query: TribeEventOccurrenceQuery): Promise<TribeEventConversationLookupResult> => {
    const occurrence = await resolveOccurrence(dependencies, query);

    if (!occurrence.isResolved) {
      return { status: occurrence.status };
    }

    return dependencies.tribeEventOccurrenceCommentRepository.list({
      eventId: query.eventId,
      originalStartsAt: occurrence.slot.originalStartsAt,
      tribeSlug: query.tribeSlug,
    });
  };
}

/**
 * Adds a comment to the conversation of a real occurrence (active members).
 */
export function createTribeEventOccurrenceComment(dependencies: ConversationDependencies) {
  return async (
    command: CreateTribeEventOccurrenceCommentCommand
  ): Promise<TribeEventCommentCreateResult> => {
    const occurrence = await resolveOccurrence(dependencies, command);

    if (!occurrence.isResolved) {
      return { status: occurrence.status };
    }

    return dependencies.tribeEventOccurrenceCommentRepository.create({
      clientRequestId: command.clientRequestId,
      content: command.content,
      eventId: command.eventId,
      originalStartsAt: occurrence.slot.originalStartsAt,
      tribeSlug: command.tribeSlug,
    });
  };
}

/**
 * Removes a comment (its author or an event manager).
 */
export function deleteTribeEventOccurrenceComment({
  tribeEventOccurrenceCommentRepository,
}: Pick<ConversationDependencies, "tribeEventOccurrenceCommentRepository">) {
  return (command: DeleteTribeEventOccurrenceCommentCommand): Promise<TribeEventCommentDeleteResult> =>
    tribeEventOccurrenceCommentRepository.delete(command);
}
