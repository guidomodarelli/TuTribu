/** Owns resource selection and bounded continuation vocabulary independently of provider cursors. @module messaging-resources */
export const MESSAGING_RESOURCE_KIND={senders:"senders",templates:"templates"} as const;
/** Continuations contain only own scope/offset; they never confer authority or preserve an upstream cursor. */
export const MESSAGING_RESOURCE_CURSOR_MAXIMUM_OFFSET=5_000;
