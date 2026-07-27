import { sql } from "drizzle-orm";

import { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import type {
  GetTribeIdentityQuery,
  SaveTribeIdentityCommand,
  TribeIdentity,
  TribeIdentityRepository,
  TribeIdentitySaveResult,
} from "@/src/modules/tribes/domain/repositories/tribe-identity-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type IdentityRow = {
  cover_url: string | null;
  id: string;
  logo_url: string | null;
};

type IdentitySaveRow = {
  applied: boolean | null;
};

export class PostgresTribeIdentityRepository
  implements TribeIdentityRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async getByTribeSlug({
    tribeSlug,
  }: GetTribeIdentityQuery): Promise<TribeIdentity | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribes.id,
          tribes.logo_url,
          tribes.cover_url
        from public.tribes
        where tribes.slug = ${tribeSlug}
        limit 1
      `);
      const row = (result.rows?.[0] ?? null) as IdentityRow | null;

      return row ? { coverUrl: row.cover_url, logoUrl: row.logo_url } : null;
    });
  }

  /**
   * Writes the identity through the leader-guarded definer, then refreshes the
   * reserved upload attachments so the images it now references survive the
   * orphan sweep and the ones it dropped become reclaimable.
   */
  async save({
    coverUrl,
    logoUrl,
    tribeSlug,
  }: SaveTribeIdentityCommand): Promise<TribeIdentitySaveResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.set_tribe_identity(
          ${tribeSlug},
          ${logoUrl},
          ${coverUrl}
        ) as applied
      `);
      const row = (result.rows?.[0] ?? null) as IdentitySaveRow | null;

      if (!row?.applied) {
        return { identity: null, status: TRIBE_IMAGE_SAVE_STATUS.forbidden };
      }

      await database.execute(sql`
        select public.refresh_tribe_image_attachments(tribes.id)
        from public.tribes
        where tribes.slug = ${tribeSlug}
      `);

      return {
        identity: { coverUrl, logoUrl },
        status: TRIBE_IMAGE_SAVE_STATUS.updated,
      };
    });
  }
}
