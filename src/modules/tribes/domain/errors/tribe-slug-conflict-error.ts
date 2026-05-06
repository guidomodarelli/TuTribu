const TRIBE_SLUG_CONFLICT_ERROR_MESSAGE = "Tribe slug is already taken.";

export class TribeSlugConflictError extends Error {
  constructor(message = TRIBE_SLUG_CONFLICT_ERROR_MESSAGE) {
    super(message);
    this.name = TribeSlugConflictError.name;
  }
}
