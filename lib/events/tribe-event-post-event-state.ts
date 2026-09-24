/**
 * Load state shared by the post-event hooks (resources, conversation, lesson
 * targets) and the panels that render them.
 */
export const TRIBE_EVENT_POST_EVENT_LOAD_STATUS = {
  error: "error",
  idle: "idle",
  loaded: "loaded",
  loading: "loading",
} as const;

export type TribeEventLoadState<TData> =
  | { status: typeof TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading }
  | { message: string; status: typeof TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error }
  | ({ status: typeof TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded } & TData);

/**
 * Load state of data fetched on demand (idle until requested).
 */
export type TribeEventOnDemandLoadState<TData> =
  | { status: typeof TRIBE_EVENT_POST_EVENT_LOAD_STATUS.idle }
  | TribeEventLoadState<TData>;

/**
 * Debounce before a reaction change is sent: rapid taps coalesce into the
 * latest intent while the UI updates immediately.
 */
export const TRIBE_EVENT_REACTION_FLUSH_DELAY_MS = 400;
