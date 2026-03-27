const COMMUNITY_SLUG_CONFLICT_ERROR_MESSAGE = "Community slug is already taken.";

export class CommunitySlugConflictError extends Error {
  constructor(message = COMMUNITY_SLUG_CONFLICT_ERROR_MESSAGE) {
    super(message);
    this.name = CommunitySlugConflictError.name;
  }
}
