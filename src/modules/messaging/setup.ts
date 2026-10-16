/** Composes implemented human and worker messaging capabilities without global clients or key defaults. @module messaging-setup */
import "server-only";
import { RotateMessagingProtectionKeysUseCase } from "./application/use-cases/rotate-messaging-protection-keys-use-case";
import { PostgresMessagingProtectionKeyRotation, type MessagingProtectionKeyRotationDependencies } from "./infrastructure/repositories/postgres-messaging-protection-key-rotation";
import { PurgeMessagingSecretsUseCase } from "./application/use-cases/purge-messaging-secrets-use-case";
import { PostgresMessagingRetentionRepository } from "./infrastructure/repositories/postgres-messaging-retention-repository";
import { ExpireMessagingCandidatesUseCase } from "./application/use-cases/expire-messaging-candidates-use-case";
import { PostgresMessagingCandidateExpiration, type CandidateExpirationDatabaseExecutor, type CandidateExpirationGate } from "./infrastructure/repositories/postgres-messaging-candidate-expiration";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import { createTransactionAccountProvider } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "./infrastructure/config/messaging-security-config";
import { ResolveMessagingContextUseCase, LoadAuthorizedMessagingSecretUseCase } from "./application/use-cases/resolve-messaging-context-use-case";
import { ManageMessagingUsageUseCases } from "./application/use-cases/manage-messaging-usage-use-cases";
import { ManageMessagingConnectionsUseCases } from "./application/use-cases/manage-messaging-connections-use-cases";
import {ReadMessagingConnectionOperationUseCase} from "./application/use-cases/read-messaging-connection-operation-use-case";
import {GetMessagingConnectionsPageUseCase} from "./application/use-cases/get-messaging-connections-page-use-case";
import {PostgresMessagingConnectionOperationReader} from "./infrastructure/repositories/postgres-messaging-connection-operation-reader";
import { PostgresMessagingConnectionRepository } from "./infrastructure/repositories/postgres-messaging-connection-repository";
import { PostgresMessagingCredentialValidation } from "./infrastructure/repositories/postgres-messaging-credential-validation";
import { ValidateMessagingConnectionUseCase } from "./application/use-cases/validate-messaging-connection-use-case";
import type { MessagingCredentialInspectorFactory } from "./domain/repositories/messaging-credential-validation";
import {ReadMessagingConfigurationUseCase} from "./application/use-cases/read-messaging-configuration-use-case";
import {ReadMessagingResourcesUseCase} from "./application/use-cases/read-messaging-resources-use-case";
import {ConfigureMessagingConnectionUseCase} from "./application/use-cases/configure-messaging-connection-use-case";
import {PostgresMessagingConnectionConfiguration} from "./infrastructure/repositories/postgres-messaging-connection-configuration";
import type {MessagingConfigurationInspectorFactory} from "./domain/repositories/messaging-connection-configuration";
import type {MessagingResourceInspectorFactory} from "./domain/repositories/messaging-resource-inspection";
import {PostgresMessagingConfigurationReader} from "./infrastructure/repositories/postgres-messaging-configuration-reader";
import type {MessagingSecurityFacts} from "./domain/repositories/messaging-repositories";
import { ReadMessagingUsageOperationUseCase } from "./application/use-cases/read-messaging-usage-operation-use-case";
import { GetMessagingUsagePageUseCase } from "./application/use-cases/get-messaging-usage-page-use-case";
import type { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import type { MessagingUsageCountryChoice } from "./application/commands/messaging-usage-draft";
import { PostgresMessagingUsageOperationReader } from "./infrastructure/repositories/postgres-messaging-usage-operation-reader";
import { VerifyConnectionDiagnosticUseCase } from "./application/use-cases/connection-diagnostic-use-cases";
import {IssueConnectionDiagnosticUseCase} from "./application/use-cases/issue-connection-diagnostic-use-case";
import {PostgresConnectionDiagnosticIssuance} from "./infrastructure/repositories/postgres-connection-diagnostic-issuance";
import type {ConnectionDiagnosticDispatcher} from "./domain/repositories/connection-diagnostic-issuance";
import {ReadMessageDeliveryUseCase} from "./application/use-cases/read-message-delivery-use-case";
import {PostgresMessageDeliveryReader} from "./infrastructure/repositories/postgres-message-delivery-reader";
import { ReadNotificationDeliveryCatalogUseCase } from "./application/use-cases/read-notification-delivery-catalog-use-case";
import { PostgresNotificationDeliveryCatalogReader } from "./infrastructure/repositories/postgres-notification-delivery-catalog-reader";
import {ActivateMessagingConnectionUseCase} from "./application/use-cases/activate-messaging-connection-use-case";
import {PostgresMessagingConnectionActivation} from "./infrastructure/repositories/postgres-messaging-connection-activation";
import type {MessagingSelectionDependencies} from "./domain/repositories/messaging-connection-activation";
import type {AuthorizedMessagingContext} from "./domain/repositories/messaging-repositories";
import { ReserveMessagingUsageUseCase } from "./application/use-cases/reserve-messaging-usage-use-case";
import { ObserveMessageDispatchRunUseCase } from "./application/use-cases/observe-message-dispatch-run-use-case";
import { PostgresMessageDispatchRunRecorder } from "./infrastructure/repositories/postgres-message-dispatch-run-recorder";
import { PostgresMessagingAuthorizationReader } from "./infrastructure/repositories/postgres-messaging-authorization-reader";
import { PostgresMessagingUsageOperations } from "./infrastructure/repositories/postgres-messaging-usage-operations";
import { PostgresConnectionDiagnosticOperations } from "./infrastructure/repositories/postgres-connection-diagnostic-operations";
import { PostgresCredentialValidationBudget } from "./infrastructure/repositories/postgres-credential-validation-budget";
import { PostgresEncryptedSecretStore } from "./infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresMessagingResourceExposureRecorder } from "./infrastructure/repositories/postgres-messaging-authorized-exposure";
import { PostgresMessageDeliveryRepository } from "./infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresVerificationDeliveryPreparation } from "./infrastructure/repositories/postgres-verification-delivery-preparation";
import { PostgresVerificationMaterialMaintenance } from "./infrastructure/repositories/postgres-verification-material-maintenance";
import { PostgresSecretMaterialMaintenance } from "./infrastructure/repositories/postgres-secret-material-maintenance";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_CONNECTION_SLOT, MESSAGING_RESOURCE_SELECTION } from "./constants/messaging-connection";
import { MESSAGING_ERROR_CODE } from "./constants/messaging-errors";
import { MessagingSecretAccessError } from "./domain/errors/messaging-secret-access-error";
import { messagingFailure } from "./application/results/messaging-errors";
import { createMessagingDispatchConfig } from "./infrastructure/config/messaging-dispatch-config";
import type { MessageDeliverySender, MessagingDispatchRuntime, MessagingDispatchSettings } from "./domain/repositories/message-delivery-sender";
import type { MessagingConnectionLifecycleDependencies } from "./domain/repositories/messaging-connection-lifecycle";
import { PostgresMessagingConnectionSuspension } from "./infrastructure/repositories/postgres-messaging-connection-suspension";
import { PostgresMessagingConnectionDisconnection } from "./infrastructure/repositories/postgres-messaging-connection-disconnection";
import { ManageMessagingConnectionLifecycleUseCases } from "./application/use-cases/messaging-connection-lifecycle-use-cases";
import { ResolveMessagingTribeManagementUseCase } from "./application/use-cases/resolve-messaging-tribe-management-use-case";
import type { VerificationDeliveryPreparation } from "./infrastructure/verification-delivery-preparation";
import type { MessagingProviderCatalogReader } from "./application/ports/messaging-provider-catalog-reader";
import type {DiagnosticDeliveryDispatchScope,FocalDeliveryDispatchScope} from "./domain/repositories/message-delivery-repository";
import { RecoverNotificationDeliveryUseCase } from "./application/use-cases/recover-notification-delivery-use-case";
import { ReconcileMessageDeliveryUseCase } from "./application/use-cases/reconcile-message-delivery-use-case";
import { PostgresNotificationDeliveryRecoveryRepository } from "./infrastructure/repositories/postgres-notification-delivery-recovery-repository";
import { PostgresMessageReconciliationRepository } from "./infrastructure/repositories/postgres-message-reconciliation-repository";
import { PostgresMessageStatusPreparation } from "./infrastructure/repositories/postgres-message-status-preparation";
import { ZavuMessageStatusLookup } from "./infrastructure/zavu/zavu-message-status-lookup";
import type { OriginalMessageContextQuery } from "./domain/repositories/message-status-lookup";
import { ReadNotificationRecoveryOperationUseCase } from "./application/use-cases/read-notification-recovery-operation-use-case";
import { PostgresNotificationRecoveryOperationReader } from "./infrastructure/repositories/postgres-notification-recovery-operation-reader";
import { createAdmissionNotificationResourceAuthority } from "@/src/modules/notifications/infrastructure/messaging/admission-notification-resource-authority";

