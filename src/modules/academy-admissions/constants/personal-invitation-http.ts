/** Owns fixed administrative route actions and diagnostic names independently of caller input. @module personal-invitation-http */
/** Administrative reads and writes have distinct intents; revocation never becomes another action automatically. */
export const PERSONAL_INVITATION_HTTP_ACTION = { list: "list", read: "read", create: "create", rename: "rename", revoke: "revoke" } as const;
/** Diagnostics identify only the public operation template, never its recipient or secret URL. */
export const PERSONAL_INVITATION_HTTP_OPERATION = { list: "personal-invitation-list", read: "personal-invitation-read", create: "personal-invitation-create", rename: "personal-invitation-rename", revoke: "personal-invitation-revoke" } as const;
