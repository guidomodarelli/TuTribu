/** Projects public setup and current own state on one protected read transaction. @module postgres-admission-overview-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionOverviewReader, AdmissionOverviewFacts, AdmissionTribeIdentityReader } from "@/src/modules/academy-admissions/domain/repositories/admission-query-reader";
import type { AdmissionCommandScope } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { PostgresOwnAdmissionRequestReader } from "./postgres-own-admission-request-reader";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { AdmissionMessagingCountryChoicesReader } from "../verification/messaging-country-choices-reader";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS  } from "../../constants/admission-contact";
import { ADMISSION_PHONE_CHANNEL, ADMISSION_POLICY_MODE  } from "../../constants/admission-policy";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { ADMISSION_SOURCE_KIND } from "../../constants/admission-eligibility";
import { normalizeAdmissionContact } from "../../domain/value-objects/admission-contact";
import type { AdmissionSubmissionFacts, AdmissionMembershipFacts } from "../../domain/policies/admission-eligibility";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { createDefaultAdmissionPolicy, type AdmissionPolicy } from "../../domain/entities/admission-policy";

/** Explicit account state is never fabricated for an anonymous public projection. */
type OverviewAccountScope = Pick<AdmissionCommandScope, "userId" | "sessionId">;
type PublicOverviewRow = { tribe_id: string; slug: string; name: string; control_activated: boolean; evaluator_enabled: boolean; mode: "manual_review" | "allowlist" | null; contact_type: "email" | "phone" | null; requires_additional_verification: boolean | null; requires_whatsapp_number: boolean | null; is_open: boolean | null; policy_version: number | null };
/** Own list facts from the restricted helper: booleans about the own email, never another account's id or an entry id. */
type OwnAllowlistFactsRow = { tribe_id: string; policy_version: number; mode: "manual_review" | "allowlist"; contact_type: "email" | "phone"; is_open: boolean; allow_common_exceptions: boolean; requires_additional_verification: boolean; requires_whatsapp_number: boolean; activated_at: Date | string | null; normalized_email: string; entry_exists: boolean; entry_enabled: boolean; entry_bound_to_other: boolean; binding_exists: boolean; binding_owned_by_actor: boolean };
/** Stands for another account that holds the own email's binding; it never equals a real user id, so the evaluator treats it as foreign. */
const FOREIGN_CONTACT_OWNER = "foreign-contact-owner";
/** Restricted display metadata keeps ordinary request roles off the full private policy and usage tables. */
type ContactChoicePolicyRow = { version: number; contactType: "email" | "phone"; requiresAdditionalVerification: boolean; phoneChannel: "sms" | "whatsapp" | null; allowSmsAlternative: boolean };

