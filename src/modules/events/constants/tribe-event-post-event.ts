/**
 * Catalog and limits of the post-event resources of an occurrence:
 * recording, materials, "¿Cómo estuvo?" reactions, and the conversation.
 * Values mirror the CHECKs of the phase 6 migrations
 * (`20260927120000`–`20260927122000`).
 */

/**
 * Quick reactions a member can leave on a finished occurrence (one per
 * member and occurrence). Stored values mirror
 * `event_occurrence_reactions_valid_reaction`.
 */
export const TRIBE_EVENT_OCCURRENCE_REACTION = {
  fire: "fire",
  neutral: "neutral",
  thumbsUp: "thumbs_up",
} as const;

/**
 * Display order of the reaction buttons.
 */
export const TRIBE_EVENT_OCCURRENCE_REACTIONS = [
  TRIBE_EVENT_OCCURRENCE_REACTION.fire,
  TRIBE_EVENT_OCCURRENCE_REACTION.thumbsUp,
  TRIBE_EVENT_OCCURRENCE_REACTION.neutral,
] as const;

/**
 * Emoji and accessible Spanish label of each reaction.
 */
export const TRIBE_EVENT_OCCURRENCE_REACTION_DISPLAY = {
  [TRIBE_EVENT_OCCURRENCE_REACTION.fire]: { emoji: "🔥", label: "Estuvo genial" },
  [TRIBE_EVENT_OCCURRENCE_REACTION.thumbsUp]: { emoji: "👍", label: "Estuvo bien" },
  [TRIBE_EVENT_OCCURRENCE_REACTION.neutral]: { emoji: "😐", label: "Más o menos" },
} as const;

/**
 * Limits of the post-event resources. `materialsMax` bounds the list a
 * manager saves at once; lengths mirror the SQL CHECKs.
 * `recordingExternalIdMaxLength` mirrors
 * `event_occurrence_recordings_valid_external_id`: the shared video parser
 * accepts unbounded Wistia and Vimeo ids, so a longer parsed id is an
 * invalid recording instead of a constraint violation.
 */
export const TRIBE_EVENT_POST_EVENT_LIMIT = {
  commentListSize: 200,
  commentMaxLength: 2000,
  materialTitleMaxLength: 120,
  materialsMax: 10,
  recordingExternalIdMaxLength: 200,
  urlMaxLength: 2048,
} as const;
