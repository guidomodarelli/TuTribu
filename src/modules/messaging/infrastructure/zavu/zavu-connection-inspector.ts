/** Inspects one explicitly authorized connection using the actual pinned SDK and a read-only scoped transport. @module zavu-connection-inspector */
import "server-only";
import Zavu from "@zavudev/sdk";
import type { MessagingConnectionInspector, MessagingCredentialInspection, MessagingSenderResource, MessagingTemplateResource } from "@/src/modules/messaging/domain/repositories/messaging-connection-inspector";
import type { MessagingSecretResourceScope } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { ZAVU_DELIVERY_ENDPOINT, ZAVU_DELIVERY_HEADER, ZAVU_DELIVERY_TRANSPORT } from "@/src/modules/messaging/constants/zavu-delivery";
import { ZAVU_INSPECTION_PATH, ZAVU_INSPECTION_PAGINATION, ZAVU_INSPECTION_TRANSPORT } from "@/src/modules/messaging/constants/zavu-inspection";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { normalizeMessagingProviderFailure } from "@/src/modules/messaging/infrastructure/api/messaging-route-http";
import { ZavuInspectionError } from "./zavu-inspection-error";
import { mapZavuSenderResource, mapZavuTemplateResource } from "./zavu-resource-mapper";

/** Holds a backend-only credential already recovered after current account/resource authorization. */
export type ZavuInspectionScope = Pick<MessagingSecretResourceScope, "tribeId" | "connectionId" | "connectionVersion" | "environment" | "securityEpoch" | "requestId"> & { credential: string };

/** Creates a fresh client per read, without sending, provisioning or inferring a ready channel. */
export class ZavuConnectionInspector implements MessagingConnectionInspector {
  /** @param scope - Explicit private connection and credential. @param fetch - Hosting or controlled own transport. @param timeoutMs - Per-request deadline in milliseconds. */
  constructor(private readonly scope: ZavuInspectionScope, private readonly fetch: typeof globalThis.fetch, private readonly timeoutMs: number = MESSAGING_DISPATCH_DEFAULT.requestTimeoutMs) {
    if (!scope.credential.trim()) throw new ZavuInspectionError("create", messagingFailure(MESSAGING_ERROR_CODE.invalidCredentials));
  }

  /** @param signal - Caller cancellation/deadline. @returns Private references and the provider's actual test mode. @throws ZavuInspectionError for safe classified upstream failures. */
  async inspectCredential(signal: AbortSignal): Promise<MessagingCredentialInspection> {
    return this.read("credential", signal, async (client) => {
      const result = await client.me.retrieve({ signal });
      if (!result || typeof result.isTestMode !== "boolean" || typeof result.apiKey?.id !== "string" || !result.apiKey.id || typeof result.project?.id !== "string" || !result.project.id || typeof result.team?.id !== "string" || !result.team.id) throw new ZavuInspectionError("credential", messagingFailure(MESSAGING_ERROR_CODE.upstreamPayloadUnusable));
      return { isTestMode: result.isTestMode, apiKeyId: result.apiKey.id, projectId: result.project.id, teamId: result.team.id };
    });
  }

  /** @param signal - Caller cancellation/deadline. @returns Every sender across bounded cursor pages. @throws ZavuInspectionError rather than publishing a partial list. */
  async listSenders(signal: AbortSignal): Promise<readonly MessagingSenderResource[]> {
    return this.read("senders", signal, (client) => this.readPages((cursor) => client.senders.list({ limit: ZAVU_INSPECTION_PAGINATION.pageSize, ...(cursor ? { cursor } : {}) }, { signal }), mapZavuSenderResource, signal));
  }

  /** @param resourceId - Validated external selection. @param signal - Caller cancellation. @returns The detail-confirmed sender selection. @throws ZavuInspectionError on absent/inaccessible/crossed detail. */
  async retrieveSender(resourceId: string, signal: AbortSignal): Promise<MessagingSenderResource> {
    return this.read("sender", signal, async (client) => mapZavuSenderResource(await client.senders.retrieve(resourceId, { signal }), resourceId));
  }

  /** @param signal - Caller cancellation/deadline. @returns Every template across bounded cursor pages. @throws ZavuInspectionError rather than publishing a partial list. */
  async listTemplates(signal: AbortSignal): Promise<readonly MessagingTemplateResource[]> {
    return this.read("templates", signal, (client) => this.readPages((cursor) => client.templates.list({ limit: ZAVU_INSPECTION_PAGINATION.pageSize, ...(cursor ? { cursor } : {}) }, { signal }), mapZavuTemplateResource, signal));
  }

