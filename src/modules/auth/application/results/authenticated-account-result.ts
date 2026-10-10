/** Private application projection: routes must map it to an own public DTO before serialization. */
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";

export type AuthenticatedAccountResult = AuthenticatedAccount;
