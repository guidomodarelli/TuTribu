/** Owns the historical opaque lookup setting used only inside server transactions. @module tribe-invitation-database-context */
/** Identifies the PostgreSQL lookup context; it is never a client permission. */
export const TRIBE_INVITATION_DATABASE_CONTEXT = { currentInvitationHash: "app.current_invitation_hash" } as const;
