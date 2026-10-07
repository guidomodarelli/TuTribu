/** Composes implemented human and worker messaging capabilities without global clients or key defaults. @module messaging-setup */
import "server-only";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import { createTransactionAccountProvider } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "./infrastructure/config/messaging-security-config";
import { ResolveMessagingContextUseCase, LoadAuthorizedMessagingSecretUseCase } from "./application/use-cases/resolve-messaging-context-use-case";
import { ManageMessagingUsageUseCases } from "./application/use-cases/manage-messaging-usage-use-cases";
import { ManageMessagingConnectionsUseCases } from "./application/use-cases/manage-messaging-connections-use-cases";
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
import {ActivateMessagingConnectionUseCase} from "./application/use-cases/activate-messaging-connection-use-case";
import {PostgresMessagingConnectionActivation} from "./infrastructure/repositories/postgres-messaging-connection-activation";
import type {MessagingSelectionDependencies} from "./domain/repositories/messaging-connection-activation";
import type {AuthorizedMessagingContext} from "./domain/repositories/messaging-repositories";
import { ReserveMessagingUsageUseCase } from "./application/use-cases/reserve-messaging-usage-use-case";
import { DispatchMessageDeliveriesUseCase } from "./application/use-cases/dispatch-message-deliveries-use-case";
import { PostgresMessagingAuthorizationReader } from "./infrastructure/repositories/postgres-messaging-authorization-reader";
import { PostgresMessagingUsageOperations } from "./infrastructure/repositories/postgres-messaging-usage-operations";
import { PostgresConnectionDiagnosticOperations } from "./infrastructure/repositories/postgres-connection-diagnostic-operations";
import { PostgresCredentialValidationBudget } from "./infrastructure/repositories/postgres-credential-validation-budget";
import { PostgresEncryptedSecretStore } from "./infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresMessageDeliveryRepository } from "./infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresVerificationDeliveryPreparation } from "./infrastructure/repositories/postgres-verification-delivery-preparation";
import { PostgresVerificationMaterialMaintenance } from "./infrastructure/repositories/postgres-verification-material-maintenance";
import { PostgresSecretMaterialMaintenance } from "./infrastructure/repositories/postgres-secret-material-maintenance";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_CONNECTION_SLOT } from "./constants/messaging-connection";
import { MESSAGING_ERROR_CODE } from "./constants/messaging-errors";
import { MessagingSecretAccessError } from "./domain/errors/messaging-secret-access-error";
import { messagingFailure } from "./application/results/messaging-errors";
import { createMessagingDispatchConfig } from "./infrastructure/config/messaging-dispatch-config";
import type { MessageDeliverySender, MessagingDispatchRuntime, MessagingDispatchSettings } from "./domain/repositories/message-delivery-sender";
import type { VerificationDeliveryPreparation } from "./infrastructure/zavu/verification-delivery-preparation";
import type {DiagnosticDeliveryDispatchScope} from "./domain/repositories/message-delivery-repository";

/** The request owner selects a fixed slot and explicit live security source before exposing sensitive capabilities. */
type MessagingRequestComposition = { selection: "selected" | "candidate" | "management"; readSecurityConfig: () => Promise<MessagingSecurityConfig> };
/** Backend jobs have their own guarded principal, live authorization and explicit prepared sender/runtime. */
export type MessagingWorkDependencies = {
  execute: <Result>(actorUserId: string | null, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
  authorize: () => Promise<boolean>; readSecurityConfig: () => Promise<MessagingSecurityConfig>;
  createSender: (preparation: VerificationDeliveryPreparation) => MessageDeliverySender; runtime: MessagingDispatchRuntime; settings?: Partial<MessagingDispatchSettings>;
  diagnosticScope?:Readonly<DiagnosticDeliveryDispatchScope>;
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
  return {
    /** @param options - Ledger security only; reading does not load it. @returns Independent current country/quota management without connection or admission policy. */
    createUsageModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) { return createUsage(options.readSecurityConfig); },
    /** @param options - Non-secret live recovery state, without keyrings/provider access. @returns Read-only current leader/guardian metadata and the single usage projection. */
    createConfigurationModule(options:{readSecurityFacts:()=>Promise<MessagingSecurityFacts>}){
      const{executeActor,leadership}=createManagement();
      return{useCases:new ReadMessagingConfigurationUseCase(dependencies.accounts,leadership,new PostgresMessagingConfigurationReader(executeActor,options.readSecurityFacts),dependencies.clock)};
    },
    /** @returns Minimal leader/challenge-owner transport reads without keyrings, recency, provider calls or mutation. */
    createDeliveryReadModule(){const{executeActor}=createManagement();return{useCases:new ReadMessageDeliveryUseCase(dependencies.accounts,new PostgresMessageDeliveryReader(executeActor),dependencies.clock)};},
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
      const resolveContext = {
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
      const executeActor = async <Result>(context: { actorUserId: string; sessionId?: string; accountId?: string; subject?: string }, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.actorUserId || context.sessionId !== undefined && account.session.id !== context.sessionId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
        if (context.accountId !== undefined && (account.googleAccount?.id !== context.accountId || account.googleAccount.subject !== context.subject)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
        return dependencies.execute(account, run);
      };
      const secrets = new PostgresEncryptedSecretStore((actorUserId, run) => executeActor({ actorUserId: actorUserId ?? "" }, run), dependencies.accounts, options.readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader);
      return {
        /** @param inspectors - Explicit approved infrastructure factory; no mutable client/default key. @returns Staged credential validation with current authority, accounting and private material. */
        createCredentialValidation(inspectors:MessagingCredentialInspectorFactory){return new ValidateMessagingConnectionUseCase(resolveContext,new PostgresMessagingCredentialValidation(executeActor,options.readSecurityConfig),new ReserveMessagingUsageUseCase(new PostgresCredentialValidationBudget(executeActor,options.readSecurityConfig),dependencies.clock),secrets,inspectors);},
        /** @param inspectors - Explicit scoped SDK readers. @returns Current recency/resource-gated enumeration without mutation or dispatch. */
        createResourceListing(inspectors:MessagingResourceInspectorFactory){return new ReadMessagingResourcesUseCase(resolveContext,secrets,inspectors);},
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
  const authorize = async () => dependencies.authorize();
  const deliveries = new PostgresMessageDeliveryRepository(dependencies.execute, authorize, dependencies.readSecurityConfig,dependencies.diagnosticScope);
  const secrets = new PostgresEncryptedSecretStore(dependencies.execute, { getAuthenticatedAccount: async () => null }, dependencies.readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery);
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
    /** @param context - Original committed marker. @param signal - Exact original deadline. @returns Own sender evidence after current backend authorization. */
    async send(context, signal) {
      if (!await authorize()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      return preparedSender.send(context, signal);
    },
  };
  return {
    useCases: { dispatch: new DispatchMessageDeliveriesUseCase(deliveries, sender, createMessagingDispatchConfig(dependencies.settings), dependencies.runtime) },
    ports: {
      deliveries,
      verificationMaterial: new PostgresVerificationMaterialMaintenance((run) => dependencies.execute(null, run), authorize),
      secretMaterial: new PostgresSecretMaterialMaintenance((run) => dependencies.execute(null, run), authorize),
      preparation,
    },
  };
}
