"use client";

import { useRef, useState } from "react";

import { TribeEventConversation } from "@/components/events/tribe-event-conversation";
import { TribeEventLessonConversionDialog } from "@/components/events/tribe-event-lesson-conversion-dialog";
import { TribeEventPostEventFormDialog } from "@/components/events/tribe-event-post-event-form-dialog";
import { TribeEventPostEventPanel } from "@/components/events/tribe-event-post-event-panel";
import { useTribeEventConversation } from "@/hooks/use-tribe-event-conversation";
import { useTribeEventLessonConversion } from "@/hooks/use-tribe-event-lesson-conversion";
import { useTribeEventPostEvent } from "@/hooks/use-tribe-event-post-event";
import { formatBuenosAiresShortDate } from "@/lib/date-time/buenos-aires-format";
import { isOccurrenceCancelled } from "@/lib/events/tribe-event-occurrence-exception-copy";
import { TRIBE_EVENT_POST_EVENT_LOAD_STATUS } from "@/lib/events/tribe-event-post-event-state";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

type TribeEventOccurrenceActivityProps = {
  /** True once the occurrence ended (client clock): shows the post-event block. */
  isFinished: boolean;
  occurrence: TribeEventOccurrenceResult;
  /** Keeps the agenda badge "Grabación disponible" in sync after a save. */
  onRecordingAvailabilityChange: (occurrenceKey: string, hasRecording: boolean) => void;
  tribeSlug: string;
};

const EMPTY_VALUE = "";
const LESSON_TITLE_SEPARATOR = " · ";

/**
 * Resources form session: its id keys the dialog so every opening starts
 * from fresh values, and `isOpen` lets a closed form stay mounted while it
 * animates out.
 */
type ResourcesFormSession = {
  id: number;
  isOpen: boolean;
};

/**
 * Client container of the occurrence activity shown inside the detail
 * dialog: the post-event block (finished, non-cancelled dates) and the
 * conversation (every date). It owns the requests through dedicated hooks
 * and renders presentational components; the parent keys it by occurrence,
 * so each occurrence starts from a fresh state.
 */
export function TribeEventOccurrenceActivity({
  isFinished,
  occurrence,
  onRecordingAvailabilityChange,
  tribeSlug,
}: TribeEventOccurrenceActivityProps) {
  const showsPostEvent = isFinished && !isOccurrenceCancelled(occurrence);
  const target = {
    eventId: occurrence.eventId,
    originalStartsAt: occurrence.originalStartsAt,
    tribeSlug,
  };

  return (
    <>
      {showsPostEvent ? (
        <TribeEventPostEventSection
          occurrence={occurrence}
          target={target}
          onRecordingAvailabilityChange={onRecordingAvailabilityChange}
        />
      ) : null}
      <TribeEventConversationSection isFinished={isFinished} target={target} />
    </>
  );
}

function TribeEventPostEventSection({
  occurrence,
  onRecordingAvailabilityChange,
  target,
}: {
  occurrence: TribeEventOccurrenceResult;
  onRecordingAvailabilityChange: (occurrenceKey: string, hasRecording: boolean) => void;
  target: { eventId: string; originalStartsAt: string; tribeSlug: string };
}) {
  const postEvent = useTribeEventPostEvent({
    onRecordingAvailabilityChange: (hasRecording) =>
      onRecordingAvailabilityChange(occurrence.occurrenceKey, hasRecording),
    target,
  });
  const lessonConversion = useTribeEventLessonConversion(target);
  // Session of the resources form (null before the first opening). Session
  // ids only grow, so a form reopened while a save is pending never reuses
  // the id of the form that submitted it. A closed session stays mounted
  // with `isOpen: false` so the dialog plays its exit animation.
  const [resourcesFormSession, setResourcesFormSession] = useState<ResourcesFormSession | null>(
    null
  );
  const lastResourcesFormSessionRef = useRef(0);
  const [isLessonDialogOpen, setIsLessonDialogOpen] = useState(false);
  const [lessonDialogSession, setLessonDialogSession] = useState(0);
  const loadedPostEvent =
    postEvent.loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded
      ? postEvent.loadState.postEvent
      : null;

  const openLessonDialog = () => {
    setLessonDialogSession((currentSession) => currentSession + 1);
    setIsLessonDialogOpen(true);
    lessonConversion.loadTargets();
  };

  const openResourcesForm = () => {
    // A form opened while a save is pending would start from the pre-save
    // resources and its submission would overwrite that save, so it waits.
    if (postEvent.isSaving) {
      return;
    }

    lastResourcesFormSessionRef.current += 1;
    setResourcesFormSession({ id: lastResourcesFormSessionRef.current, isOpen: true });
  };

  /** Closes the form of session `sessionId` if it is still the open one. */
  const closeResourcesForm = (sessionId: number) => {
    setResourcesFormSession((currentSession) =>
      currentSession?.id === sessionId && currentSession.isOpen
        ? { ...currentSession, isOpen: false }
        : currentSession
    );
  };

  const closeLessonDialog = () => {
    setIsLessonDialogOpen(false);
    lessonConversion.reset();
  };

  return (
    <>
      <TribeEventPostEventPanel
        isSavingResources={postEvent.isSaving}
        loadState={postEvent.loadState}
        occurrenceTitle={occurrence.title}
        reactions={postEvent.visibleReactions}
        onConvertToLesson={openLessonDialog}
        onEditResources={openResourcesForm}
        onReact={postEvent.react}
        onRetry={postEvent.reload}
      />
      {resourcesFormSession !== null ? (
        <TribeEventPostEventFormDialog
          initialPostEvent={loadedPostEvent}
          isOpen={resourcesFormSession.isOpen}
          isSaving={postEvent.isSaving}
          key={resourcesFormSession.id}
          onClose={() => closeResourcesForm(resourcesFormSession.id)}
          onSubmit={(payload) => {
            const submittingFormSessionId = resourcesFormSession.id;

            void postEvent.saveResources(payload).then((isSaved) => {
              if (isSaved) {
                // Close only the form that submitted: a form reopened while
                // the save was pending is a new session with its own edits.
                closeResourcesForm(submittingFormSessionId);
              }
            });
          }}
        />
      ) : null}
      {loadedPostEvent?.viewerPermissions.canConvertToLesson ? (
        <TribeEventLessonConversionDialog
          convertedLesson={lessonConversion.convertedLesson}
          defaultDescription={occurrence.description ?? EMPTY_VALUE}
          defaultTitle={
            occurrence.title + LESSON_TITLE_SEPARATOR + formatBuenosAiresShortDate(occurrence.startsAt)
          }
          isOpen={isLessonDialogOpen}
          isSubmitting={lessonConversion.isSubmitting}
          key={lessonDialogSession}
          targetsState={lessonConversion.targetsState}
          onClose={closeLessonDialog}
          onRetry={lessonConversion.loadTargets}
          onSubmit={(payload) => {
            void lessonConversion.convert(payload);
          }}
        />
      ) : null}
    </>
  );
}

function TribeEventConversationSection({
  isFinished,
  target,
}: {
  isFinished: boolean;
  target: { eventId: string; originalStartsAt: string; tribeSlug: string };
}) {
  const conversation = useTribeEventConversation(target);

  return (
    <TribeEventConversation
      deletingCommentIds={conversation.deletingCommentIds}
      isFinished={isFinished}
      isSubmitting={conversation.isSubmitting}
      loadState={conversation.loadState}
      onCreateComment={conversation.createComment}
      onDeleteComment={(commentId) => {
        void conversation.deleteComment(commentId);
      }}
      onRetry={conversation.reload}
    />
  );
}
