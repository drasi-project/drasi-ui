// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import { DrasiError, type DrasiErrorDetails } from '../client/errors';
import { isIdentifier, isRecord, readRows } from '../client/validation';
import type { QueryDelta, ResultAdapterContext, ResultChange } from '../client/types';

function invalid(details: DrasiErrorDetails): never {
  throw new DrasiError('INVALID_PAYLOAD', details);
}

function timestamp(value: unknown, details: DrasiErrorDetails): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid(details);
  return value;
}

/** Validate even custom adapters: a TypeScript declaration is not a runtime boundary. */
export function readAdaptedResults(value: unknown, context: ResultAdapterContext): readonly QueryDelta[] {
  if (!Array.isArray(value)) return invalid(context);
  return value.map(item => {
    if (!isRecord(item) || item.kind !== 'delta' || !isIdentifier(item.queryId) || !Array.isArray(item.changes)) {
      return invalid(context);
    }
    const details: DrasiErrorDetails = {
      instanceId: context.instanceId, resourceKind: 'query', resourceId: item.queryId,
    };
    const row = (value: unknown) => readRows([value], details)[0];
    const changes: ResultChange[] = item.changes.map(change => {
      if (!isRecord(change)) return invalid(details);
      switch (change.kind) {
        case 'upsert': return { kind: 'upsert', after: row(change.after) };
        case 'delete': return { kind: 'delete', before: row(change.before) };
        case 'update': return { kind: 'update', before: row(change.before), after: row(change.after) };
        default: return invalid(details);
      }
    });
    return {
      kind: 'delta', queryId: item.queryId, changes, receivedAt: timestamp(item.receivedAt, details),
      ...(item.sourceTimestamp === undefined ? {} : { sourceTimestamp: timestamp(item.sourceTimestamp, details) }),
    };
  });
}
