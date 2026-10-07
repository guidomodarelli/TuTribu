/** Adapts legacy own-database port fixtures to resource locks without mocking PostgreSQL or ORM libraries. @module legacy-membership-executor-fixture */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/** Keeps prior behavior fixtures for business statements; their resource locks return no public data. */
export function createLegacyMembershipExecutorFixture(execute:(statement:unknown,...parameters:unknown[])=>unknown) {
  const dialect=new PgDialect();
  return (statement:unknown,...parameters:unknown[])=>{
    const query=dialect.sqlToQuery(statement as SQL).sql.trim().toLowerCase().replace(/\s+/g," ");
    const isNewResourceLock = query.startsWith("select tribe.id from public.tribes tribe where tribe.slug=")
      || query.startsWith("select settings.tribe_id from public.tribe_academy_settings settings ")
      || query.startsWith("select member.id from public.tribe_members member join public.tribes tribe ")
      || query.startsWith("select tribes.id from public.tribes where tribes.id=");
    if(isNewResourceLock && /for (update|share)/.test(query)) return Promise.resolve({rows:[]});
    return execute(statement,...parameters);
  };
}
