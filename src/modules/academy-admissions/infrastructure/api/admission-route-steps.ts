/** Shared request steps of admission routes: same-origin check, once-only input validation and tribe scoping before any application effect. @module admission-route-steps */
import "server-only";
import type { z } from "zod";
import { admissionFailure, type AdmissionFailure } from "../../application/results/admission-errors";
import { resolveAdmissionTribeScope, type AdmissionTribeRouting, type AdmissionTribeScope } from "../../application/use-cases/admission-tribe-scope";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import type { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";

/** The single own JSON boundary of the current request. */
export type AdmissionRouteBoundary = ReturnType<typeof createAdmissionRouteBoundary>;
/** A step stopped the request; its response is returned as is. */
type AdmissionRouteRejection = { response: Response };
/** Validated route params and query of one request. */
type AdmissionRouteInput<Params, Query> = { params: Params; query: Query };
/** Native composition opened for the request, with the internal scope of its URL-selected tribe. */
type AdmissionTribeServices<Services> = { services: Services; scope: AdmissionTribeScope };
/** Composition that can resolve a public slug to its internal tribe. */
type AdmissionTribeComposition = { resolveTribe: AdmissionTribeRouting };
/** Native request and its framework route params. */
type AdmissionNativeRoute = { request: Request; params: Promise<unknown> };

/**
 * @param step - Outcome of one request step.
 * @returns Whether the step stopped the request with a response.
 */
function isRejection(step: object): step is AdmissionRouteRejection {
  return "response" in step;
}

/**
 * Validates params, then query, each claimed once, before opening any composition.
 * @param boundary - Current request boundary.
 * @param native - Native request and framework route params.
 * @param schemas - Own params and query schemas.
 * @returns The validated input, or the input failure response.
 */
export async function readAdmissionRouteInput<Params, Query>(boundary: AdmissionRouteBoundary, native: AdmissionNativeRoute, schemas: { params: z.ZodType<Params>; query: z.ZodType<Query> }): Promise<AdmissionRouteInput<Params, Query> | AdmissionRouteRejection> {
  const routeParams = boundary.input("params", schemas.params, await native.params);
  if (!routeParams.usable) return { response: routeParams.response };
  const query = boundary.input("query", schemas.query, Object.fromEntries(new URL(native.request.url).searchParams));
  if (!query.usable) return { response: query.response };
  return { params: routeParams.value, query: query.value };
}

/**
 * Denies a foreign origin, then validates params, query and the JSON body, in that order.
 * @param boundary - Current request boundary.
 * @param native - Native request and framework route params.
 * @param schemas - Own params, query and body schemas, plus the value an empty body stands for, if allowed.
 * @returns The validated input and body, or the denial/input failure response.
 */
export async function readAdmissionCommandInput<Params, Query, Body>(boundary: AdmissionRouteBoundary, native: AdmissionNativeRoute, schemas: { params: z.ZodType<Params>; query: z.ZodType<Query>; body: z.ZodType<Body>; emptyBody?: { emptyBodyValue: unknown } }): Promise<AdmissionRouteInput<Params, Query> & { body: Body } | AdmissionRouteRejection> {
  if (!hasAllowedAdmissionOrigin(native.request)) return { response: boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied)) };
  const input = await readAdmissionRouteInput(boundary, native, schemas);
  if (isRejection(input)) return input;
  const body = await boundary.readBody(schemas.body, schemas.emptyBody);
  if (!body.usable) return { response: body.response };
  return { ...input, body: body.value };
}

/**
 * Opens the native composition and resolves the URL-selected tribe.
 * @param boundary - Current request boundary.
 * @param open - Lazy native composition, opened only after the input was accepted.
 * @param slug - Validated tribe slug.
 * @returns The composed services and current tribe scope, or the routing failure response.
 */
export async function openAdmissionTribeScope<Services extends AdmissionTribeComposition>(boundary: AdmissionRouteBoundary, open: () => Promise<Services>, slug: string): Promise<AdmissionTribeServices<Services> | AdmissionRouteRejection> {
  const services = await open();
  const tribe = await resolveAdmissionTribeScope(services.resolveTribe, { slug, requestId: boundary.requestContext.requestId });
  if (!tribe.ok) return { response: boundary.failure(tribe.failure) };
  return { services, scope: tribe.value };
}

/**
 * @param boundary - Current request boundary.
 * @param open - Lazy native composition.
 * @param input - Accepted input naming the tribe, or the rejection of an earlier step.
 * @returns The input with the composed services and tribe scope, or the earlier/routing failure response.
 */
