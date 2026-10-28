/** Binds confirmed membership actions and original recovery to the current native session. @module manage-tribe-membership-use-cases */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { TribeMembershipLifecycleInput, TribeMembershipLifecycleWriter, TribeMembershipLifecycleContext, TribeMembershipLifecycleResult } from "../../domain/repositories/tribe-membership-lifecycle-repository";
import { TribeMembershipLifecycleError } from "../../domain/errors/tribe-membership-lifecycle-error";
import { TRIBE_MEMBERSHIP_LIFECYCLE_ACTIONS, TRIBE_MEMBERSHIP_LIFECYCLE_ACTION, TRIBE_MEMBERSHIP_LIFECYCLE_ERROR, TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME } from "../../constants/tribe-membership-lifecycle";
import { TRIBE_MEMBERSHIP_STATUS } from "../../constants/tribe-page-access";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";

/** Resolves native identity before delegating to the writer that rechecks authority under locks. */
export class ManageTribeMembershipUseCases {
  /** @param accounts - Current native identity port. @param writer - Atomic membership owner. @param clock - Fresh clock sampled after the identity read. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly writer: TribeMembershipLifecycleWriter, private readonly clock: () => Date = () => new Date()) {}

  /** @param command - Boundary-validated tenant, correlation and exact original intent. @returns Native private scope without accepting a caller actor or session. */
  private async context(command: { tribeId: string; requestId: string } & TribeMembershipLifecycleInput): Promise<TribeMembershipLifecycleContext> {
    const account = await this.accounts.getAuthenticatedAccount();
    if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, this.clock())) throw new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.authenticationRequired);
    if (!command.confirmed || !TRIBE_MEMBERSHIP_LIFECYCLE_ACTIONS.includes(command.action)) throw new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.invalidInput);
    return { tribeId: command.tribeId, requestId: command.requestId, actorUserId: account.userId, sessionId: account.session.id };
  }

  /** @param input - Original command. @param result - Owner's original result. @returns The same result after binding its public identity and state to the command. */
  private bind(input: TribeMembershipLifecycleInput, result: AdmissionOperationResult<TribeMembershipLifecycleResult>): AdmissionOperationResult<TribeMembershipLifecycleResult> {
    const expectsDeletion = input.action === TRIBE_MEMBERSHIP_LIFECYCLE_ACTION.leave;
    if (result.operationId !== input.operationId || result.state === OPERATION_STATE.completed && result.result.outcome === TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.changed && (result.result.memberId !== input.memberId || result.result.action !== input.action || result.result.deleted !== expectsDeletion || result.result.status !== (input.action === TRIBE_MEMBERSHIP_LIFECYCLE_ACTION.block ? TRIBE_MEMBERSHIP_STATUS.blocked : TRIBE_MEMBERSHIP_STATUS.removed))) throw new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.publicContractUnusable);
    return result;
  }

  /** @param command - Confirmed command carrying no authority flags. @returns Its original durable membership result. @throws A typed safe failure retaining its private cause. */
  async change(command: { tribeId: string; requestId: string } & TribeMembershipLifecycleInput): Promise<AdmissionOperationResult<TribeMembershipLifecycleResult>> {
    try { return this.bind(command, await this.writer.change(await this.context(command), command)); }
    catch (error) { if (error instanceof TribeMembershipLifecycleError) throw error; throw new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.unexpectedFailure, { cause: error }); }
  }

  /** @param command - The same confirmed original intent. @returns A known original or null, without repeating a write. */
  async recover(command: { tribeId: string; requestId: string } & TribeMembershipLifecycleInput): Promise<AdmissionOperationResult<TribeMembershipLifecycleResult> | null> {
    try { const result = await this.writer.recover(await this.context(command), command); return result ? this.bind(command, result) : null; }
    catch (error) { if (error instanceof TribeMembershipLifecycleError) throw error; throw new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.unexpectedFailure, { cause: error }); }
  }
}
