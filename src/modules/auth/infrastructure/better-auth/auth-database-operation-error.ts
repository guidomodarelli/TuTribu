/** Protects SQL causes even in dependency-owned loggers that interpolate or inspect errors. @module auth-database-operation-error */
import { inspect } from "node:util";
import { AUTH_DATABASE_DIAGNOSTIC, type AuthDatabaseOperation } from "../../constants/auth-database-diagnostics";
import type {RequestContext} from "@/src/modules/shared/infrastructure/observability/request-context";

/** Keeps the real cause available to private control flow without exposing it through native console/JSON. */
export class AuthDatabaseOperationError extends Error {
  readonly code = AUTH_DATABASE_DIAGNOSTIC.code;
  readonly operation: AuthDatabaseOperation;
  readonly requestId:string;
  readonly traceId:string;

  /** @param operation - Fixed native method, never its model/query arguments. @param cause - The unchanged actual database failure. @param context - Safe owning correlation for dependency singleton output. */
  constructor(operation: AuthDatabaseOperation,cause: unknown,context:RequestContext) {
    super(AUTH_DATABASE_DIAGNOSTIC.message,{ cause });
    this.name=AUTH_DATABASE_DIAGNOSTIC.name;this.operation=operation;
    this.requestId=context.requestId;this.traceId=context.traceId;
  }
  /** @returns Safe text for dependency loggers that concatenate the caught error. */
  override toString(): string { return `${AUTH_DATABASE_DIAGNOSTIC.name}: ${AUTH_DATABASE_DIAGNOSTIC.message} operation=${this.operation} requestId=${this.requestId} traceId=${this.traceId}`; }
  /** @returns Only fixed diagnostic fields; the original cause stays nonenumerable and private. */
  toJSON(): { name: string; code: string; operation: AuthDatabaseOperation;requestId:string;traceId:string } { return { name: AUTH_DATABASE_DIAGNOSTIC.name, code: AUTH_DATABASE_DIAGNOSTIC.code, operation: this.operation,requestId:this.requestId,traceId:this.traceId }; }
  /** @returns The same safe representation for native Node Console, including dependency singleton loggers. */
  [inspect.custom](): { name: string; code: string; operation: AuthDatabaseOperation;requestId:string;traceId:string } { return this.toJSON(); }
}
