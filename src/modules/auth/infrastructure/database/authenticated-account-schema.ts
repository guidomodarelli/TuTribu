/** Reflects the private native-session/account relation; SQL owns grants and immutable invalidation. */
import {sql} from "drizzle-orm";
import {pgTable,text,timestamp,foreignKey,check,type AnyPgColumn} from "drizzle-orm/pg-core";

/** Shares parent columns through explicit infrastructure composition. */
type AuthenticatedAccountSchemaParents={sessions:{id:AnyPgColumn;userId:AnyPgColumn};accounts:{id:AnyPgColumn;userId:AnyPgColumn;accountId:AnyPgColumn}};

/**
 * Composes auth-owned session identity with its existing account/session parents.
 * @param parents - Actual owned schema columns; no data or credential lookup occurs.
 * @returns Private table projection, without adding fields to the public Better Auth session.
 */
export function createAuthenticatedAccountSchema(parents:AuthenticatedAccountSchemaParents) {
  const globalSessionIdentityBindings=pgTable("global_session_identity_bindings",{
    sessionId:text("session_id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),providerSubject:text("provider_subject").notNull(),normalizedEmail:text("normalized_email").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().default(sql`clock_timestamp()`),invalidatedAt:timestamp("invalidated_at",{withTimezone:true}),
  },(table)=>({
    sessionIdentitySessionFkey:foreignKey({name:"global_session_identity_session_fkey",columns:[table.sessionId,table.userId],foreignColumns:[parents.sessions.id,parents.sessions.userId]}).onDelete("cascade"),
    sessionIdentityAccountReferenceFkey:foreignKey({name:"global_session_identity_account_reference_fkey",columns:[table.accountId],foreignColumns:[parents.accounts.id]}).onDelete("set null"),
    // SQL owns deferred scope checking after the scalar FK archives a removed account.
    sessionIdentityAccountFkey:foreignKey({name:"global_session_identity_account_fkey",columns:[table.accountId,table.userId,table.providerSubject],foreignColumns:[parents.accounts.id,parents.accounts.userId,parents.accounts.accountId]}),
    sessionIdentityEmailCheck:check("global_session_identity_bindings_normalized_email_check",sql`normalized_email<>'' and normalized_email=lower(btrim(normalized_email))`),
  }));
  return {globalSessionIdentityBindings};
}
