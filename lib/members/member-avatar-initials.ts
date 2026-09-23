const DEFAULT_MAX_INITIALS = 2;
const NAME_PARTS_PATTERN = /\s+/;
const INITIAL_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;
const FALLBACK_INITIAL = "?";

export type MemberAvatarInitialsOptions = {
  /** How many initials to keep; stacked avatars leave room for only one. */
  maxInitials?: number;
};

/**
 * Initials shown by an avatar while (or instead of) loading the image. Each
 * name part contributes its first letter or digit, so quotes, punctuation and
 * symbols never become an initial.
 *
 * @param name - Public display name of a member.
 * @param options - Optional limit on the number of initials.
 * @returns Up to `maxInitials` uppercase initials, or "?" when the name has no
 * letters or digits.
 */
export function getMemberAvatarInitials(
  name: string,
  { maxInitials = DEFAULT_MAX_INITIALS }: MemberAvatarInitialsOptions = {}
): string {
  const initials = name
    .trim()
    .split(NAME_PARTS_PATTERN)
    .map((part) => part.match(INITIAL_CHARACTER_PATTERN)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, maxInitials)
    .map((initial) => initial.toUpperCase())
    .join("");

  return initials || FALLBACK_INITIAL;
}
