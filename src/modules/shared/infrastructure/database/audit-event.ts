/**
 * Contract of audit events written inside the caller's transaction, shared by
 * modules that receive the writer from the composition root.
 *
 * @module audit-event
 */

import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Audit event with ids and state transitions only; never emails, links or financial data. */
export type AuditEventRecord = {
  action: string;
  actorUserId: string | null;
  correlationId: string | null;
  entityId: string;
  entityType: string;
  fromState: string | null;
  reason: string | null;
  subjectUserId: string | null;
  toState: string | null;
  tribeId: string;
};

/** Appends one audit event with the transaction-scoped database. */
export type AuditEventWriter = (
  database: RequestDatabase,
  event: AuditEventRecord
) => Promise<void>;