async function scopeAdmissionInput<Input extends { params: { slug: string } }, Services extends AdmissionTribeComposition>(boundary: AdmissionRouteBoundary, open: () => Promise<Services>, input: Input | AdmissionRouteRejection): Promise<Input & AdmissionTribeServices<Services> | AdmissionRouteRejection> {
  if (isRejection(input)) return input;
  const opened = await openAdmissionTribeScope(boundary, open, input.params.slug);
  if (isRejection(opened)) return opened;
  return { ...input, ...opened };
}

/**
 * Validates params and query, then opens the composition scoped to the URL-selected tribe.
 * @param boundary - Current request boundary.
 * @param native - Native request and framework route params.
 * @param schemas - Own params and query schemas.
 * @param open - Lazy native composition, opened only after the input was accepted.
 * @returns The validated input with the composed services and tribe scope, or the input/routing failure response.
 */
export async function openAdmissionTribeRoute<Params extends { slug: string }, Query, Services extends AdmissionTribeComposition>(boundary: AdmissionRouteBoundary, native: AdmissionNativeRoute, schemas: { params: z.ZodType<Params>; query: z.ZodType<Query> }, open: () => Promise<Services>): Promise<AdmissionRouteInput<Params, Query> & AdmissionTribeServices<Services> | AdmissionRouteRejection> {
  return scopeAdmissionInput(boundary, open, await readAdmissionRouteInput(boundary, native, schemas));
}

/**
 * Denies a foreign origin, validates params, query and body, then opens the composition scoped to the URL-selected tribe.
 * @param boundary - Current request boundary.
 * @param native - Native request and framework route params.
 * @param schemas - Own params, query and body schemas.
 * @param open - Lazy native composition, opened only after the whole input was accepted.
 * @returns The validated input and body with the composed services and tribe scope, or the denial/input/routing failure response.
 */
export async function openAdmissionTribeCommand<Params extends { slug: string }, Query, Body, Services extends AdmissionTribeComposition>(boundary: AdmissionRouteBoundary, native: AdmissionNativeRoute, schemas: { params: z.ZodType<Params>; query: z.ZodType<Query>; body: z.ZodType<Body> }, open: () => Promise<Services>): Promise<AdmissionRouteInput<Params, Query> & { body: Body } & AdmissionTribeServices<Services> | AdmissionRouteRejection> {
  return scopeAdmissionInput(boundary, open, await readAdmissionCommandInput(boundary, native, schemas));
}

/**
 * Validates the JSON body, then opens the composition and resolves the tribe, so no effect precedes a rejected body.
 * @param boundary - Current request boundary.
 * @param schema - Own body schema.
 * @param open - Lazy native composition.
 * @param slug - Validated tribe slug.
 * @returns The validated body with the composed services and tribe scope, or the input/routing failure response.
 */
export async function readAdmissionBodyInTribeScope<Body, Services extends AdmissionTribeComposition>(boundary: AdmissionRouteBoundary, schema: z.ZodType<Body>, open: () => Promise<Services>, slug: string): Promise<{ body: Body } & AdmissionTribeServices<Services> | AdmissionRouteRejection> {
  const body = await boundary.readBody(schema);
  if (!body.usable) return { response: body.response };
  const opened = await openAdmissionTribeScope(boundary, open, slug);
  if (isRejection(opened)) return opened;
  return { body: body.value, ...opened };
}

/**
 * Validates a query already split from its route, then opens the composition scoped to the tribe.
 * @param boundary - Current request boundary.
 * @param query - Own query schema and the raw query of the request.
 * @param open - Lazy native composition.
 * @param slug - Validated tribe slug.
 * @returns The validated query with the composed services and tribe scope, or the input/routing failure response.
 */
export async function readAdmissionQueryInTribeScope<Query, Services extends AdmissionTribeComposition>(boundary: AdmissionRouteBoundary, query: { schema: z.ZodType<Query>; input: unknown }, open: () => Promise<Services>, slug: string): Promise<{ query: Query } & AdmissionTribeServices<Services> | AdmissionRouteRejection> {
  const parsed = boundary.input("query", query.schema, query.input);
  if (!parsed.usable) return { response: parsed.response };
  const opened = await openAdmissionTribeScope(boundary, open, slug);
  if (isRejection(opened)) return opened;
  return { query: parsed.value, ...opened };
}

/**
 * @param boundary - Current request boundary.
 * @param schema - Own public DTO schema.
 * @param result - Application result.
 * @returns The guarded DTO, or the projected application failure.
 */
export function respondWithAdmissionResult<Value>(boundary: AdmissionRouteBoundary, schema: z.ZodType<Value>, result: { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }): Response {
  return result.ok ? boundary.success(schema, result.value) : boundary.failure(result.failure);
}