/** The request owner selects a fixed slot and explicit live security source before exposing sensitive capabilities. */
type MessagingRequestComposition = { selection: "selected" | "candidate" | "management"; readSecurityConfig: () => Promise<MessagingSecurityConfig> };
/** Backend jobs have their own guarded principal, live authorization and explicit prepared sender/runtime. */
export type MessagingWorkDependencies = {
  execute: <Result>(actorUserId: string | null, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
  authorize: () => Promise<boolean>; readSecurityConfig: () => Promise<MessagingSecurityConfig>;
  createSender: (preparation: VerificationDeliveryPreparation) => MessageDeliverySender; runtime: MessagingDispatchRuntime; settings?: Partial<MessagingDispatchSettings>;
  diagnosticScope?:Readonly<DiagnosticDeliveryDispatchScope>;
  focalScope?:Readonly<FocalDeliveryDispatchScope>;
};

/**
 * Registers only current implemented request capabilities; a keyring/client/sender is never defaulted.
 * @param dependencies - Native current account, protected transaction executor and current time for this request.
 * @returns Explicit security-bound factories; entrypoints consume the resulting application use cases.
 */
export function buildMessagingModule(dependencies: AuthenticatedFeatureDependencies) {
  /** Current tribe management is shared by early usage and creation, before any connection secret is read. */
  const createManagement = () => {
    const executeActor = async <Result>(context: { actorUserId: string; sessionId?: string; accountId?: string; subject?: string }, run: (database: RequestDatabase) => Promise<Result>) => {
      const account = await dependencies.accounts.getAuthenticatedAccount();
      if (!account || account.userId !== context.actorUserId || context.sessionId !== undefined && account.session.id !== context.sessionId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
      if (context.accountId !== undefined && (account.googleAccount?.id !== context.accountId || account.googleAccount.subject !== context.subject)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
      return dependencies.execute(account, run);
    };
    const leadership = {
      /** @param tribeId - Canonical tenant. @param userId - Current account. @returns Current leadership without reading a connection. */
      async getCurrentLeadership(tribeId: string, userId: string) {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== userId) return null;
        return dependencies.execute(account, (database) => new PostgresMessagingAuthorizationReader(database, account.session.id, MESSAGING_CONNECTION_SLOT.selected).getCurrentLeadership(tribeId, userId));
      },
    };
    return { executeActor, leadership };
  };
  /** The early usage owner does not depend on a connection slot, SecretStore or provider state. */
  const createUsage = (readSecurityConfig: () => Promise<MessagingSecurityConfig>) => {
    const { executeActor, leadership } = createManagement();
    const usage = new ManageMessagingUsageUseCases(dependencies.accounts, leadership, new PostgresMessagingUsageOperations(executeActor, readSecurityConfig), dependencies.clock);
    return { useCases: usage,
      operation: new ReadMessagingUsageOperationUseCase(dependencies.accounts, leadership, new PostgresMessagingUsageOperationReader(executeActor), dependencies.clock),
      /** @param resolveTribe - Canonical application routing. @param countryChoices - Standard localized options from native composition. @returns One current authorized early usage snapshot. */
      createPage(resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">, countryChoices: readonly MessagingUsageCountryChoice[]) { return new GetMessagingUsagePageUseCase(dependencies.accounts, { usage, resolveTribe }, dependencies.clock, countryChoices); } };
  };
  /** @param options - Fixed native slot and current external security. @returns Rechecked sensitive authority without provider or secret access. */
  const createSensitiveContext = (options: MessagingRequestComposition) => {
    return {
        /** @param command - Own validated resource and fixed sensitive operation. @returns Current private authority or a closed denial. */
        async execute(command: Parameters<ResolveMessagingContextUseCase["execute"]>[0]) {
          const account = await dependencies.accounts.getAuthenticatedAccount();
          if (!account) return { allowed: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.authenticationRequired) };
          return dependencies.execute(account, (database) => new ResolveMessagingContextUseCase(createTransactionAccountProvider(database, account), new PostgresMessagingAuthorizationReader(database, account.session.id, options.selection), { getCurrentSecurityFacts: async () => {
            const current = await options.readSecurityConfig();
            return { environment: current.environment, securityEpoch: current.securityEpoch, recoveryLocked: current.recoveryLocked };
          } }, dependencies.clock).execute(command));
        },
      };
  };
  return {
    /** @param options - Local operation MAC keys and explicit dependency owners, without SDK/SecretStore. @returns Exact local suspension/disconnection use cases and authority. */
    createConnectionLifecycleModule(options:{readSecurityConfig:()=>Promise<MessagingSecurityConfig>;composeDependencies:(database:RequestDatabase)=>MessagingConnectionLifecycleDependencies}){
      const{executeActor,leadership}=createManagement(),management=new ResolveMessagingTribeManagementUseCase(dependencies.accounts,leadership,dependencies.clock),suspension=new PostgresMessagingConnectionSuspension(executeActor,options.readSecurityConfig,options.composeDependencies),disconnection=new PostgresMessagingConnectionDisconnection(executeActor,options.readSecurityConfig,options.composeDependencies);
      return{useCases:new ManageMessagingConnectionLifecycleUseCases(management,{suspend:(context,input)=>suspension.suspend(context,input),disconnect:(context,input)=>disconnection.disconnect(context,input)})};
    },
    /** @param options - Ledger security only; reading does not load it. @returns Independent current country/quota management without connection or admission policy. */
    createUsageModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) { return createUsage(options.readSecurityConfig); },
    /** @returns Original connection recovery with current native session/leadership, independently of keyrings, current slot or mutation recency. */
    createConnectionOperationReadModule(){const{executeActor,leadership}=createManagement();return{useCases:new ReadMessagingConnectionOperationUseCase(dependencies.accounts,leadership,new PostgresMessagingConnectionOperationReader(executeActor),dependencies.clock)};},
    /** @param options - Non-secret live recovery state, without keyrings/provider access. @returns Read-only current leader/guardian metadata and the single usage projection. */
    createConfigurationModule(options:{readSecurityFacts:()=>Promise<MessagingSecurityFacts>}){
      const{executeActor,leadership}=createManagement();
      const configuration=new ReadMessagingConfigurationUseCase(dependencies.accounts,leadership,new PostgresMessagingConfigurationReader(executeActor,options.readSecurityFacts),dependencies.clock);
      const catalog=new ReadNotificationDeliveryCatalogUseCase(new ResolveMessagingTribeManagementUseCase(dependencies.accounts,leadership,dependencies.clock),new PostgresNotificationDeliveryCatalogReader(executeActor));
      return{useCases:configuration,
        /** @param resolveTribe - Canonical native routing. @param providers - Actual deployed registry metadata without SQL, keys or provider RPC. @returns One current server entrypoint for the wizard. */
        createPage(resolveTribe:Pick<ResolveAdmissionTribeUseCase,"execute">,providers:MessagingProviderCatalogReader){return new GetMessagingConnectionsPageUseCase(dependencies.accounts,{configuration,resolveTribe,catalog,providers},dependencies.clock);},
      };
    },
    /** @returns Minimal leader/challenge-owner transport reads without keyrings, recency, provider calls or mutation. */
    createDeliveryReadModule(){const{executeActor}=createManagement();return{useCases:new ReadMessageDeliveryUseCase(dependencies.accounts,new PostgresMessageDeliveryReader(executeActor),dependencies.clock)};},
    /** @param options - Current native security/keyrings for the original ledger and explicit child only. @returns Exact original-delivery recovery with no provider call or automatic dispatch. */
    createNotificationRecoveryModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const { executeActor, leadership } = createManagement();
      const management = new ResolveMessagingTribeManagementUseCase(dependencies.accounts, leadership, dependencies.clock);
      return { useCases: new RecoverNotificationDeliveryUseCase(management, new PostgresNotificationDeliveryRecoveryRepository(executeActor, options.readSecurityConfig)) };
    },
    /** @returns Bounded own notification metadata under current leadership, without keyrings, claims or provider queries. */
    createNotificationDeliveryCatalogModule() {
      const { executeActor, leadership } = createManagement();
      const management = new ResolveMessagingTribeManagementUseCase(dependencies.accounts, leadership, dependencies.clock);
      return { useCases: new ReadNotificationDeliveryCatalogUseCase(management, new PostgresNotificationDeliveryCatalogReader(executeActor)) };
    },
    /** @returns Original actor-owned recovery metadata without fresh recency, keyrings, provider calls or mutation capability. */
    createNotificationRecoveryOperationReadModule() {
      const { executeActor, leadership } = createManagement();
      const management = new ResolveMessagingTribeManagementUseCase(dependencies.accounts, leadership, dependencies.clock);
      return { useCases: new ReadNotificationRecoveryOperationUseCase(management, new PostgresNotificationRecoveryOperationReader(executeActor)) };
    },
    /** @param options - Current original-resource security and explicit hosting transport. @returns Original-only provider GET and monotonic persistence, without list/send or replacement credentials. */
    createDeliveryReconciliationModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig>; fetch: typeof globalThis.fetch }) {
      const { executeActor } = createManagement();
      const resolveContext = {
        /** @param query - Exact immutable identity obtained from protected message storage. @returns Current authority only for that same still-selected or candidate version. */
        async execute(query: OriginalMessageContextQuery) {
          const account = await dependencies.accounts.getAuthenticatedAccount();
          if (!account) return { allowed: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.authenticationRequired) };
          return dependencies.execute(account, (database) => new ResolveMessagingContextUseCase(createTransactionAccountProvider(database, account), new PostgresMessagingAuthorizationReader(database, account.session.id, MESSAGING_RESOURCE_SELECTION.management, query.connectionVersion), { getCurrentSecurityFacts: async () => {
            const current = await options.readSecurityConfig();
            return { environment: current.environment, securityEpoch: current.securityEpoch, recoveryLocked: current.recoveryLocked };
          } }, dependencies.clock).execute(query));
        },
      };
      const execute = <Result>(actorUserId: string, run: (database: RequestDatabase) => Promise<Result>) => executeActor({ actorUserId }, run);
      const secrets = new PostgresEncryptedSecretStore(execute, dependencies.accounts, options.readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader);
      const preparation = new PostgresMessageStatusPreparation(resolveContext, execute, secrets, options.readSecurityConfig, dependencies.clock);
      const lookup = new ZavuMessageStatusLookup(preparation, options.fetch);
      return { useCases: new ReconcileMessageDeliveryUseCase(dependencies.accounts, resolveContext, new PostgresMessageReconciliationRepository(execute, options.readSecurityConfig), lookup, dependencies.clock) };
    },
    /** @param options - Explicit current security/keyrings, never a global provider key. @returns Protected creation with no Inspector/Sender or implied activation. */
    createConnectionManagementModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const { executeActor, leadership } = createManagement();
      return { useCases: new ManageMessagingConnectionsUseCases(dependencies.accounts, leadership, new PostgresMessagingConnectionRepository(executeActor, options.readSecurityConfig), dependencies.clock) };
    },
    /**
     * Separates selected/candidate resolution and binds actor-aware writes to the actual current account.
     * @param options - Fixed server selection and live platform security source.
     * @returns Only implemented context, usage, diagnostic, credential-budget and private-secret use cases.
     */
    createRequestModule(options: MessagingRequestComposition) {
      const resolveContext = createSensitiveContext(options);
      const executeActor = async <Result>(context: { actorUserId: string; sessionId?: string; accountId?: string; subject?: string }, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.actorUserId || context.sessionId !== undefined && account.session.id !== context.sessionId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
        if (context.accountId !== undefined && (account.googleAccount?.id !== context.accountId || account.googleAccount.subject !== context.subject)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
        return dependencies.execute(account, run);
      };
      const secrets = new PostgresEncryptedSecretStore((actorUserId, run) => executeActor({ actorUserId: actorUserId ?? "" }, run), dependencies.accounts, options.readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader);
      return {
        /** @param inspectors - Explicit approved infrastructure factory; no mutable client/default key. @returns Staged credential validation with current authority, accounting and private material. */
        createCredentialValidation(inspectors:MessagingCredentialInspectorFactory){return new ValidateMessagingConnectionUseCase(resolveContext,new PostgresMessagingCredentialValidation(executeActor,options.readSecurityConfig),new ReserveMessagingUsageUseCase(new PostgresCredentialValidationBudget(executeActor,options.readSecurityConfig),dependencies.clock),secrets,inspectors,dependencies.clock);},
        /** @param inspectors - Explicit scoped SDK readers. @returns Current recency/resource-gated enumeration without mutation or dispatch. */
        createResourceListing(inspectors:MessagingResourceInspectorFactory){return new ReadMessagingResourcesUseCase(resolveContext,secrets,inspectors,new PostgresMessagingResourceExposureRecorder(executeActor,async()=>{const current=await options.readSecurityConfig();return{environment:current.environment,securityEpoch:current.securityEpoch,recoveryLocked:current.recoveryLocked};}));},
        /** @param inspectors - Explicit detail-only SDK factory. @returns Original/CAS configuration staging with private immutable envelopes, without a dispatcher. */
        createConnectionConfiguration(inspectors:MessagingConfigurationInspectorFactory){return new ConfigureMessagingConnectionUseCase(resolveContext,new PostgresMessagingConnectionConfiguration(executeActor,options.readSecurityConfig),secrets,inspectors);},
        /** @param dispatcher - Explicit backend focal launch for the committed result. @returns Actual current-account diagnostic issuance with shared budgets/outbox, followed by bounded dispatch. */
        createDiagnosticIssuance(dispatcher:ConnectionDiagnosticDispatcher){return new IssueConnectionDiagnosticUseCase(resolveContext,new PostgresConnectionDiagnosticIssuance(executeActor,options.readSecurityConfig),dispatcher);},
        /** @param composeDependencies - Feature-owned reference/evidence owner bound to the existing activation transaction. @returns Sensitive atomic selection based on current local production evidence, with no SDK/SecretStore load. */
        createConnectionActivation(composeDependencies:(database:RequestDatabase,context:AuthorizedMessagingContext)=>MessagingSelectionDependencies){return new ActivateMessagingConnectionUseCase(resolveContext,new PostgresMessagingConnectionActivation(executeActor,options.readSecurityConfig,composeDependencies));},
        useCases: {
          resolveContext,
          manageUsage: createUsage(options.readSecurityConfig).useCases,
          verifyDiagnostic: new VerifyConnectionDiagnosticUseCase(resolveContext, new PostgresConnectionDiagnosticOperations(executeActor, options.readSecurityConfig)),
          reserveCredentialValidation: new ReserveMessagingUsageUseCase(new PostgresCredentialValidationBudget(executeActor, options.readSecurityConfig), dependencies.clock),
          loadAuthorizedSecret: new LoadAuthorizedMessagingSecretUseCase(resolveContext, secrets),
        },
      };
    },
  };
}

