/** Resolves current global account and admission-owned actor/resource facts before private operations. */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { canPerformAdmissionAction, type AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionAuthorizationReader, AdmissionContextCommand, AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import { admissionFailure, type AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_DECISION_ACTIONS, ADMISSION_OWN_REQUEST_ACTIONS, ADMISSION_OPERATION_SCOPED_ACTIONS, ADMISSION_RESOURCE_KIND, ADMISSION_SENSITIVE_OPERATIONS } from "@/src/modules/academy-admissions/constants/admission-authorization";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { REAUTHENTICATION_OPERATION_RESOURCE, REAUTHENTICATION_RESOURCE_KIND } from "@/src/modules/auth/constants/reauthentication-resources";

/** Own private resolver; its context is not a browser permission token or a substitute for writer authority. */
export class ResolveAdmissionContextUseCase {
  /**
   * @param accounts - Current global private account projection.
   * @param authorization - Admission-owned current actor and scoped resource readers.
   * @param clock - Fresh time sampled after awaited facts, including resource waits.
   */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly authorization: AdmissionAuthorizationReader, private readonly clock: () => Date) {}

  /**
   * Applies current permission twice, with exact resource ownership and an explicit operation scope.
   * The active session of the current authorized actor is sufficient; no recent account confirmation is required.
   * Maintenance uses its separate authenticated server root and cannot be requested here.
   * @param command - Fixed server action and boundary-validated resource identifiers, without caller identity.
   * @returns A minimal private context or closed own failure before any secret/provider access.
   */
  async execute(command: AdmissionContextCommand): Promise<{ allowed: true; context: AuthorizedAdmissionContext } | { allowed: false; failure: AdmissionFailure }> {
    const deny = (code: AdmissionFailure["code"]) => ({ allowed: false as const, failure: admissionFailure(code) });
    const initialAccount = await this.accounts.getAuthenticatedAccount();
    if (!initialAccount || !isAuthenticatedSessionLive(initialAccount.session.expiresAt, this.clock())) return deny(ADMISSION_ERROR_CODE.authenticationRequired);
    const initialActor = await this.authorization.getCurrentActor(command.tribeId, initialAccount.userId);
    const hasActor = (actor: AdmissionActorFacts | null): actor is AdmissionActorFacts => actor?.userId === initialAccount.userId && actor.tribeId === command.tribeId;
    const ownRequest = ADMISSION_OWN_REQUEST_ACTIONS.has(command.action);
    const decision = ADMISSION_DECISION_ACTIONS.has(command.action);
    if ((ownRequest || decision) && command.resource?.kind !== ADMISSION_RESOURCE_KIND.request) return deny(ADMISSION_ERROR_CODE.invalidInput);
    const sensitiveOperations = ADMISSION_SENSITIVE_OPERATIONS[command.action];
    if (!hasActor(initialActor)) return deny(ADMISSION_ERROR_CODE.permissionDenied);
    if (!ownRequest && !mayReadAdmissionResource(initialActor, command, decision)) return deny(ADMISSION_ERROR_CODE.permissionDenied);
    if (!hasValidSensitiveOperation(command, sensitiveOperations)) return deny(ADMISSION_ERROR_CODE.invalidInput);
    const resource = command.resource ? await this.authorization.getResource(command.tribeId, command.resource) : null;
    if (command.resource && (resource?.id !== command.resource.id || resource.tribeId !== command.tribeId)) return deny(ADMISSION_ERROR_CODE.resourceUnavailable);
    const account = await this.accounts.getAuthenticatedAccount();
    if (account?.userId !== initialAccount.userId || account.session.id !== initialAccount.session.id) return deny(ADMISSION_ERROR_CODE.authenticationRequired);
    const actor = await this.authorization.getCurrentActor(command.tribeId, account.userId);
    const now = this.clock();
    if (!isAuthenticatedSessionLive(account.session.expiresAt, now)) return deny(ADMISSION_ERROR_CODE.authenticationRequired);
    const target = { tribeId: command.tribeId, ...applicantOf(resource) };
    if (!hasActor(actor) || !canPerformAdmissionAction(actor, command.action, target)) return deny(ADMISSION_ERROR_CODE.permissionDenied);
    const resourceId = resource?.id ?? command.tribeId;
    return { allowed: true, context: { userId: account.userId, sessionId: account.session.id, tribeId: command.tribeId, requestId: command.requestId, action: command.action, role: actor.role, membershipStatus: actor.status, resourceId, ...applicantOf(resource), ...(command.sensitiveOperation ? { sensitiveOperation: command.sensitiveOperation } : {}) } };
  }
}

/** @param resource - Resolved scoped resource, if any. @returns Its applicant, only when it has one. */
function applicantOf(resource: { applicantUserId?: string } | null): { applicantUserId?: string } {
  return resource?.applicantUserId ? { applicantUserId: resource.applicantUserId } : {};
}

/** @param actor - Current actor of the tribe. @param command - Requested action. @param decision - Whether the action decides a request. @returns Whether the actor may read the resource: active leaders and guardians for decisions, else the action permission. */
function mayReadAdmissionResource(actor: AdmissionActorFacts, command: AdmissionContextCommand, decision: boolean): boolean {
  if (decision) return actor.status === TRIBE_MEMBERSHIP_STATUS.active && (actor.role === TRIBE_MEMBER_ROLE.leader || actor.role === TRIBE_MEMBER_ROLE.guardian);
  return canPerformAdmissionAction(actor, command.action, { tribeId: command.tribeId });
}

/** @param command - Requested action. @param sensitiveOperations - Operations allowed for that action. @returns Whether the operation scope is present when required, allowed for the action and bound to the requested resource kind. */
function hasValidSensitiveOperation(command: AdmissionContextCommand, sensitiveOperations: (typeof ADMISSION_SENSITIVE_OPERATIONS)[AdmissionContextCommand["action"]]): boolean {
  if (!command.sensitiveOperation) return !ADMISSION_OPERATION_SCOPED_ACTIONS.has(command.action);
  if (!sensitiveOperations?.includes(command.sensitiveOperation)) return false;
  return REAUTHENTICATION_OPERATION_RESOURCE[command.sensitiveOperation] === (command.resource?.kind ?? REAUTHENTICATION_RESOURCE_KIND.tribe);
}
