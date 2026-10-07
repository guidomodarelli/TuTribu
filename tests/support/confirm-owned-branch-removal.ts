/** Confirms exact owned-resource absence after one delete, including a lost deletion response. @module confirm-owned-branch-removal */

/**
 * Never repeats a possibly accepted DELETE; the caller has already verified the exact branch identity.
 * @param remove - One administrative DELETE bound to the verified owned id.
 * @param remains - Read-only exact-id presence check after that attempt.
 * @returns Nothing only after confirmed absence.
 * @throws The original/lookup failures when absence cannot be proven.
 */
export async function confirmOwnedBranchRemoval(remove: () => Promise<unknown>, remains: () => Promise<boolean>): Promise<void> {
  let failed = false, removalError: unknown;
  try { await remove(); } catch (error) { failed = true; removalError = error; }
  let present: boolean;
  try { present = await remains(); }
  catch (error) { throw new AggregateError([...(failed ? [removalError] : []), error], "Owned branch absence could not be confirmed", { cause: failed ? removalError : error }); }
  if (present) throw new AggregateError([...(failed ? [removalError] : []), new Error("Exact owned branch remains present")], "Owned branch removal did not reach confirmed absence", { cause: removalError });
}
