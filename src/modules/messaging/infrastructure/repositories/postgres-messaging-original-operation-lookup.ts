/** Tells whether the ledger already holds one sensitive messaging original, without locking it or reading its intent. @module postgres-messaging-original-operation-lookup */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingOriginalOperation, MessagingOriginalOperationLookup } from "../../domain/repositories/messaging-repositories";
import { MESSAGING_CONNECTION_ISSUANCE_LEDGER_TYPE } from "../../constants/messaging-connection-operation";
import { MESSAGING_CREDENTIAL_VALIDATION_OPERATION } from "../../constants/messaging-credential-validation";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/**
 * @param operation - Fixed server operation the resolver authorizes.
 * @returns The ledger namespaces that register its original: a credential validation registers its preparation first and a
 * diagnostic test registers an issuance or a resend; every other write registers under its own operation.
 */
function ledgerTypesOf(operation: string): readonly string[] {
  if (operation === REAUTHENTICATION_OPERATION.validateMessagingConnection) return [MESSAGING_CREDENTIAL_VALIDATION_OPERATION.prepare, MESSAGING_CREDENTIAL_VALIDATION_OPERATION.complete];
  if (operation === REAUTHENTICATION_OPERATION.diagnoseMessagingConnection) return MESSAGING_CONNECTION_ISSUANCE_LEDGER_TYPE;
  return [operation];
}

/** Reads inside the resolver's own account-authorized transaction; it never claims, renews or completes an original. */
export class PostgresMessagingOriginalOperationLookup implements MessagingOriginalOperationLookup {
  /** @param database - Current transaction, already bound to the confirmed actor and its tribe leadership. */
  constructor(private readonly database: RequestDatabase) {}

  /** @param original - Exact original scoped to the current actor and tribe. @returns Whether that original already has a ledger row. */
  async isRegistered(original: MessagingOriginalOperation): Promise<boolean> {
    const diagnostic = original.operation === REAUTHENTICATION_OPERATION.diagnoseMessagingConnection;
    const rows = (await this.database.execute(sql`select id from public.academy_admission_operations where actor_user_id=${original.actorUserId} and tribe_id=${original.tribeId} and idempotency_key=${original.operationId} and operation_type=any(${sql.param([...ledgerTypesOf(original.operation)])}::text[]) and (${!diagnostic}::boolean or verification_purpose=${ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic}) limit 1`)).rows;
    return rows.length > 0;
  }
}
