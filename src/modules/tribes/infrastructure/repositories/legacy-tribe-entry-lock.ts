/** Serializes legacy membership writes with control activation, mode changes and moderation. @module legacy-tribe-entry-lock */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Retains tenant, mode and current instance locks before a legacy entrypoint evaluates current facts.
 * @param database - Caller-owned guarded transaction; no additional checkout or provider call occurs.
 * @param tribeSlug - Server-normalized tenant identity; actor is read from the database context.
 * @returns Nothing after the shared tenant → settings → membership order is established.
 */
export async function lockLegacyTribeEntry(database:RequestDatabase,tribeSlug:string):Promise<void> {
  await database.execute(sql`select tribe.id from public.tribes tribe where tribe.slug=${tribeSlug} for update`);
  await database.execute(sql`select settings.tribe_id from public.tribe_academy_settings settings join public.tribes tribe on tribe.id=settings.tribe_id where tribe.slug=${tribeSlug} for share of settings`);
  await database.execute(sql`select member.id from public.tribe_members member join public.tribes tribe on tribe.id=member.tribe_id where tribe.slug=${tribeSlug} and member.user_id=public.current_app_user_id() for update of member`);
}
