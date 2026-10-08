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
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_PHONE_CHANNEL } from "../../constants/admission-policy";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";

/** Explicit account state is never fabricated for an anonymous public projection. */
type OverviewAccountScope = Pick<AdmissionCommandScope, "userId" | "sessionId">;
type PublicOverviewRow = { tribe_id: string; slug: string; name: string; control_activated: boolean; evaluator_enabled: boolean; mode: "manual_review" | "allowlist" | null; contact_type: "email" | "phone" | null; requires_additional_verification: boolean | null; is_open: boolean | null; policy_version: number | null };
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

  /** @param query - Boundary-validated public slug/correlation. @param scope - Native current account or explicit public access. @returns Own facts, public-only facts, or genuine absence; no downstream DTO or effect. */
  async readOverview(query: { slug: string; requestId: string }, scope: OverviewAccountScope | null): Promise<AdmissionOverviewFacts<AdmissionRequestDto> | null> {
    const read = async (database: RequestDatabase): Promise<AdmissionOverviewFacts<AdmissionRequestDto> | null> => {
      if (scope) await this.authorize(database, scope);
      const row = (await database.execute<PublicOverviewRow>(sql`select * from public.read_public_admission_overview(${query.slug})`)).rows[0];
      if (!row) { if (scope) await this.authorize(database, scope); return null; }
      const membership = scope ? (await database.execute<NonNullable<AdmissionOverviewFacts["membership"]>>(sql`select role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${row.tribe_id} and user_id=${scope.userId}`)).rows[0] ?? null : null;
      const request = scope ? await new PostgresOwnAdmissionRequestReader((_current, run) => run(database)).readOwn({ ...scope, tribeId: row.tribe_id, requestId: query.requestId }) : null;
      const verification = scope ? await this.readVerificationChoices(database, scope, row) : undefined;
      const recoveryLocked = await this.readRecoveryLock();
      if (scope) await this.authorize(database, scope);
      return {
        tribe: { id: row.tribe_id, slug: row.slug, name: row.name, accessModel: TRIBE_ACCESS_MODEL.academy, controlActivated: row.control_activated, evaluatorEnabled: row.evaluator_enabled },
        policy: row.policy_version !== null && row.mode && row.contact_type ? { mode: row.mode, contactType: row.contact_type, requiresAdditionalVerification: row.requires_additional_verification === true, isOpen: row.is_open === true, version: row.policy_version } : null,
        membership, request, recoveryLocked, ...(verification ? { verification } : {}),
      };
    };
    return scope ? this.executeAccount(scope, read) : this.executePublic(read);
  }
}
