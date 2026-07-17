import { sql } from "drizzle-orm";

import type {
  TouchTribePresenceCommand,
  TribePresenceRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-presence-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type PresenceTouchRow = {
  touched: boolean | null;
};

const POSTGRES_ERROR_CODE = {
  undefinedFunction: "42883",
} as const;

function isMissingPresenceFunctionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as { cause?: unknown; code?: string };
  const causeCode =
    postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
      ? (postgresError.cause as { code?: string }).code
      : undefined;

  return (
    postgresError.code === POSTGRES_ERROR_CODE.undefinedFunction ||
    causeCode === POSTGRES_ERROR_CODE.undefinedFunction
  );
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
      const row = (result.rows?.[0] ?? null) as PresenceTouchRow | null;

      return Boolean(row?.touched);
    }).catch((error: unknown) => {
      if (isMissingPresenceFunctionError(error)) {
        return false;
      }

      throw error;
    });
  }
}
