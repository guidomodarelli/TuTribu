import "server-only";

import { sql } from "drizzle-orm";

import type { MemberProfileRepository } from "@/src/modules/auth/domain/repositories/member-profile-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Runs a callback against a connected database. The executor is injected so the
 * repository stays decoupled from pool acquisition and connection lifecycle.
 */
type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MemberImageRow = {
  image: string | null;
};

/**
 * Reads and updates the profile image stored in the authentication user table.
 *
 * This repository runs outside any request-scoped row-level-security context
 * (it is used by background profile refreshes), mirroring how Better Auth itself
 * writes the user image with the same database role.
 */
export class PostgresMemberProfileRepository implements MemberProfileRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async getImage(userId: string): Promise<string | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select image
        from public."user"
        where id = ${userId}
        limit 1
      `);
      const row = (result.rows?.[0] ?? null) as MemberImageRow | null;

      return row?.image ?? null;
    });
  }

  async updateImage(userId: string, imageUrl: string): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public."user"
        set image = ${imageUrl}, "updatedAt" = timezone('utc', now())
        where id = ${userId}
      `);
    });
  }
}
