/** Composes implemented admission use cases and protected transaction collaborators. @module academy-admissions-setup */
import "server-only";
import type { z } from "zod";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { GetAdmissionPageUseCase } from "./application/use-cases/get-admission-page-use-case";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import { createTransactionAccountProvider } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import { ResolveAdmissionContextUseCase } from "./application/use-cases/resolve-admission-context-use-case";
import { ResolveAdmissionOperationUseCase } from "./application/use-cases/resolve-admission-operation-use-case";
import { PostgresAdmissionAuthorizationReader } from "./infrastructure/repositories/postgres-admission-authorization-reader";
import { PostgresAdmissionOperationRepository } from "./infrastructure/repositories/postgres-admission-operation-repository";
import { AdmissionOperationError } from "./domain/errors/admission-operation-error";
import { admissionFailure } from "./application/results/admission-errors";
import { ADMISSION_ERROR_CODE } from "./constants/admission-errors";
import type { AdmissionOperationCommand } from "./domain/entities/admission-operation";
import type { VerificationChallengeScope } from "./domain/entities/contact-verification-challenge";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresContactVerificationRepository } from "./infrastructure/repositories/postgres-contact-verification-repository";
import { PostgresContactVerificationIssuer } from "./infrastructure/repositories/postgres-contact-verification-issuer";
import { PostgresAdmissionVerificationProofWriter } from "./infrastructure/repositories/postgres-admission-verification-proof-writer";
import { PostgresVerificationFailureBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-failure-budget";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import { AdmissionMessagingUsagePolicyReader } from "./infrastructure/verification/messaging-usage-policy-reader";
import { SubmitAdmissionUseCase } from "./application/use-cases/submit-admission-use-case";
import { DecideAdmissionRequestUseCase } from "./application/use-cases/decide-admission-request-use-case";
import { CancelAdmissionRequestUseCase } from "./application/use-cases/cancel-admission-request-use-case";
import { PostgresAdmissionRequestRepository } from "./infrastructure/repositories/postgres-admission-request-repository";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { ADMISSION_ACTION } from "./constants/admission-eligibility";
import { GetOwnAdmissionUseCases } from "./application/use-cases/get-own-admission-use-cases";
import { PostgresOwnAdmissionRequestReader } from "./infrastructure/repositories/postgres-own-admission-request-reader";
import type { AdmissionCommandScope } from "./domain/repositories/admission-repositories";
import { GetAdmissionOverviewUseCase } from "./application/use-cases/get-admission-overview-use-case";
import { PostgresAdmissionOverviewReader } from "./infrastructure/repositories/postgres-admission-overview-reader";
import { ResolveAdmissionTribeUseCase } from "./application/use-cases/resolve-admission-tribe-use-case";
import { ReadAdmissionOperationUseCase } from "./application/use-cases/read-admission-operation-use-case";
import { PostgresAdmissionOperationReader } from "./infrastructure/repositories/postgres-admission-operation-reader";
import { ContactVerificationUseCases } from "./application/use-cases/contact-verification-use-cases";
import { ApplyAdmissionProofUseCase } from "./application/use-cases/apply-admission-proof-use-case";
import { PostgresAdmissionContactVerificationOperations, type AdmissionVerificationDatabaseExecutor } from "./infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAdmissionVerificationDispatchContext } from "./infrastructure/verification/postgres-admission-verification-dispatch-context";
import type { AdmissionContactChallengeDispatcher, AdmissionChallengeDispatchIntent } from "./domain/repositories/admission-contact-verification";
import type { ResolvedAdmissionChallengeDispatch } from "./infrastructure/verification/admission-verification-message-sender";
import { AllowAdmissionRetryUseCase } from "./application/use-cases/allow-admission-retry-use-case";
import { GetAdmissionReviewUseCases } from "./application/use-cases/get-admission-review-use-cases";
import { PostgresAdmissionReviewReader } from "./infrastructure/repositories/postgres-admission-review-reader";
import { GetAdmissionReviewPageUseCase } from "./application/use-cases/get-admission-review-page-use-case";
import { SubmitAcademyEntryUseCase } from "./application/use-cases/submit-academy-entry-use-case";
import { PostgresPaidAdmissionResolutionWriter } from "./infrastructure/repositories/postgres-paid-admission-resolution-writer";
import type { AdmissionExternalResolutionWriter } from "./domain/repositories/admission-external-resolution-writer";
import type { AuthorizedAdmissionContext } from "./domain/repositories/admission-authorization-reader";
import type { AdmissionActivationPreflightReader } from "./domain/repositories/admission-activation-preflight-reader";
import { ManageAdmissionPolicyUseCases } from "./application/use-cases/manage-admission-policy-use-cases";
import { PostgresAdmissionPolicyRepository } from "./infrastructure/repositories/postgres-admission-policy-repository";
import { PostgresAdmissionPolicyReader } from "./infrastructure/repositories/postgres-admission-policy-reader";
import { PostgresAdmissionPolicyPreparationReader } from "./infrastructure/repositories/postgres-admission-policy-preparation-reader";
import { authorizeAdmissionPolicy } from "./infrastructure/repositories/postgres-admission-policy-authorizer";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import type { AdmissionPolicyPreparationReader } from "./domain/repositories/admission-policy-management";
import { PostgresAdmissionPolicyViewFactsReader } from "./infrastructure/repositories/postgres-admission-policy-view-facts-reader";
import { GetAdmissionPolicyUseCase } from "./application/use-cases/get-admission-policy-use-case";
import type { AdmissionActivationRuntimeReader } from "./domain/repositories/admission-activation-preflight-reader";
import { PostgresAdmissionActivationRepository } from "./infrastructure/repositories/postgres-admission-activation-repository";
import { PreflightAdmissionActivationUseCase } from "./application/use-cases/preflight-admission-activation-use-case";
import { ReadAdmissionRuntimeUseCase } from "./application/use-cases/read-admission-runtime-use-case";
import { ManagePersonalInvitationsUseCases } from "./application/use-cases/manage-personal-invitations-use-cases";
import { PostgresPersonalInvitationRepository } from "./infrastructure/repositories/postgres-personal-invitation-repository";
import { GetPersonalInvitationOverviewUseCase } from "./application/use-cases/get-personal-invitation-overview-use-case";
import { PostgresPersonalInvitationOverviewReader } from "./infrastructure/repositories/postgres-personal-invitation-overview-reader";
import { GetAdmissionPolicyPageUseCase } from "./application/use-cases/get-admission-policy-page-use-case";
import { ManageAllowlistUseCases } from "./application/use-cases/manage-allowlist-use-cases";
import { PostgresAllowlistReader } from "./infrastructure/repositories/postgres-allowlist-reader";
import { PostgresAllowlistRepository } from "./infrastructure/repositories/postgres-allowlist-repository";
import { GetAllowlistPageUseCase } from "./application/use-cases/get-allowlist-page-use-case";
import { ImportAllowlistUseCases } from "./application/use-cases/import-allowlist-use-cases";
import { PostgresAllowlistImportRepository } from "./infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "./infrastructure/api/allowlist-csv-parser";

/** @param database - Original guarded owner transaction. @returns A protected receipt-scoped resolution port, without another database checkout or provider call. */
export function createPaidAdmissionResolutionWriter(database: RequestDatabase): AdmissionExternalResolutionWriter {
  return new PostgresPaidAdmissionResolutionWriter(database);
}

/** An operation owner supplies its concrete current permission and own committed DTO, never a default grant. */
type AdmissionOperationComposition<Result> = { authorize: (database: RequestDatabase, command: AdmissionOperationCommand) => Promise<boolean>; resultSchema: z.ZodType<Result>; readSecurityConfig: () => Promise<MessagingSecurityConfig> };
/** Own authorization is required for every actual scope consumed by transaction collaborators. */
type AdmissionVerificationComposition = { scope: VerificationChallengeScope; authorize: (database: RequestDatabase, scope: VerificationChallengeScope) => Promise<boolean>; readSecurityConfig: () => Promise<MessagingSecurityConfig> };

/**
 * Builds only implemented request capabilities; no route, sender, keyring or business workflow is fabricated.
 * @param dependencies - Native current-account provider and protected executor owned by this request.
 * @returns Current context resolution, read-only original-operation recovery and explicit private collaborator factories.
 */
export function buildAcademyAdmissionsModule(dependencies: AuthenticatedFeatureDependencies) {
  /** Rechecks native identity on every verification or attachment checkout; no account snapshot is retained. */
  const executeVerification: AdmissionVerificationDatabaseExecutor = async (scope, run) => {
    const account = await dependencies.accounts.getAuthenticatedAccount();
    if (!account || account.userId !== scope.userId || account.session.id !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return dependencies.execute(account, run);
  };
  const resolveContext = {
    /** @param command - Fixed server action and validated resource ids. @returns Current private authority or a safe denial. */
    async execute(command: Parameters<ResolveAdmissionContextUseCase["execute"]>[0]) {
      const account = await dependencies.accounts.getAuthenticatedAccount();
      if (!account) return { allowed: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.authenticationRequired) };
      return dependencies.execute(account, (database) => new ResolveAdmissionContextUseCase(createTransactionAccountProvider(database, account), new PostgresAdmissionAuthorizationReader(database, account.session.id, command.action), dependencies.clock).execute(command));
    },
  };
  return {
    useCases: { resolveContext },
    /** @param options - Current private hosting security for explicit invitation commands. @returns Native leader metadata/commands with atomic related notices and no recovered token on replay. */
    createPersonalInvitationModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const execute = async <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.userId || account.session.id !== context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      const repository = new PostgresPersonalInvitationRepository(execute, options.readSecurityConfig, createPostgresAdmissionNotificationObligationWriter);
      return { useCases: new ManagePersonalInvitationsUseCases(resolveContext, repository, repository) };
    },
    /** @param options - Current private token security, without a provider or mutation port. @returns Native account-bound read-only personal preview. */
    createPersonalInvitationQueryModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const execute = async <Result>(scope: Pick<AdmissionCommandScope, "userId" | "sessionId">, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== scope.userId || account.session.id !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      return { useCases: { overview: new GetPersonalInvitationOverviewUseCase(dependencies.accounts, new PostgresPersonalInvitationOverviewReader(execute, options.readSecurityConfig), dependencies.clock) } };
    },
    /** @param options - Local private security for explicit commands only. @returns Leader-only queries and atomic original list commands, rechecking native identity on every checkout. */
    createAllowlistModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const execute = async <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.userId || account.session.id !== context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      const useCases = new ManageAllowlistUseCases(resolveContext, new PostgresAllowlistReader(execute), new PostgresAllowlistRepository(execute, options.readSecurityConfig));
      const imports = new ImportAllowlistUseCases(resolveContext, new PostgresAllowlistImportRepository(execute, options.readSecurityConfig), { parse: parseAllowlistCsv });
      return { useCases, imports, createPage(resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">, policy: Pick<GetAdmissionPolicyUseCase, "execute">) { return new GetAllowlistPageUseCase(dependencies.accounts, { allowlist: useCases, policy, resolveTribe }, dependencies.clock); } };
    },
    /** @param options - Live private security and an explicit focal launch factory consuming native challenge resolution. @returns Applicant verification with current account checks on every checkout, without caller-selected worker privileges. */
    createContactVerificationModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig>; createDispatcher: (resolve: (intent: AdmissionChallengeDispatchIntent) => Promise<ResolvedAdmissionChallengeDispatch>) => AdmissionContactChallengeDispatcher }) {
      const operations = new PostgresAdmissionContactVerificationOperations(executeVerification, options.readSecurityConfig);
      const context = new PostgresAdmissionVerificationDispatchContext(executeVerification);
      const dispatcher = options.createDispatcher((intent) => context.resolve(intent));
      return { useCases: new ContactVerificationUseCases(dependencies.accounts, operations, dispatcher, dependencies.clock) };
    },
    /** @param options - Live server security for the atomic owner and original ledger. @returns Own pending proof attachment without a sender, dispatcher or provider dependency. */
    createProofApplicationModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const operations = new PostgresAdmissionContactVerificationOperations(executeVerification, options.readSecurityConfig);
      return { useCases: new ApplyAdmissionProofUseCase(dependencies.accounts, operations, dependencies.clock) };
    },
    /** @param options - Mandatory complete runtime owner, without an optimistic default. @returns Informational current inventory; activation still repeats the locked owner in its actual transaction. */
    createPreflightModule(options: { runtime: AdmissionActivationRuntimeReader }) {
      const inventory = { read: async (context: AuthorizedAdmissionContext) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.userId || account.session.id !== context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, (database) => new PostgresAdmissionActivationRepository(database, context, options.runtime).read(context));
      } };
      return { useCases: new PreflightAdmissionActivationUseCase(resolveContext, inventory) };
    },
    /** @param options - Explicit informational preparation evaluator, or null when no evaluation is available. @returns Current leader query without a keyring, command writer or implicit initialization dependency. */
    createPolicyQueryModule(options: { composePreparation: ((database: RequestDatabase, context: AuthorizedAdmissionContext) => AdmissionPolicyPreparationReader) | null }) {
      const executePolicy = async <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.userId || account.session.id !== context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      const usage = (database: RequestDatabase, context: AuthorizedAdmissionContext) => new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(database, async (current, tribeId) => {
        if (tribeId !== context.tribeId) return false;
        await authorizeAdmissionPolicy(current, context);
        return true;
      }));
      const policy = new GetAdmissionPolicyUseCase(resolveContext, new PostgresAdmissionPolicyReader(executePolicy, usage), new PostgresAdmissionPolicyViewFactsReader(executePolicy, options.composePreparation));
      return { useCases: policy, createPage(resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">) { return new GetAdmissionPolicyPageUseCase(dependencies.accounts, { policy, resolveTribe }, dependencies.clock); } };
    },
    /** @param options - Live security and a mandatory current SQL cutover owner; no preparation default exists. @returns Policy management through native authority/ledger/CAS and the sole country owner. */
    createPolicyModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig>; composePreflight: (database: RequestDatabase, context: AuthorizedAdmissionContext) => AdmissionActivationPreflightReader }) {
      const executePolicy = async <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.userId || account.session.id !== context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      const authorize = (context: AuthorizedAdmissionContext) => async (database: RequestDatabase, tribeId: string) => {
        if (tribeId !== context.tribeId) return false;
        await authorizeAdmissionPolicy(database, context, context.sensitiveOperation);
        return true;
      };
      const usage = (database: RequestDatabase, context: AuthorizedAdmissionContext) => new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(database, authorize(context)));
      const writer = new PostgresAdmissionPolicyRepository(executePolicy, options.readSecurityConfig, (database, context) => new PostgresAdmissionPolicyPreparationReader(database, options.composePreflight(database, context), usage(database, context), new PostgresAdmissionVerificationReadinessReader(database, authorize(context), options.readSecurityConfig), options.readSecurityConfig));
      return { useCases: new ManageAdmissionPolicyUseCases(resolveContext, new PostgresAdmissionPolicyReader(executePolicy, usage), writer) };
    },
    /** @param options - Explicit public lookup and live server security; no legacy writer is used for an explicit request. @returns A native admission entry port for the tribe compatibility use case. */
    createAcademyEntryModule(options: { executePublic: <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>; readRecoveryLock: () => Promise<boolean>; readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const queries = this.createQueryModule(options).useCases;
      const manual = this.createManualRequestModule(options).useCases;
      const entry = new SubmitAcademyEntryUseCase(queries.resolveTribe, manual.submit);
      return { submit: (command: Parameters<typeof entry.execute>[0]) => entry.execute(command) };
    },
    /** @param options - Live recovery state without provider/keyring access. @returns Current authorized read-only inbox/detail use cases. */
    createReviewQueryModule(options: { readRecoveryLock: () => Promise<boolean> }) {
      const executeReview = async <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== scope.userId || account.session.id !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      const review = new GetAdmissionReviewUseCases(resolveContext, new PostgresAdmissionReviewReader(executeReview, options.readRecoveryLock));
      return { useCases: { review,
        /** @param resolveTribe - Public slug resolver composed by the request root. @returns The single server page loader over current reviewer reads. */
        createPage(resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">) { return new GetAdmissionReviewPageUseCase(dependencies.accounts, { review, resolveTribe }, dependencies.clock); },
      } };
    },
    /**
     * Composes public/own reads without a credential, keyring, sender or membership prerequisite.
     * @param options - Explicit anonymous executor and current platform recovery closure.
     * @returns Read-only overview and own application use cases, with native identity revalidation.
     */
    createQueryModule(options: { executePublic: <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>; readRecoveryLock: () => Promise<boolean> }) {
      const executeAccount = async <Result>(scope: Pick<AdmissionCommandScope, "userId" | "sessionId">, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== scope.userId || account.session.id !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      const overviewReader = new PostgresAdmissionOverviewReader(options.executePublic, executeAccount, options.readRecoveryLock);
      const overview = new GetAdmissionOverviewUseCase(dependencies.accounts, overviewReader, dependencies.clock);
      const own = new GetOwnAdmissionUseCases(dependencies.accounts, new PostgresOwnAdmissionRequestReader(executeAccount), dependencies.clock);
      const resolveTribe = new ResolveAdmissionTribeUseCase(overviewReader);
      return { useCases: {
        overview, resolveTribe, own,
        page: new GetAdmissionPageUseCase(dependencies.accounts, { overview, resolveTribe, own }, dependencies.clock),
        operation: new ReadAdmissionOperationUseCase(dependencies.accounts, new PostgresAdmissionOperationReader(executeAccount), dependencies.clock),
      } };
    },
    /**
     * Composes common manual/list writes with base OFF or local ON evidence and DB-only access effects.
     * @param options - Explicit live platform security for the original operation ledger.
     * @returns Server-derived submission/reviewer/cancellation use cases with atomic DB-only owners.
     */
    createManualRequestModule(options: { readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
      const executeRequest = async <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => {
        const account = await dependencies.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== scope.userId || account.session.id !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
        return dependencies.execute(account, run);
      };
      const writer = new PostgresAdmissionRequestRepository(executeRequest, options.readSecurityConfig, (database) => ({ memberships: createAcademyApprovedMembershipWriter(database), notifications: createPostgresAdmissionNotificationObligationWriter(database) }));
      return {
        runtime: new ReadAdmissionRuntimeUseCase(writer),
        useCases: {
          submit: new SubmitAdmissionUseCase(dependencies.accounts, writer, dependencies.clock),
          own: new GetOwnAdmissionUseCases(dependencies.accounts, new PostgresOwnAdmissionRequestReader(executeRequest), dependencies.clock),
          decide: new DecideAdmissionRequestUseCase(resolveContext, writer),
          cancelOwn: new CancelAdmissionRequestUseCase(resolveContext, writer, ADMISSION_ACTION.cancelOwnRequest),
          cancelByManagement: new CancelAdmissionRequestUseCase(resolveContext, writer, ADMISSION_ACTION.cancelByManagement),
          allowRetry: new AllowAdmissionRetryUseCase(resolveContext, writer),
        },
      };
    },
    /**
     * Reads an original registered operation only; absence cannot manufacture started work.
     * @param options - Owner-specific authority, result schema and live platform security source.
     * @returns An application resolver with actual current account/session revalidation at every ledger phase.
     */
    createOperationResolver<Result>(options: AdmissionOperationComposition<Result>) {
      return new ResolveAdmissionOperationUseCase(dependencies.accounts, {
        async resolve(command) {
          const account = await dependencies.accounts.getAuthenticatedAccount();
          if (!account || account.userId !== command.actorUserId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
          const ledger = new PostgresAdmissionOperationRepository((run) => dependencies.execute(account, run), async (database, current) => {
            const actual = await createTransactionAccountProvider(database, account).getAuthenticatedAccount();
            return Boolean(actual && actual.userId === current.actorUserId && actual.session.id === account.session.id && await options.authorize(database, current));
          }, options.readSecurityConfig);
          const result = await ledger.read(command, options.resultSchema);
          if (!result) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
          return result;
        },
      }, dependencies.clock);
    },
    /**
     * Keeps issuance/validation/proof/budgets on the caller's same transaction, without SDK or another checkout.
     * @param database - Existing original-operation transaction with the shared lock order held by its owner.
     * @param options - Fixed owner scope and mandatory current authorization/security callbacks.
     * @returns Inward-facing writer/issuer/proof/country ports; entrypoints consume their owning application use cases.
     */
    createVerificationCollaborators(database: RequestDatabase, options: AdmissionVerificationComposition) {
      const contacts = new PostgresMessagingContactBudgetRepository(database, (current) => options.authorize(current, options.scope), options.readSecurityConfig);
      const requests = new PostgresVerificationRequestBudget(database, (current, command) => options.authorize(current, command.scope), contacts);
      const failures = new PostgresVerificationFailureBudget(database);
      return {
        verifier: new PostgresContactVerificationRepository(database, options.authorize, options.readSecurityConfig, failures),
        issuer: new PostgresContactVerificationIssuer(database, options.authorize, options.readSecurityConfig, requests),
        proofs: new PostgresAdmissionVerificationProofWriter(database, options.authorize, options.readSecurityConfig),
        countries: new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(database, (current, tribeId) => tribeId === options.scope.tribeId ? options.authorize(current, options.scope) : Promise.resolve(false))),
      };
    },
  };
}
