"use client";

import { ExternalLinkIcon, FileTextIcon, GraduationCapIcon, VideoIcon } from "lucide-react";

import { Button } from "beez-ui";

import {
  TRIBE_EVENT_POST_EVENT_LOAD_STATUS,
  type TribeEventLoadState,
} from "@/lib/events/tribe-event-post-event-state";
import type { TribeEventReactionSummary } from "@/lib/events/tribe-event-reaction-state";
import { PLAYER_IFRAME_ALLOW } from "@/src/modules/shared/application/video/build-player-embed-source";
import type { TribeEventPostEventView } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import {
  TRIBE_EVENT_OCCURRENCE_REACTIONS,
  TRIBE_EVENT_OCCURRENCE_REACTION_DISPLAY,
} from "@/src/modules/events/constants/tribe-event-post-event";
import type { TribeEventOccurrenceReaction } from "@/src/modules/events/domain/entities/tribe-event-post-event";
import styles from "./styles.module.scss";

type TribeEventPostEventPanelProps = {
  /**
   * True while a resources save is pending: the form cannot reopen until it
   * settles, because a reopened form would start from the pre-save values.
   */
  isSavingResources: boolean;
  loadState: TribeEventLoadState<{ postEvent: TribeEventPostEventView }>;
  occurrenceTitle: string;
  onConvertToLesson: () => void;
  onEditResources: () => void;
  onReact: (reaction: TribeEventOccurrenceReaction) => void;
  onRetry: () => void;
  /** Reactions to render (optimistic while a change is pending). */
  reactions: TribeEventReactionSummary | null;
};

const LINK_ATTRIBUTE = {
  lazy: "lazy",
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantOutline: "outline",
  variantSecondary: "secondary",
} as const;
const COPY = {
  addResources: "Agregar grabación y materiales",
  convertToLesson: "Convertir en lección",
  editResources: "Editar grabación y materiales",
  empty: "Todavía no hay grabación ni materiales.",
  heading: "Después del encuentro",
  loading: "Cargando la grabación y los materiales…",
  materialsHeading: "Materiales",
  openRecording: "Abrir grabación",
  reactionCount: (label: string, count: number) =>
    count === 1 ? `${label}: 1 persona` : `${label}: ${count} personas`,
  reactionsHeading: "¿Cómo estuvo?",
  reactionsReadOnly: "Solo los miembros activos pueden reaccionar.",
  recordingHeading: "Grabación",
  recordingTitle: (title: string) => `Grabación de ${title}`,
  retry: "Reintentar",
  savingResources: "Guardando la grabación y los materiales. Vas a poder editarlos cuando termine.",
} as const;

/**
 * Post-event block of a finished occurrence: the recording (embedded player
 * plus a link to open it), the materials, "¿Cómo estuvo?" reactions with
 * counts, and the manager actions. Presentational: the container owns the
 * requests and passes state and callbacks.
 */
