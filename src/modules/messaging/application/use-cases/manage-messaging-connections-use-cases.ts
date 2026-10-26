/** Derives current tribe authority before creating protected unselected connection metadata. @module manage-messaging-connections */
import type { MessagingAccountProvider,MessagingAuthorizationReader } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingConnectionCreator,MessagingConnectionCreationInput } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { MessagingConnectionMutationResult } from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import { MessagingConnectionOperationError } from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { ResolveMessagingTribeManagementUseCase,type MessagingTribeManagementQuery } from "./resolve-messaging-tribe-management-use-case";

/** Keeps plaintext input in the server action only; creation never inspects or sends through a provider. */
export class ManageMessagingConnectionsUseCases {
  private readonly authority:ResolveMessagingTribeManagementUseCase;
  /** @param accounts - Current native identity. @param authorization - Canonical current leadership. @param creator - Protected transactional connection owner. @param clock - Current time after awaited facts. */
  constructor(accounts:MessagingAccountProvider,authorization:Pick<MessagingAuthorizationReader,"getCurrentLeadership">,private readonly creator:MessagingConnectionCreator<MessagingConnectionMutationResult>,clock:()=>Date) {
    this.authority=new ResolveMessagingTribeManagementUseCase(accounts,authorization,clock);
  }
  /** @param input - Boundary-validated intent and server-resolved tribe/correlation, without browser authority. @returns Original safe metadata, registered progress or a closed outcome; no credential is returned. */
  async create(input:MessagingTribeManagementQuery&MessagingConnectionCreationInput) {
    try {
      const context=await this.authority.execute(input,REAUTHENTICATION_OPERATION.saveMessagingCredentials);
      return {ok:true as const,value:await this.creator.create(context,input)};
    }catch(error){
      const code=error instanceof MessagingConnectionOperationError||error instanceof MessagingUsageOperationError||error instanceof MessagingSecretAccessError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure;
      return {ok:false as const,failure:messagingFailure(code,{cause:error,...(error instanceof MessagingConnectionOperationError&&error.code===MESSAGING_ERROR_CODE.operationUnresolved&&error.operationId?{operation:{operationId:error.operationId,state:OPERATION_STATE.started}}:{})})};
    }
  }
}