/**
 * Builds a private portable worker only from explicit backend authority and a prepared sender.
 * @param dependencies - Current job executor/authority/security, sender and host late-work lifecycle.
 * @returns Dispatcher and domain maintenance ports; no HTTP endpoint, scheduler or provider connection is activated.
 */
export function buildMessagingWorkModule(dependencies: MessagingWorkDependencies) {
  if(dependencies.diagnosticScope&&dependencies.focalScope)throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
  const authorize = async () => dependencies.authorize();
  const resourceAuthority = createAdmissionNotificationResourceAuthority(dependencies.readSecurityConfig);
  const deliveries = new PostgresMessageDeliveryRepository(dependencies.execute, authorize, dependencies.readSecurityConfig,dependencies.focalScope??dependencies.diagnosticScope,resourceAuthority.queued);
  const secrets = new PostgresEncryptedSecretStore(dependencies.execute, { getAuthenticatedAccount: async () => null }, dependencies.readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery,resourceAuthority.marked);
  const privatePreparation = new PostgresVerificationDeliveryPreparation(dependencies.execute, secrets, dependencies.readSecurityConfig);
  const preparation: VerificationDeliveryPreparation = {
    /** @param context - Original backend worker scope. @param signal - Original deadline. @returns Material only while live backend authority remains current. */
    async prepare(context, signal) {
      if (!await authorize()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      const prepared = await privatePreparation.prepare(context, signal);
      if (!await authorize()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      return prepared;
    },
  };
  const preparedSender = dependencies.createSender(preparation);
  const sender: MessageDeliverySender = {
    /** @param context - Original committed marker. @param signal - Remaining run deadline. @returns Original prepared operation after current backend authorization, without RPC. */
    async prepare(context, signal) {
      if (!await authorize()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      return preparedSender.prepare(context, signal);
    },
  };
  return {
    useCases: { dispatch: new ObserveMessageDispatchRunUseCase(deliveries, sender, createMessagingDispatchConfig(dependencies.settings), dependencies.runtime, new PostgresMessageDispatchRunRecorder(dependencies.execute, authorize, async () => { const config = await dependencies.readSecurityConfig(); return { environment: config.environment, securityEpoch: config.securityEpoch, recoveryLocked: config.recoveryLocked }; }, (dependencies.focalScope ?? dependencies.diagnosticScope)?.tribeId, () => dependencies.runtime.now()), (dependencies.focalScope ?? dependencies.diagnosticScope)?.tribeId) },
    ports: {
      deliveries,
      verificationMaterial: new PostgresVerificationMaterialMaintenance((run) => dependencies.execute(null, run), authorize),
      secretMaterial: new PostgresSecretMaterialMaintenance((run) => dependencies.execute(null, run), authorize),
      preparation,
    },
  };
}

/**
 * Composes private abandoned-candidate maintenance without a provider, keyring or public route.
 * @param dependencies - Current guarded executor, backend authority and recovery gate.
 * @returns One bounded application entrypoint with commit-confirmed counts.
 */
export function buildMessagingCandidateMaintenanceModule(dependencies: { execute: CandidateExpirationDatabaseExecutor; authorize: CandidateExpirationGate; readRecoveryLock: CandidateExpirationGate }) {
  return { useCases: { expireCandidates: new ExpireMessagingCandidatesUseCase(new PostgresMessagingCandidateExpiration(dependencies.execute, dependencies.authorize, dependencies.readRecoveryLock)) } };
}

/** @param dependencies - Private executor and current key-independent authority/recovery. @returns One atomic secret-retention entrypoint without constructing a sender or loading keys. */
export function buildMessagingSecretRetentionModule(dependencies: { execute: CandidateExpirationDatabaseExecutor; authorize: CandidateExpirationGate; readRecoveryLock: CandidateExpirationGate }) {
  return { useCases: { purgeSecrets: new PurgeMessagingSecretsUseCase(new PostgresMessagingRetentionRepository(dependencies.execute, dependencies.authorize, dependencies.readRecoveryLock)) } };
}

/** @param dependencies - Fixed private backend authority, routing-only state and separately authorized key importer. @returns One bounded cipher-rotation entrypoint without BYOK replacement, provider calls or scheduling. */
export function buildMessagingProtectionKeyRotationModule(dependencies: MessagingProtectionKeyRotationDependencies) {
  return { useCases: { rotateProtectionKeys: new RotateMessagingProtectionKeysUseCase(new PostgresMessagingProtectionKeyRotation(dependencies)) } };
}