  /** @param resourceId - Validated external selection. @param signal - Caller cancellation. @returns The detail-confirmed template and its language. @throws ZavuInspectionError on absent/inaccessible/crossed detail. */
  async retrieveTemplate(resourceId: string, signal: AbortSignal): Promise<MessagingTemplateResource> {
    return this.read("template", signal, async (client) => mapZavuTemplateResource(await client.templates.retrieve(resourceId, { signal }), resourceId));
  }

  /**
   * Follows an empty page's continuation and rejects cycles or an exceeded enumeration bound.
   * @typeParam Item - Actual SDK resource item.
   * @typeParam Result - Minimal owned selection.
   * @param load - Real SDK page operation with an explicit cursor.
   * @param map - Consumed-field projection, not a provider schema guard.
   * @param signal - Original cancellation/deadline.
   * @returns Complete owned selections after reaching the terminal cursor.
   */
  private async readPages<Item, Result>(load: (cursor: string | undefined) => PromiseLike<{ items: Item[]; nextCursor: string }>, map: (item: Item) => Result, signal: AbortSignal): Promise<Result[]> {
    const results: Result[] = [], cursors = new Set<string>();
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < ZAVU_INSPECTION_PAGINATION.maximumPages; pageIndex += 1) {
      signal.throwIfAborted();
      const page = await load(cursor);
      signal.throwIfAborted();
      if (!Array.isArray(page.items)) throw new ZavuInspectionError("resources", messagingFailure(MESSAGING_ERROR_CODE.upstreamPayloadUnusable));
      results.push(...page.items.map((item) => map(item)));
      if (!page.nextCursor) return results;
      if (typeof page.nextCursor !== "string" || cursors.has(page.nextCursor)) throw new ZavuInspectionError("resources", messagingFailure(MESSAGING_ERROR_CODE.upstreamPayloadUnusable));
      cursor = page.nextCursor; cursors.add(cursor);
    }
    throw new ZavuInspectionError("resources", messagingFailure(MESSAGING_ERROR_CODE.upstreamPayloadUnusable));
  }

  /**
   * Rebuilds effective headers and allowlists only pinned read endpoints for this connection.
   * @typeParam Result - Own private projection.
   * @param operation - Fixed safe diagnostic operation name.
   * @param signal - Caller cancellation/deadline.
   * @param run - Real SDK resource read.
   * @returns Projected read result without SDK payload forwarding.
   * @throws ZavuInspectionError with private original cause; cancellation retains its original reason.
   */
  private async read<Result>(operation: string, signal: AbortSignal, run: (client: Zavu) => Promise<Result>): Promise<Result> {
    signal.throwIfAborted();
    const scopedFetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url);
      const allowedPath = url.pathname === ZAVU_INSPECTION_PATH.credential || [ZAVU_INSPECTION_PATH.senders, ZAVU_INSPECTION_PATH.templates].some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`) && !url.pathname.slice(path.length + 1).includes("/"));
      if (url.origin !== ZAVU_DELIVERY_ENDPOINT.origin || !allowedPath || request.method !== ZAVU_INSPECTION_TRANSPORT.method || url.username || url.password || [...url.searchParams.keys()].some((key) => key !== ZAVU_INSPECTION_TRANSPORT.cursor && key !== ZAVU_INSPECTION_TRANSPORT.limit)) throw new ZavuInspectionError(operation, messagingFailure(MESSAGING_ERROR_CODE.resourceUnavailable));
      const headers = new Headers({ [ZAVU_DELIVERY_HEADER.authorization]: `${ZAVU_DELIVERY_TRANSPORT.authorizationPrefix}${this.scope.credential}`, [ZAVU_DELIVERY_HEADER.accept]: ZAVU_DELIVERY_TRANSPORT.json, [ZAVU_DELIVERY_HEADER.requestId]: this.scope.requestId });
      // Preserve the SDK controller directly across sanitized Request clones and native GC.
      return this.fetch(new Request(request, { headers, redirect: ZAVU_DELIVERY_TRANSPORT.redirect }),{signal:init?.signal??request.signal});
    };
    const client = new Zavu({ apiKey: this.scope.credential, baseURL: ZAVU_DELIVERY_ENDPOINT.origin, fetch: scopedFetch, timeout: this.timeoutMs, maxRetries: ZAVU_DELIVERY_TRANSPORT.maximumRetries, logLevel: ZAVU_DELIVERY_TRANSPORT.logLevel });
    try {
      const result = await run(client);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof ZavuInspectionError) throw error;
      throw new ZavuInspectionError(operation, normalizeMessagingProviderFailure(error, { operation: "read", dispatchAuthorized: false }));
    }
  }
}