/** No method initializes policy, creates a request, canje, operation or message. */
export class PostgresAdmissionOverviewReader implements AdmissionOverviewReader<AdmissionRequestDto>, AdmissionTribeIdentityReader {
  /** @param executePublic - Protected null-actor executor selected by the root. @param executeAccount - Actual current account executor. @param readRecoveryLock - Live platform closure fact, without importing keyrings for a read. */
  constructor(
    private readonly executePublic: <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>,
    private readonly executeAccount: <Result>(scope: OverviewAccountScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>,
    private readonly readRecoveryLock: () => Promise<boolean>,
  ) {}
  /** @param query - Validated public slug. @returns Only internal identity; no request, token or permission fact. */
  async readIdentity(query: { slug: string; requestId: string }): Promise<{ id: string; slug: string } | null> {
    return this.executePublic(async (database) => {
      const row = (await database.execute<{ tribe_id: string; slug: string }>(sql`select tribe_id,slug from public.read_public_admission_overview(${query.slug})`)).rows[0];
      return row ? { id: row.tribe_id, slug: row.slug } : null;
    });
  }

  /** Rechecks actual actor/session after the awaited read without requiring a membership. */
  private async authorize(database: RequestDatabase, scope: OverviewAccountScope): Promise<void> {
    if (!(await database.execute(sql`select id from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp()`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  }

  /** @param database - Existing authenticated read transaction. @param scope - Native account/session. @param row - Public policy snapshot for the requested tribe. @returns Only current configured channel/countries or absence; issuance still owns actual readiness and quotas. */
  private async readVerificationChoices(database: RequestDatabase, scope: OverviewAccountScope, row: PublicOverviewRow): Promise<AdmissionOverviewFacts["verification"]> {
    if (!row.requires_additional_verification) return undefined;
    const policy = (await database.execute<ContactChoicePolicyRow>(sql`select policy_version as version,contact_type as "contactType",requires_additional_verification as "requiresAdditionalVerification",phone_channel as "phoneChannel",allow_sms_alternative as "allowSmsAlternative" from public.read_admission_contact_choices(${row.tribe_id},${scope.sessionId})`)).rows[0];
    if (!policy || policy.version !== row.policy_version || policy.contactType !== row.contact_type || !policy.requiresAdditionalVerification) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    if (policy.contactType === ADMISSION_CONTACT_TYPE.email) return { channel: MESSAGING_PUBLIC_CHANNEL.email, allowedCountries: [] };
    if (!policy.phoneChannel) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    const countries = await new AdmissionMessagingCountryChoicesReader(new PostgresMessagingUsageRepository(database, async (current, tribeId) => { if (current !== database || tribeId !== row.tribe_id) return false; await this.authorize(current, scope); return true; })).readForApplicant(row.tribe_id, scope.sessionId);
    return { channel: policy.phoneChannel, allowedCountries: countries?.allowedCountries ?? [], ...(policy.phoneChannel === ADMISSION_PHONE_CHANNEL.whatsapp && policy.allowSmsAlternative ? { allowedAlternative: MESSAGING_PUBLIC_CHANNEL.sms } : {}) };
  }

  /**
   * Reads the own trusted email facts only where a common presentation can be refused outright: an email list without
   * additional code or common exceptions. The restricted helper reads the list for the account's own email, never an input,
   * and reports another account's binding without its id, so the request role needs no private-table access.
   * @param database - Existing authenticated read transaction. @param scope - Native account/session. @param row - Public policy snapshot.
   * @param recoveryLocked - Live platform closure fact.
   * @returns Current submission facts for a read-only preview, or nothing when the policy always lets the form be presented.
   */
  private async readAllowlistEligibility(database: RequestDatabase, scope: OverviewAccountScope, row: PublicOverviewRow, recoveryLocked: boolean): Promise<AdmissionSubmissionFacts | undefined> {
    if (row.mode !== ADMISSION_POLICY_MODE.allowlist || row.contact_type !== ADMISSION_CONTACT_TYPE.email || row.requires_additional_verification !== false || !row.is_open) return undefined;
    const own = (await database.execute<OwnAllowlistFactsRow>(sql`select * from public.read_own_admission_allowlist_facts(${row.tribe_id},${scope.sessionId})`)).rows[0];
    if (!own || own.policy_version !== row.policy_version || own.mode !== row.mode || own.contact_type !== row.contact_type || own.requires_additional_verification || own.allow_common_exceptions) return undefined;
    const account = await new PostgresAuthenticatedAccountProvider(async () => scope, (_identity, run) => run(database)).getAuthenticatedAccount();
    if (!account) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const contact = normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.email, value: account.normalizedEmail });
    if (contact.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid || contact.contact.value !== own.normalized_email) return undefined;
    const ownerUserId = own.binding_owned_by_actor ? account.userId : FOREIGN_CONTACT_OWNER;
    const policy: AdmissionPolicy = { ...createDefaultAdmissionPolicy({ id: row.tribe_id, tribeId: row.tribe_id }), mode: own.mode, contactType: own.contact_type, isOpen: own.is_open, allowCommonExceptions: own.allow_common_exceptions,
      requiresAdditionalVerification: own.requires_additional_verification, requiresWhatsappNumber: own.requires_whatsapp_number, version: own.policy_version, activatedAt: own.activated_at ? new Date(own.activated_at) : null };
    const evidence = account.identityEvidence;
    const membership = (await database.execute<AdmissionMembershipFacts>(sql`select tribe_id as "tribeId",user_id as "userId",role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${row.tribe_id} and user_id=${scope.userId}`)).rows[0] ?? null;
    const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    return { now, tribe: { id: row.tribe_id, isAcademy: true, controlActivated: row.control_activated, evaluatorEnabled: row.evaluator_enabled, recoveryLocked }, policy,
      account: { userId: account.userId, normalizedEmail: account.normalizedEmail, googleAccount: account.googleAccount }, source: { kind: ADMISSION_SOURCE_KIND.common }, contact: contact.contact,
      baseEvidence: evidence ? { userId: evidence.userId, accountId: evidence.accountId, subject: evidence.subject, normalizedEmail: evidence.normalizedEmail, authority: evidence.classification, invalidated: evidence.invalidatedAt !== null } : null,
      allowlistEntry: own.entry_exists ? { tribeId: row.tribe_id, contact: contact.contact, enabled: own.entry_enabled, boundUserId: own.entry_bound_to_other ? FOREIGN_CONTACT_OWNER : own.binding_owned_by_actor ? account.userId : null } : null,
      contactBinding: own.binding_exists ? { ownerUserId, contact: contact.contact } : null, membership, localProof: null, currentConnection: null };
  }

  /** @param query - Boundary-validated public slug/correlation. @param scope - Native current account or explicit public access. @returns Own facts, public-only facts, or genuine absence; no downstream DTO or effect. */
  async readOverview(query: { slug: string; requestId: string }, scope: OverviewAccountScope | null): Promise<AdmissionOverviewFacts<AdmissionRequestDto> | null> {
    const read = async (database: RequestDatabase): Promise<AdmissionOverviewFacts<AdmissionRequestDto> | null> => {
      if (scope) await this.authorize(database, scope);
      const row = (await database.execute<PublicOverviewRow>(sql`select * from public.read_public_admission_overview(${query.slug})`)).rows[0];
      if (!row) { if (scope) await this.authorize(database, scope); return null; }
      const membership = scope ? (await database.execute<NonNullable<AdmissionOverviewFacts["membership"]>>(sql`select role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${row.tribe_id} and user_id=${scope.userId}`)).rows[0] ?? null : null;
      const request = scope ? await new PostgresOwnAdmissionRequestReader((_current, run) => run(database), this.readRecoveryLock).readOwn({ ...scope, tribeId: row.tribe_id, requestId: query.requestId }) : null;
      const verification = scope ? await this.readVerificationChoices(database, scope, row) : undefined;
      const recoveryLocked = await this.readRecoveryLock();
      const allowlistEligibility = scope ? await this.readAllowlistEligibility(database, scope, row, recoveryLocked) : undefined;
      if (scope) await this.authorize(database, scope);
      return {
        tribe: { id: row.tribe_id, slug: row.slug, name: row.name, accessModel: TRIBE_ACCESS_MODEL.academy, controlActivated: row.control_activated, evaluatorEnabled: row.evaluator_enabled },
        policy: row.policy_version !== null && row.mode && row.contact_type ? { mode: row.mode, contactType: row.contact_type, requiresAdditionalVerification: row.requires_additional_verification === true, requiresWhatsappNumber: row.requires_whatsapp_number === true, isOpen: row.is_open === true, version: row.policy_version } : null,
        membership, request, recoveryLocked, ...(verification ? { verification } : {}), ...(allowlistEligibility ? { allowlistEligibility } : {}),
      };
    };
    return scope ? this.executeAccount(scope, read) : this.executePublic(read);
  }
}
