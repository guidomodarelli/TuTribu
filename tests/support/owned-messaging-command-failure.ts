/** Classifies official CLI failures without exposing arguments, output or private process environment. */
import { MessagingNodeHostFailure } from "./messaging-node-host-failure";
import { OWNED_MESSAGING_NODE_DEPLOYMENT as DEPLOYMENT } from "./constants/owned-messaging-node-deployment";

/** @param commandName - Original own operation, never provider output. @returns A bounded operation label. */
function commandOperation(commandName: string): string {
  return DEPLOYMENT.commandNames.includes(commandName) ? commandName : DEPLOYMENT.unknownCommand;
}

/** @param details - Child-process failure metadata, if the failure is an Error. @param exitCode - Bounded numeric exit status, if any. @returns The fixed failure classification. */
function classifyCommandFailure(details: { code?: unknown; killed?: unknown; signal?: unknown } | null, exitCode: number | null): string {
  if (details?.code === DEPLOYMENT.bufferExceededCode) return DEPLOYMENT.commandFailure.outputLimit;
  if (details?.code === DEPLOYMENT.timeoutCode || details?.killed === true && details.signal === DEPLOYMENT.timeoutSignal) return DEPLOYMENT.commandFailure.timeout;
  return exitCode !== null ? `${DEPLOYMENT.commandFailure.exit}_${exitCode}` : DEPLOYMENT.commandFailure.unavailable;
}

/** @param commandName - Own CLI operation. @param error - Private child-process failure. @returns Only a fixed classification and a bounded numeric exit status. */
export function createOwnedMessagingCommandFailure(commandName: string, error: unknown): MessagingNodeHostFailure {
  const operation = commandOperation(commandName);
  const details = error instanceof Error ? error as Error & { code?: unknown; killed?: unknown; signal?: unknown } : null;
  const exitCode = typeof details?.code === "number" && Number.isInteger(details.code) && details.code >= 0 && details.code <= DEPLOYMENT.maximumExitCode ? details.code : null;
  const classification = classifyCommandFailure(details, exitCode);
  return new MessagingNodeHostFailure(`${DEPLOYMENT.commandFailurePrefix}_${operation}_${classification}`, error);
}

/** @param commandName - Own CLI operation. @param error - Private invalid JSON. @returns A fixed code without the output content. */
export function createOwnedMessagingOutputFailure(commandName: string, error: unknown): MessagingNodeHostFailure {
  return new MessagingNodeHostFailure(`${DEPLOYMENT.commandFailurePrefix}_${commandOperation(commandName)}_${DEPLOYMENT.commandFailure.invalidOutput}`, error);
}
