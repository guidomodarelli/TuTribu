const COMMUNITY_SLUG_BUILD_SEPARATOR = "-";
const COMMUNITY_SLUG_NORMALIZATION_FORM = "NFD";
const COMMUNITY_SLUG_RESERVED_VALUE_LIST = ["crear"] as const;
const COMMUNITY_SLUG_RESERVED_VALUES = new Set<string>(COMMUNITY_SLUG_RESERVED_VALUE_LIST);
const EMPTY_TEXT = "";

export function normalizeCommunitySlug(input: string): string {
  return input
    .normalize(COMMUNITY_SLUG_NORMALIZATION_FORM)
    .replace(/[\u0300-\u036f]/g, EMPTY_TEXT)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, COMMUNITY_SLUG_BUILD_SEPARATOR)
    .replace(/^-+|-+$/g, EMPTY_TEXT)
    .replace(/-{2,}/g, COMMUNITY_SLUG_BUILD_SEPARATOR);
}

export function isReservedCommunitySlug(slug: string): boolean {
  return COMMUNITY_SLUG_RESERVED_VALUES.has(slug.trim().toLowerCase());
}

export function buildCommunitySlugSuggestion(baseSlug: string, index: number): string {
  return `${baseSlug}${COMMUNITY_SLUG_BUILD_SEPARATOR}${index}`;
}
