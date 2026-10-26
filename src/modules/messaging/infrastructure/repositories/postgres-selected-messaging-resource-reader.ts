/** Reads the tribe's usable selected messaging version inside a dependent owner's original transaction. @module postgres-selected-messaging-resource-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingEffectiveSelection } from "../../domain/repositories/messaging-connection-activation";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";

/**
 * Takes no row lock: an activation holds the connection it activates before the dependent policy, so locking it here could deadlock.
 * The caller holds its policy lock instead; an activation waiting for that lock then sees the reference read here and replaces it.
 * @param database - Caller's guarded transaction, already authorized for this tribe and holding the dependent policy lock.
 * @param tribeId - Exact current scope.
 * @returns The selected, active or degraded and unretired version, or null when the tribe has no usable selection; never credentials or provider data.
 */
export async function readSelectedMessagingResource(database: RequestDatabase, tribeId: string): Promise<MessagingEffectiveSelection | null> {
  const selected = (await database.execute<{ id: string; selected_version: number }>(sql`select connection.id,connection.selected_version from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id and resource.version=connection.selected_version and resource.retired_at is null where connection.tribe_id=${tribeId} and connection.is_selected and connection.retired_at is null and connection.state in (${MESSAGING_CONNECTION_STATE.active},${MESSAGING_CONNECTION_STATE.degraded})`)).rows[0];
  return selected ? { connectionId: selected.id, connectionVersion: selected.selected_version } : null;
}
