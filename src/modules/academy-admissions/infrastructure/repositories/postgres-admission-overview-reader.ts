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

/** Explicit account state is never fabricated for an anonymous public projection. */
type OverviewAccountScope = Pick<AdmissionCommandScope, "userId" | "sessionId">;
type PublicOverviewRow = { tribe_id: string; slug: string; name: string; control_activated: boolean; evaluator_enabled: boolean; mode: "manual_review" | "allowlist" | null; contact_type: "email" | "phone" | null; requires_additional_verification: boolean | null; is_open: boolean | null; policy_version: number | null };

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

  /** @param query - Boundary-validated public slug/correlation. @param scope - Native current account or explicit public access. @returns Own facts, public-only facts, or genuine absence; no downstream DTO or effect. */
  async readOverview(query: { slug: string; requestId: string }, scope: OverviewAccountScope | null): Promise<AdmissionOverviewFacts<AdmissionRequestDto> | null> {
    const read = async (database: RequestDatabase): Promise<AdmissionOverviewFacts<AdmissionRequestDto> | null> => {
      if (scope) await this.authorize(database, scope);
      const row = (await database.execute<PublicOverviewRow>(sql`select * from public.read_public_admission_overview(${query.slug})`)).rows[0];
      if (!row) { if (scope) await this.authorize(database, scope); return null; }
      const membership = scope ? (await database.execute<NonNullable<AdmissionOverviewFacts["membership"]>>(sql`select role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${row.tribe_id} and user_id=${scope.userId}`)).rows[0] ?? null : null;
      const request = scope ? await new PostgresOwnAdmissionRequestReader((_current, run) => run(database)).readOwn({ ...scope, tribeId: row.tribe_id, requestId: query.requestId }) : null;
      const recoveryLocked = await this.readRecoveryLock();
      if (scope) await this.authorize(database, scope);
      return {
        tribe: { id: row.tribe_id, slug: row.slug, name: row.name, accessModel: TRIBE_ACCESS_MODEL.academy, controlActivated: row.control_activated, evaluatorEnabled: row.evaluator_enabled },
        policy: row.policy_version !== null && row.mode && row.contact_type ? { mode: row.mode, contactType: row.contact_type, requiresAdditionalVerification: row.requires_additional_verification === true, isOpen: row.is_open === true, version: row.policy_version } : null,
        membership, request, recoveryLocked,
      };
    };
    return scope ? this.executeAccount(scope, read) : this.executePublic(read);
  }
}
