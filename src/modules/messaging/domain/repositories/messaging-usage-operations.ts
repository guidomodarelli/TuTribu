/** Defines the tribe usage owner without a connection, secret or provider dependency. @module messaging-usage-operations */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Private current-session identity, resolved by the server and rechecked by the SQL adapter. */
export type MessagingUsageContext = { actorUserId: string; sessionId: string; tribeId: string; requestId: string };

/** Scoped global recency for usage management; the tribe itself is the resource. */
export type MessagingUsageSensitiveContext = MessagingUsageContext & {
  operation: typeof REAUTHENTICATION_OPERATION.initializeMessagingUsage | typeof REAUTHENTICATION_OPERATION.updateMessagingUsage;
  resourceId: string; accountId: string; subject: string; authenticatedAt: Date; validUntil: Date;
};

/** The boundary validates input once; sorted countries define the ledger's normalized intent. */
export type MessagingUsageUpdate = {
  operationId: string; confirmed: true; expectedVersion: number; allowedCountries: string[];
  verificationDailyLimit: number; notificationDailyLimit: number;
};

/** Configuration and read contracts remain owned by application through this generic port. */
export interface MessagingUsageOperations<Policy, State> {
  /** Reads current configuration without initializing, claiming or contacting a provider. */
  read(context: MessagingUsageContext): Promise<State>;
  /** Explicitly initializes server defaults once; an existing resource is returned unchanged. */
  initialize(context: MessagingUsageSensitiveContext, operationId: string): Promise<AdmissionOperationResult<Policy>>;
  /** Applies one resource CAS, after recovering a matching original committed intent. */
  update(context: MessagingUsageSensitiveContext, input: MessagingUsageUpdate): Promise<AdmissionOperationResult<Policy>>;
}