export function TribeEventPostEventPanel({
  isSavingResources,
  loadState,
  occurrenceTitle,
  onConvertToLesson,
  onEditResources,
  onReact,
  onRetry,
  reactions,
}: TribeEventPostEventPanelProps) {
  if (loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading) {
    return (
      <section aria-label={COPY.heading} className={styles.TribeEventPostEventPanel}>
        <p className={styles.TribeEventPostEventPanel__heading}>{COPY.heading}</p>
        <p className={styles.TribeEventPostEventPanel__muted} role="status">
          {COPY.loading}
        </p>
      </section>
    );
  }

  if (loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error) {
    return (
      <section aria-label={COPY.heading} className={styles.TribeEventPostEventPanel}>
        <p className={styles.TribeEventPostEventPanel__heading}>{COPY.heading}</p>
        <p className={styles.TribeEventPostEventPanel__error} role="alert">
          {loadState.message}
        </p>
        <Button
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantOutline}
          onClick={onRetry}
        >
          {COPY.retry}
        </Button>
      </section>
    );
  }

  const { postEvent } = loadState;
  const { recording, viewerPermissions } = postEvent;
  const hasResources = recording !== null || postEvent.materials.length > 0;
  const visibleReactions = reactions ?? postEvent.reactions;

  return (
    <section aria-label={COPY.heading} className={styles.TribeEventPostEventPanel}>
      <p className={styles.TribeEventPostEventPanel__heading}>{COPY.heading}</p>

      {recording ? (
        <div className={styles.TribeEventPostEventPanel__recording}>
          <p className={styles.TribeEventPostEventPanel__subheading}>
            <VideoIcon aria-hidden />
            {COPY.recordingHeading}
          </p>
          <div className={styles.TribeEventPostEventPanel__player}>
            <iframe
              allow={PLAYER_IFRAME_ALLOW}
              allowFullScreen
              className={styles.TribeEventPostEventPanel__playerFrame}
              loading={LINK_ATTRIBUTE.lazy}
              src={recording.embedUrl}
              title={COPY.recordingTitle(occurrenceTitle)}
            />
          </div>
          <a
            className={styles.TribeEventPostEventPanel__link}
            href={recording.sourceUrl}
            rel={LINK_ATTRIBUTE.noreferrer}
            target={LINK_ATTRIBUTE.targetBlank}
          >
            <ExternalLinkIcon aria-hidden />
            {COPY.openRecording}
          </a>
        </div>
      ) : null}

      {postEvent.materials.length > 0 ? (
        <div className={styles.TribeEventPostEventPanel__materials}>
          <p className={styles.TribeEventPostEventPanel__subheading}>
            <FileTextIcon aria-hidden />
            {COPY.materialsHeading}
          </p>
          <ul className={styles.TribeEventPostEventPanel__materialList}>
            {postEvent.materials.map((material) => (
              <li key={material.url + material.title}>
                <a
                  className={styles.TribeEventPostEventPanel__link}
                  href={material.url}
                  rel={LINK_ATTRIBUTE.noreferrer}
                  target={LINK_ATTRIBUTE.targetBlank}
                >
                  <ExternalLinkIcon aria-hidden />
                  {material.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasResources ? null : <p className={styles.TribeEventPostEventPanel__muted}>{COPY.empty}</p>}

      {viewerPermissions.canManageResources || viewerPermissions.canConvertToLesson ? (
        <div className={styles.TribeEventPostEventPanel__actions}>
          {viewerPermissions.canManageResources ? (
            <Button
              aria-busy={isSavingResources}
              disabled={isSavingResources}
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantSecondary}
              onClick={onEditResources}
            >
              {hasResources ? COPY.editResources : COPY.addResources}
            </Button>
          ) : null}
          {viewerPermissions.canConvertToLesson ? (
            <Button
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={onConvertToLesson}
            >
              <GraduationCapIcon aria-hidden />
              {COPY.convertToLesson}
            </Button>
          ) : null}
        </div>
      ) : null}

      {viewerPermissions.canManageResources && isSavingResources ? (
        <p className={styles.TribeEventPostEventPanel__muted} role="status">
          {COPY.savingResources}
        </p>
      ) : null}

      <div
        aria-label={COPY.reactionsHeading}
        className={styles.TribeEventPostEventPanel__reactions}
        role="group"
      >
        <p className={styles.TribeEventPostEventPanel__subheading}>{COPY.reactionsHeading}</p>
        <div className={styles.TribeEventPostEventPanel__reactionButtons}>
          {TRIBE_EVENT_OCCURRENCE_REACTIONS.map((reaction) => {
            const display = TRIBE_EVENT_OCCURRENCE_REACTION_DISPLAY[reaction];
            const count = visibleReactions.counts[reaction];
            const isSelected = visibleReactions.viewerReaction === reaction;

            return (
              <button
                aria-label={COPY.reactionCount(display.label, count)}
                aria-pressed={isSelected}
                className={
                  isSelected
                    ? `${styles.TribeEventPostEventPanel__reaction} ${styles["TribeEventPostEventPanel__reaction--selected"]}`
                    : styles.TribeEventPostEventPanel__reaction
                }
                disabled={!viewerPermissions.canParticipate}
                key={reaction}
                title={display.label}
                type={BUTTON_ATTRIBUTE.typeButton}
                onClick={() => onReact(reaction)}
              >
                <span aria-hidden className={styles.TribeEventPostEventPanel__reactionEmoji}>
                  {display.emoji}
                </span>
                <span aria-hidden className={styles.TribeEventPostEventPanel__reactionCount}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {viewerPermissions.canParticipate ? null : (
          <p className={styles.TribeEventPostEventPanel__muted}>{COPY.reactionsReadOnly}</p>
        )}
      </div>
    </section>
  );
}
