"use client";
/** Reads the viewer/tribe-scoped records that browser workflows keep in Web Storage before a mutation, so an uncertain answer is recovered instead of repeated. @module scoped-intent-storage */
import type { z } from "zod";

/** The project's own browser persistence edge, injectable without mocking platform libraries. */
export type ScopedIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Owner of a stored record: the native account and the tribe route it was written for. */
export type ScopedIntentOwner = { viewerId: string; slug: string };

/** @param prefix - Workflow storage prefix. @param viewerId - Native account. @param slug - Current tribe. @returns An isolated storage key, never a permission token. */
export function buildScopedIntentKey(prefix: string, viewerId: string, slug: string): string {
  return `${prefix}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`;
}

/** @param schema - Stored record shape. @param owner - Current viewer and tribe. @param key - Storage key of the record. @param storage - Browser persistence edge. @returns The record when it parses and belongs to the owner; corrupted, invalid or foreign records are removed. */
export function readScopedIntentRecord<StoredRecord extends ScopedIntentOwner>(schema: z.ZodType<StoredRecord>, { slug, viewerId }: ScopedIntentOwner, key: string, storage: ScopedIntentStorage): StoredRecord | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { storage.removeItem(key); return null; }
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) { storage.removeItem(key); return null; }
  return parsed.data;
}
