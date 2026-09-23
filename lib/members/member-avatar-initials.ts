const MAX_INITIALS = 2;
const NAME_PARTS_PATTERN = /\s+/;
const FALLBACK_INITIAL = "?";

/**
 * Initials shown by an avatar while (or instead of) loading the image.
 *
 * @param name - Public display name of a member.
 * @returns Up to two uppercase initials, or "?" for an empty name.
 */
export function getMemberAvatarInitials(name: string): string {
  const initials = name
    .trim()
    .split(NAME_PARTS_PATTERN)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || FALLBACK_INITIAL;
}
