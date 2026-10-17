// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import { DrasiError, asDrasiError, type DrasiErrorDetails } from '../client/errors';
import type {
  QueryClient, QueryErrorScope, QueryStatus, QuerySubscriptionState, ResultRow, RowKey,
} from '../client/types';
import { accumulateResult } from './accumulation';

/** Identity is raw and includes sparse deletes; projection never determines identity. */
export interface QueryProjectionOptions<T extends object = ResultRow> {
  getKey: RowKey;
  /** Return null to hide a row while retaining its raw identity for future changes. */
  transform: (row: Readonly<ResultRow>) => T | null;
  postProcess?: (rows: T[]) => T[];
}

export interface RawQueryState {
  readonly rows: ResultRow[] | null;
  readonly lastUpdate: Date | null;
  readonly state: QuerySubscriptionState;
}

export interface QueryProjection<T extends object> {
  readonly data: T[] | null;
  readonly error: DrasiError | null;
}

export interface AcceptedQueryView<T extends object> {
  readonly data: T[];
  readonly lastUpdate: Date | null;
}

export interface QueryView<T extends object = ResultRow> {
  data: T[] | null;
  status: QueryStatus;
  stale: boolean;
  loading: boolean;
  error: DrasiError | null;
  errorScope: QueryErrorScope | null;
  lastUpdate: Date | null;
}

export interface QueryObservation {
  getSnapshot(): RawQueryState;
  retry(): void;
  stop(): void;
}

export function initialQueryState(error: DrasiError | null = null): RawQueryState {
  return {
    rows: null, lastUpdate: null,
    state: {
      status: error ? 'terminal-error' : 'initial-loading',
      stale: false, error, errorScope: error ? 'connection' : null,
    },
  };
}

/** Retain a useful baseline while restarting work within the same binding scope. */
export function retainQueryBaseline(previous: RawQueryState, next: RawQueryState): RawQueryState {
  return next.rows === null
    ? { ...next, rows: previous.rows, lastUpdate: previous.lastUpdate }
    : next;
}

/**
 * One independent observer, not a query cache. The framework supplies a committed
 * identity callback and owns stop timing; the client owns transport consistency.
 */
export function observeQuery(
  client: QueryClient,
  queryId: string,
  getKey: RowKey,
  changed: (state: RawQueryState) => void,
): QueryObservation {
  let active = true;
  let current = initialQueryState();
  const publish = (next: RawQueryState) => {
    if (!active) return;
    current = next;
    changed(current);
  };
  const subscription = client.subscribe(queryId, batch => {
    if (!active) return;
    const rows = accumulateResult(current.rows ?? [], batch, getKey, {
      instanceId: client.instanceId, resourceKind: 'query', resourceId: queryId,
    });
    publish({ ...current, rows, lastUpdate: new Date(batch.receivedAt) });
  }, error => {
    publish({ ...current, state: { ...current.state, error } });
  }, state => {
    publish({ ...current, state });
  });
  return {
    getSnapshot: () => current,
    retry: () => { if (active) subscription.retry(); },
    stop: () => {
      if (!active) return;
      active = false;
      subscription();
    },
  };
}

/** Pure, transactional view derivation; failures cannot corrupt the retained raw rows. */
export function projectQueryRows<T extends object>(
  rows: readonly ResultRow[] | null,
  options: QueryProjectionOptions<T>,
  details: DrasiErrorDetails = {},
): QueryProjection<T> {
  if (rows === null) return { data: null, error: null };
  try {
    const keyed = accumulateResult([], {
      kind: 'snapshot', queryId: details.resourceId ?? '', rows, receivedAt: 0,
    }, options.getKey, details);
    const transformed: T[] = [];
    for (const row of keyed) {
      const value = options.transform(row);
      if (value === null) continue;
      if (typeof value !== 'object') throw new DrasiError('RESULT_PROCESSING_FAILED', details);
      transformed.push(value);
    }
    const data = options.postProcess ? options.postProcess(transformed) : transformed;
    if (!Array.isArray(data) || data.some(value => value === null || typeof value !== 'object')) {
      throw new DrasiError('RESULT_PROCESSING_FAILED', details);
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: asDrasiError(error, details, 'RESULT_PROCESSING_FAILED') };
  }
}

/** lastGood is committed by the binding, never by speculative rendering. */
export function queryView<T extends object>(
  raw: RawQueryState,
  projection: QueryProjection<T>,
  lastGood: AcceptedQueryView<T> | null,
  connectionError: DrasiError | null = null,
): QueryView<T> {
  const data = projection.error ? lastGood?.data ?? null : projection.data;
  const error = connectionError ?? raw.state.error ?? projection.error;
  const phase = connectionError || projection.error ? 'terminal-error' : raw.state.status;
  const status = phase === 'initial-loading' && data !== null ? 'resynchronizing'
    : phase === 'live' && data?.length === 0 ? 'empty' : phase;
  return {
    data, status, stale: data !== null && status !== 'live' && status !== 'empty',
    loading: data === null && error === null && status !== 'terminal-error',
    error, errorScope: connectionError ? 'connection' : raw.state.errorScope ?? (projection.error ? 'query' : null),
    lastUpdate: projection.error ? lastGood?.lastUpdate ?? null : raw.lastUpdate,
  };
}
