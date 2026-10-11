/** Retires current admission authority through a private protected SQL owner on the existing transaction. @module postgres-admission-scope-closure-writer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionScopeClosureEvent, AdmissionScopeClosureWriter } from "../../domain/repositories/admission-scope-closure-writer";

/** Never claims delivery, decrypts a credential or promises to undo an accepted send. */
export class PostgresAdmissionScopeClosureWriter implements AdmissionScopeClosureWriter {
  /** @param database - Original guarded and authorized tribe lifecycle transaction. */
  constructor(private readonly database: RequestDatabase) {}
  /** @param event - Locked real lifecycle scope. @returns After scope retirement is staged atomically. */
  async close(event: AdmissionScopeClosureEvent): Promise<void> {
    await this.database.execute(sql`select public.close_academy_admission_scope(${event.tribeId},${event.reason})`);
  }
}
