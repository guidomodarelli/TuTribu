import { eq } from "drizzle-orm";

import type { TribeCreatorWhitelistRepository } from "@/src/modules/tribes/domain/repositories/tribe-creator-whitelist-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { tribeCreatorWhitelist } from "@/src/modules/shared/infrastructure/database/schema";

type RecoverableDatabaseError = {
  code?: string;
  message: string;
};

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

const TRIBE_CREATOR_WHITELIST = {
  missingTableCode: "42P01",
} as const;

function isMissingWhitelistTableError(error: RecoverableDatabaseError | null): boolean {
  if (!error) {
    return false;
  }

  return error.code === TRIBE_CREATOR_WHITELIST.missingTableCode;
}

export class PostgresTribeCreatorWhitelistRepository
  implements TribeCreatorWhitelistRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async isEmailAllowed(email: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      return await this.executeWithDatabase(async (database) => {
        const [allowedEmail] = await database
          .select({
            email: tribeCreatorWhitelist.email,
          })
          .from(tribeCreatorWhitelist)
          .where(eq(tribeCreatorWhitelist.email, normalizedEmail))
          .limit(1);

        return Boolean(allowedEmail?.email);
      });
    } catch (error) {
      const recoverableError = error as RecoverableDatabaseError;

      if (isMissingWhitelistTableError(recoverableError)) {
        return false;
      }

      throw error;
    }
  }
}
