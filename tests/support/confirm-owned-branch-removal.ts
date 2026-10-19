/** Confirms exact owned-resource absence after a bounded series of deletes, including a lost deletion response. @module confirm-owned-branch-removal */
import { setTimeout as delay } from "node:timers/promises";
import { OWNED_BRANCH_REMOVAL } from "./constants/academy-admission-database";

/** Test seams only; production cleanup uses the shared bounds. */
type OwnedBranchRemovalOptions = { attempts?: number; retryDelayMs?: number; wait?: (milliseconds: number) => Promise<unknown> };

/**
 * Deletes one exact, already verified branch id until its absence is confirmed. A DELETE of that id is idempotent, so
 * a refused attempt (for example while the provider still runs another operation on the branch) is repeated after a
 * bounded wait; a lost response is resolved by the presence check instead of being assumed.
 * @param remove - One administrative DELETE bound to the verified owned id.
 * @param remains - Read-only exact-id presence check after each attempt.
 * @param options - Optional bounds for tests.
 * @returns Nothing only after confirmed absence.
 * @throws AggregateError with every delete/lookup failure when absence cannot be proven within the bounds.
 */
export async function confirmOwnedBranchRemoval(remove: () => Promise<unknown>, remains: () => Promise<boolean>, options: OwnedBranchRemovalOptions = {}): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? OWNED_BRANCH_REMOVAL.attempts), wait = options.wait ?? delay, retryDelayMs = options.retryDelayMs ?? OWNED_BRANCH_REMOVAL.retryDelayMs;
  const failures: unknown[] = [];
  let lookupFailed = false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { await remove(); } catch (error) { failures.push(error); }
    try {
      lookupFailed = false;
      if (!(await remains())) return;
    } catch (error) { lookupFailed = true; failures.push(error); }
    if (attempt < attempts) await wait(retryDelayMs * attempt);
  }
  if (lookupFailed) throw new AggregateError(failures, "Owned branch absence could not be confirmed", { cause: failures.at(-1) });
  throw new AggregateError([...failures, new Error("Exact owned branch remains present")], "Owned branch removal did not reach confirmed absence", { cause: failures[0] });
}
