/** Loads one current leader list snapshot through inward queries and a final native viewer check. @module get-allowlist-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { confirmSameAdmissionAccount } from "./admission-account-continuity";
import { runScopedAdmissionRead } from "./admission-tribe-scope";
import type { ManageAllowlistUseCases } from "./manage-allowlist-use-cases";
import type { GetAdmissionPolicyUseCase } from "./get-admission-policy-use-case";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import type { AllowlistQuery } from "../../domain/repositories/allowlist-management";
import { allowlistPageStateSchema } from "../results/allowlist-page-state";
import { readAdmissionPlatformRequirement } from "../results/admission-platform-requirement";
import { ALLOWLIST_CURSOR_SEPARATOR } from "../../constants/allowlist-management";

/** The SSR loader is the primary list entry point; no write or provider dependency is introduced. */
export class GetAllowlistPageUseCase {
  /** @param accounts - Current native identity. @param readers - Authorized own list/policy and canonical routing. @param clock - Fresh final render clock. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { allowlist: Pick<ManageAllowlistUseCases, "list">; policy: Pick<GetAdmissionPolicyUseCase, "execute">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, private readonly clock: () => Date) {}

  /** @param query - Once-validated slug/filters and safe correlation. @returns Current safe props or a controlled failure without partial private data. */
  async execute(query: { slug: string; requestId: string; filters: AllowlistQuery }) {
    return runScopedAdmissionRead({ accounts: this.accounts, clock: this.clock, routing: this.readers.resolveTribe }, query, async ({ first, scope }) => {
      const policy = await this.readers.policy.execute(scope);
      if (!policy.ok) return policy;
      const page = await this.readers.allowlist.list({ ...scope, ...query.filters });
      if (!page.ok) return page;
      const { current, now } = await confirmSameAdmissionAccount(this.accounts, first, this.clock);
      const { cursor, ...filters } = query.filters;
      return { ok: true as const, value: allowlistPageStateSchema.parse({ kind: "ready", slug: query.slug, tribeId: scope.tribeId, viewerId: current.userId, renderedAt: now.toISOString(), contactType: policy.value.policy?.contactType ?? null, platformRequirement: readAdmissionPlatformRequirement(policy.value), page: page.value, query: { ...filters, ...(cursor ? { cursor: [cursor.createdAt, cursor.id].join(ALLOWLIST_CURSOR_SEPARATOR) } : {}) } }) };
    });
  }
}
