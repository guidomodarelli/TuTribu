import { sql } from "drizzle-orm";

import type {
  TouchTribePresenceCommand,
  TribePresenceRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-presence-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import {
  POSTGRES_ERROR_CODE,
  hasPostgresErrorCode,
} from "@/src/modules/shared/infrastructure/database/postgres-error";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type PresenceTouchRow = {
  touched: boolean | null;
};

function isMissingPresenceFunctionError(error: unknown): boolean {
  return hasPostgresErrorCode(error, [
    POSTGRES_ERROR_CODE.undefinedFunction,
  ]);
}

export class PostgresTribePresenceRepository implements TribePresenceRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async touchByTribeSlug({
    tribeSlug,
  }: TouchTribePresenceCommand): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.touch_tribe_member_presence(${tribeSlug}) as touched
      `);
      const row = (result.rows[0] ?? null) as PresenceTouchRow | null;

      return Boolean(row?.touched);
    }).catch((error: unknown) => {
      if (isMissingPresenceFunctionError(error)) {
        return false;
      }

      throw error;
    });
  }
}
