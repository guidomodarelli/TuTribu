const COMMUNITY_SLUG_RESERVED_VALUES = new Set(["crear"]);

export function normalizeCommunitySlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isReservedCommunitySlug(slug: string): boolean {
  return COMMUNITY_SLUG_RESERVED_VALUES.has(slug.trim().toLowerCase());
}

export function buildCommunitySlugSuggestion(baseSlug: string, index: number): string {
  return `${baseSlug}-${index}`;
}
