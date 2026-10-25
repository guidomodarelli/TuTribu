/** Accumulates the pages of a leader list so «Ver más» adds to what is already shown instead of replacing it. @module admission-list-pages */

/** Any listed resource the server identifies with a stable id. */
type IdentifiedItem = { id: string };

/**
 * @param shown - Items already on screen, in their order.
 * @param following - The page that the shown cursor pointed to.
 * @returns The shown items followed by the new ones; an item that appears in both keeps its place and takes the newer copy, so nothing is listed twice.
 */
export function appendAdmissionListPage<Item extends IdentifiedItem>(shown: readonly Item[], following: readonly Item[]): Item[] {
  const newer = new Map(following.map((item) => [item.id, item]));
  const shownIds = new Set(shown.map((item) => item.id));
  return [...shown.map((item) => newer.get(item.id) ?? item), ...following.filter((item) => !shownIds.has(item.id))];
}

/**
 * @param firstPage - A fresh read of the first page with the same filters.
 * @param shown - Items already on screen, which may span several pages.
 * @returns The fresh first page followed by the older shown items it no longer covers, so rereading never shrinks what the leader already loaded.
 */
export function refreshAdmissionListFirstPage<Item extends IdentifiedItem>(firstPage: readonly Item[], shown: readonly Item[]): Item[] {
  const freshIds = new Set(firstPage.map((item) => item.id));
  return [...firstPage, ...shown.filter((item) => !freshIds.has(item.id))];
}
