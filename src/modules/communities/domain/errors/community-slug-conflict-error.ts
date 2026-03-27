export class CommunitySlugConflictError extends Error {
  constructor(message = "Community slug is already taken.") {
    super(message);
    this.name = CommunitySlugConflictError.name;
  }
}
