/** Runs one leader page read for the same live account from its first identity read to its final render. @module live-account-tribe-page-read */
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";

/** Account facts whose continuity a private page read checks. */
type LiveSessionAccount = { userId: string; session: { id: string; expiresAt: Date } };

/** Once-validated page route and safe correlation. */
export type TribePageQuery = { slug: string; requestId: string };

/** Canonical tenant resolution of the page slug. */
type TribePageResolution<TribeFailure> = { ok: true; value: { tribeId: string } } | { ok: false; failure: TribeFailure };

/** Native ports of a leader page read and its own closed authentication failure. */
type LiveAccountTribePageOwner<Account extends LiveSessionAccount, TribeFailure, Rejected> = {
  accounts: { getAuthenticatedAccount(): Promise<Account | null> };
  clock: () => Date;
  resolveTribe: { execute(query: TribePageQuery): Promise<TribePageResolution<TribeFailure>> };
  /** @returns The owner's authentication-required error, thrown whenever the account is absent, expired or replaced. */
  authenticationRequired: () => Error;
  /** @param failure - Canonical routing failure. @returns The owner's own failure result. */
  rejectTribe: (failure: TribeFailure) => Rejected;
};

/** Live first account, resolved tenant and the final continuity check of one page read. */
type OpenedTribePageRead<Account> = {
  first: Account;
  tribeId: string;
  /** @returns The same live account and the render clock sampled after every awaited read. @throws The owner's authentication-required error when the account changed or expired. */
  confirm: () => Promise<{ current: Account; now: Date }>;
};

/** Closed failures of one page owner: authentication required, its own routing failure and the closing of any throw. */
export type TribePageFailures<TribeFailure, Rejected, Failed> = Pick<LiveAccountTribePageOwner<LiveSessionAccount, TribeFailure, Rejected>, "authenticationRequired" | "rejectTribe"> & {
  /** @param error - Any throw of the page read. @returns The owner's closed failure, never partial private data. */
  closeFailure: (error: unknown) => Failed;
};

/** Leader page read whose account stays the same live account from its first identity read to its final render. */
export abstract class LiveAccountTribePageUseCase<Account extends LiveSessionAccount, TribeFailure, Rejected, Failed> {
  /** Native identity, clock, routing and the owner's closed routing and authentication failures. */
  private readonly owner: LiveAccountTribePageOwner<Account, TribeFailure, Rejected>;
  /** The owner's closing of any throw of the read. */
  private readonly closeFailure: (error: unknown) => Failed;

  /** @param accounts - Native current account. @param readers - Canonical tenant routing among the page readers. @param clock - Render clock sampled after awaited reads. @param failures - The owner's closed failures. */
  protected constructor(accounts: LiveAccountTribePageOwner<Account, TribeFailure, Rejected>["accounts"], readers: Pick<LiveAccountTribePageOwner<Account, TribeFailure, Rejected>, "resolveTribe">, clock: () => Date, failures: TribePageFailures<TribeFailure, Rejected, Failed>) {
    this.owner = { accounts, resolveTribe: readers.resolveTribe, clock, authenticationRequired: failures.authenticationRequired, rejectTribe: failures.rejectTribe };
    this.closeFailure = failures.closeFailure;
  }

  /** @param query - Once-validated slug and correlation. @param read - Authorized reads and projection of the resolved tenant. @returns The read result, the owner's routing failure, or any throw closed by the owner. */
  protected async readPage<Result>(query: TribePageQuery, read: (opened: OpenedTribePageRead<Account>) => Promise<Result>): Promise<Result | Rejected | Failed> {
    try { return await readLiveAccountTribePage(this.owner, query, read); } catch (error) { return this.closeFailure(error); }
  }
}

/**
 * @param owner - Native identity, clock, routing and the owner's failure mapping.
 * @param query - Once-validated slug and correlation.
 * @param read - Authorized reads and projection for the resolved tenant; it confirms the account before rendering.
 * @returns The read result, or the owner's routing failure.
 * @throws The owner's authentication-required error when no live account starts the read; owners map every throw to their closed failure.
 */
async function readLiveAccountTribePage<Account extends LiveSessionAccount, TribeFailure, Rejected, Result>(owner: LiveAccountTribePageOwner<Account, TribeFailure, Rejected>, query: TribePageQuery, read: (opened: OpenedTribePageRead<Account>) => Promise<Result>): Promise<Result | Rejected> {
  const first = await owner.accounts.getAuthenticatedAccount();
  if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, owner.clock())) throw owner.authenticationRequired();
  const tribe = await owner.resolveTribe.execute(query);
  if (!tribe.ok) return owner.rejectTribe(tribe.failure);
  const confirm = async () => {
    const current = await owner.accounts.getAuthenticatedAccount(), now = owner.clock();
    if (current?.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now)) throw owner.authenticationRequired();
    return { current, now };
  };
  return read({ first, tribeId: tribe.value.tribeId, confirm });
}
