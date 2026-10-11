/** Binds explicit tribe lifecycle commands to native identity while keeping authorization in the atomic owner. @module manage-tribe-lifecycle-use-cases */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { TRIBE_LIFECYCLE_ACTIONS, TRIBE_LIFECYCLE_ACTION, TRIBE_LIFECYCLE_ERROR } from "../../constants/tribe-lifecycle";
import { TribeLifecycleError } from "../../domain/errors/tribe-lifecycle-error";
import type { TribeLifecycleContext, TribeLifecycleInput, TribeLifecycleWriter, TribeLifecycleResult } from "../../domain/repositories/tribe-lifecycle-repository";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";

/** Recovery needs a live original actor account, including after its tribe no longer exists. */
export class ManageTribeLifecycleUseCases {
  /** @param accounts - Native session/account port. @param writer - Atomic current-authority owner. @param clock - Fresh account-lifetime clock. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly writer: TribeLifecycleWriter, private readonly clock: () => Date = () => new Date()) {}
  /** @param command - Boundary-validated original and exact UUID scope. @returns Native private identity without accepting actor, role or reauthentication flags. */
  private async context(command: { tribeId: string; requestId: string } & TribeLifecycleInput): Promise<TribeLifecycleContext> {
    const account = await this.accounts.getAuthenticatedAccount();
    if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, this.clock())) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.authenticationRequired);
    if (!command.confirmed || !TRIBE_LIFECYCLE_ACTIONS.includes(command.action) || !Number.isSafeInteger(command.expectedConfigVersion) || command.expectedConfigVersion < 0) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.invalidInput);
    return { tribeId: command.tribeId, actorUserId: account.userId, sessionId: account.session.id, requestId: command.requestId };
  }
  /** @param input - Exact original. @param result - Durable owner result. @returns The result after checking its identity and action semantics. */
  private bind(input: TribeLifecycleInput, result: AdmissionOperationResult<TribeLifecycleResult>) {
    const deleted = input.action === TRIBE_LIFECYCLE_ACTION.deleteTribe;
    if (result.operationId !== input.operationId || result.state === OPERATION_STATE.completed && (result.result.action !== input.action || result.result.deleted !== deleted || result.result.accessModel !== (deleted ? null : TRIBE_ACCESS_MODEL.legacy) || (deleted ? result.result.configVersion !== null : result.result.configVersion !== input.expectedConfigVersion + 1))) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.publicContractUnusable);
    return result;
  }
  /** @param command - Explicitly confirmed original command. @returns Its durable result without changing unrelated memberships or product grants on academy exit. */
  async change(command: { tribeId: string; requestId: string } & TribeLifecycleInput): Promise<AdmissionOperationResult<TribeLifecycleResult>> {
    try { return this.bind(command, await this.writer.change(await this.context(command), command)); }
    catch (error) { if (error instanceof TribeLifecycleError && (error.code !== TRIBE_LIFECYCLE_ERROR.operationUnresolved || error.operationId === command.operationId)) throw error; throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.unexpectedFailure, { cause: error }); }
  }
  /** @param command - The same original intent. @returns A known original or null, without repeating deletion or mode changes. */
  async recover(command: { tribeId: string; requestId: string } & TribeLifecycleInput): Promise<AdmissionOperationResult<TribeLifecycleResult> | null> {
    try { const result = await this.writer.recover(await this.context(command), command); return result ? this.bind(command, result) : null; }
    catch (error) { if (error instanceof TribeLifecycleError && (error.code !== TRIBE_LIFECYCLE_ERROR.operationUnresolved || error.operationId === command.operationId)) throw error; throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.unexpectedFailure, { cause: error }); }
  }
}
