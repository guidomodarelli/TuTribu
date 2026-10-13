/** Reads current leader-only policy state without recency, initialization or provider work. @module postgres-admission-policy-reader */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AdmissionPolicyStateReader, AdmissionPolicyState } from "../../domain/repositories/admission-policy-management";
import type { MessagingUsagePolicyReader } from "../../domain/repositories/messaging-usage-policy-reader";
import { authorizeAdmissionPolicy } from "./postgres-admission-policy-authorizer";
import { readAdmissionControlMarker, readAdmissionPolicy } from "./postgres-admission-policy-storage";

/** The root binds current account execution and the sole messaging country owner to one transaction. */
export class PostgresAdmissionPolicyReader implements AdmissionPolicyStateReader {
  /** @param execute - Current native actor's guarded transaction. @param composeUsage - Country owner bound to that exact transaction and authority. */
  constructor(private readonly execute: <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>, private readonly composeUsage: (database: RequestDatabase, context: AuthorizedAdmissionContext) => MessagingUsagePolicyReader) {}

  /** @param context - Current server-derived leader scope. @returns True absence or current private configuration, never a fabricated version. */
  async read(context: AuthorizedAdmissionContext): Promise<AdmissionPolicyState> {
    return this.execute(context, async (database) => {
      await authorizeAdmissionPolicy(database, context);
      const policy = await readAdmissionPolicy(database, context.tribeId, false);
      const controlActivated = Boolean(await readAdmissionControlMarker(database, context.tribeId));
      const usage = await this.composeUsage(database, context).readForTribe(context.tribeId);
      await authorizeAdmissionPolicy(database, context);
      return { policy, controlActivated, usage };
    });
  }
}
