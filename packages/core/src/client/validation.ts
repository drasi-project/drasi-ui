// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import { DrasiError, type DrasiErrorDetails } from './errors';
import type { JsonValue, ResultRow } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function isJsonValue(value: unknown): value is JsonValue {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every(isJsonValue)) ||
    (isRecord(value) && Object.values(value).every(isJsonValue));
}

export function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

/** The raw boundary validates JSON objects, not application-specific row fields. */
export function readRows(value: unknown, details: DrasiErrorDetails): ResultRow[] {
  if (!Array.isArray(value) || !value.every(isJsonObject)) {
    throw new DrasiError('INVALID_PAYLOAD', details);
  }
  return value;
}

export function isIdentifier(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') return false;
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}
