/** Adapts legacy own-database port fixtures to resource locks without mocking PostgreSQL or ORM libraries. @module legacy-membership-executor-fixture */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * Preserves business-row fixtures while resultless actor and tenant locks leave their response queue untouched.
 * This own-port double does not verify locking or RLS; the native membership suites exercise those effects.
 * @param execute - Existing business-statement fixture at the application's own database boundary.
 * @returns An executor that supplies no public data for the awaited resource-lock statements.
 */
export function createLegacyMembershipExecutorFixture(execute:(statement:unknown,...parameters:unknown[])=>unknown) {
  const dialect=new PgDialect();
  return (statement:unknown,...parameters:unknown[])=>{
    const query=dialect.sqlToQuery(statement as SQL).sql.trim().toLowerCase().replace(/\s+/g," ");
    const isResourceLock = query.startsWith('select id from public."user" where id=public.current_app_user_id() ')
      || query.startsWith("select tribe.id from public.tribes tribe where tribe.slug=")
      || query.startsWith("select settings.tribe_id from public.tribe_academy_settings settings ")
      || query.startsWith("select member.id from public.tribe_members member join public.tribes tribe ")
      || query.startsWith("select tribes.id from public.tribes where ");
    if(isResourceLock && /for (update|share)/.test(query)) return Promise.resolve({rows:[]});
    return execute(statement,...parameters);
  };
}
