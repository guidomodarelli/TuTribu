/** Composes actual restore owners without importing seeders, Vitest or administrative capabilities. */
import type { RequestDatabase, RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresMessagingConnectionActivation } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-activation";
import { PostgresMessagingConnectionDisconnection } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-disconnection";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresMessagingLifecycleDependencies } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-lifecycle-dependencies";
import { PostgresMessagingSelectionDependencies } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-selection-dependencies";
import { readAdmissionEmailLifecycleDependency } from "@/src/modules/notifications/infrastructure/repositories/admission-email-lifecycle-reader";
import { buildMessagingModule } from "@/src/modules/messaging/setup";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAdmissionActivationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { lockAcademyAdmissionMembershipScope } from "@/src/modules/tribes/infrastructure/repositories/lock-academy-admission-membership-scope";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_RESOURCE_SELECTION } from "@/src/modules/messaging/constants/messaging-connection";

/** Grants guarded transactions only; no branch administration, migration, seed or private connection access. */
export type MessagingRestoreSql = {
  withContext: <Result>(context: RequestDatabaseContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
};
/** Identifies the actual session; the composed provider independently checks its current stored authority. */
export type MessagingRestorePrincipal = { actorUserId: string; sessionId: string };

/**
 * @param database - Exact owned SQL capability, independent of any parent's captured closures.
 * @param principal - Original session identity; not a caller-selected substitute account.
 * @param readSecurityConfig - Current external recovery state, never a restored row.
 * @returns Actual identity, credential and lifecycle owners suitable for the hosted restore scenario.
 */
export function composeMessagingRestoreOwnersForPrincipal(database: MessagingRestoreSql, principal: MessagingRestorePrincipal, readSecurityConfig: () => Promise<MessagingSecurityConfig>) {
  const execute = <Result>(context: { actorUserId: string }, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext({ userId: context.actorUserId, email: null }, run);
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: principal.actorUserId, sessionId: principal.sessionId }), (_identity, run) => execute(principal, run));
  const request = buildMessagingModule({ accounts, clock: () => new Date(), execute: (_account, run) => execute(principal, run) }).createRequestModule({ selection: MESSAGING_RESOURCE_SELECTION.management, readSecurityConfig });
  return {
    accounts, request,
    activation: new PostgresMessagingConnectionActivation(execute, readSecurityConfig, (transaction) => new PostgresMessagingSelectionDependencies(transaction, readAdmissionEmailLifecycleDependency)),
    disconnection: new PostgresMessagingConnectionDisconnection(execute, readSecurityConfig, (transaction) => new PostgresMessagingLifecycleDependencies(transaction, readAdmissionEmailLifecycleDependency)),
    secrets: new PostgresEncryptedSecretStore({ executeWithDatabase: (actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), accounts, readSecurityConfig, purpose: MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader }),
  };
}

/**
 * @param database - Exact owned current or restored SQL capability.
 * @param principal - Actual original leader session.
 * @param readSecurityConfig - Current external keyrings, epoch and recovery lock.
 * @returns The installed policy, preflight, verification and admission owners, without test-runner dependencies.
 */
export function composeAdmissionRestoreOwnersForPrincipal(database: MessagingRestoreSql, principal: MessagingRestorePrincipal, readSecurityConfig: () => Promise<MessagingSecurityConfig>) {
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: principal.actorUserId, sessionId: principal.sessionId }), (_identity, run) => database.withContext({ userId: principal.actorUserId, email: null }, run));
  const admissions = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (_account, run) => database.withContext({ userId: principal.actorUserId, email: null }, run) });
  const runtime = admissions.createManualRequestModule({ readSecurityConfig }).runtime;
  const readRecoveryLock = async () => (await readSecurityConfig()).recoveryLocked;
  return {
    policy: admissions.createPolicyModule({ readSecurityConfig, composePreflight: (transaction, context) => new PostgresAdmissionActivationRepository(transaction, context, runtime, readRecoveryLock) }).useCases,
    preflight: admissions.createPreflightModule({ runtime, readRecoveryLock }).useCases,
    verification: new PostgresAdmissionContactVerificationOperations((scope, run) => database.withContext({ userId: scope.userId, email: null }, run), readSecurityConfig),
    requests: new PostgresAdmissionRequestRepository((scope, run) => database.withContext({ userId: scope.userId, email: null }, run), readSecurityConfig, (transaction) => ({ memberships: createAcademyApprovedMembershipWriter(transaction), notifications: createPostgresAdmissionNotificationObligationWriter(transaction), lockSubmissionScope: (scope) => lockAcademyAdmissionMembershipScope(transaction, scope.tribeId, scope.userId) })),
  };
}
