// Copyright 2026 The Drasi Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

import type { DrasiError, DrasiErrorDetails } from './errors';

/** JSON values in opaque, plugin-owned read-only configuration. */
export type JsonValue = null | boolean | number | string
  | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Validated object row. Applications must narrow/transform its unknown fields. */
export type ResultRow = Record<string, unknown>;

/** Insert/replace by the application's stable key, or an explicit before/after change. */
export type ResultChange<T = ResultRow> =
  | { readonly kind: 'upsert'; readonly after: T }
  | { readonly kind: 'update'; readonly before: T; readonly after: T }
  | { readonly kind: 'delete'; readonly before: T };

export interface QuerySnapshot<T = ResultRow> {
  readonly kind: 'snapshot';
  readonly queryId: string;
  readonly rows: readonly T[];
  /** Local receipt time for display only, never an ordering cursor. */
  readonly receivedAt: number;
}

export interface QueryDelta<T = ResultRow> {
  readonly kind: 'delta';
  readonly queryId: string;
  readonly changes: readonly ResultChange<T>[];
  readonly receivedAt: number;
  /** SSE reaction wall-clock time, when supplied. Not a snapshot cursor. */
  readonly sourceTimestamp?: number;
}

/** The only accumulated-result boundary. Wire alternatives must use a named adapter. */
export type QueryResult<T = ResultRow> = QuerySnapshot<T> | QueryDelta<T>;

export interface ResultAdapterContext extends Readonly<DrasiErrorDetails> {
  readonly receivedAt: number;
}

/** Synchronous wire validation/normalization. Empty output means a validated heartbeat/no-op. */
export type ResultAdapter = (
  payload: unknown,
  context: ResultAdapterContext,
) => readonly QueryDelta[];

/** Raw identity must also work on sparse deletes. No default, transform, or serialization fallback. */
export type RowKey = (row: Readonly<ResultRow>) => string;

export type QueryStatus =
  | 'initial-loading' | 'live' | 'empty' | 'reconnecting' | 'resynchronizing'
  | 'stale-last-good-data' | 'terminal-error';

export type QueryErrorScope = 'query' | 'connection';

/** Subscription work state; hooks additionally distinguish an empty accumulated result set. */
export interface QuerySubscriptionState {
  readonly status: Exclude<QueryStatus, 'empty'>;
  readonly stale: boolean;
  readonly error: DrasiError | null;
  readonly errorScope: QueryErrorScope | null;
}

/** Calling the handle unsubscribes; retry restarts only this subscription's REST reconciliation. */
export interface QuerySubscription {
  (): void;
  retry(): void;
  getState(): QuerySubscriptionState;
}

export interface ResultReconciliationOptions {
  /** Maximum changes observed during a pending snapshot (default 10000), not a result-set limit. */
  maxPendingChanges?: number;
}

/** Live transport status, not proof that each query snapshot is synchronized. */
export interface ConnectionStatus {
  connected: boolean;
  reconnecting?: boolean;
  error?: DrasiError;
  lastConnected?: Date;
}

/** Connection observation does not imply a synchronized query snapshot. */
export interface QueryConnection {
  getConnectionStatus(): ConnectionStatus;
  /** Emit current status on registration; the returned function removes only this listener. */
  onConnectionStatusChange(callback: (status: ConnectionStatus) => void): () => void;
}

/** Data-only binding contract. The application owns connection creation, retry and disposal. */
export interface QueryClient extends QueryConnection {
  /** Optional diagnostic scope, not an administrative resource requirement. */
  readonly instanceId?: string;
  /**
   * Independent normalized subscription state, with query-local retry and cancellation.
   * Publish current state through onStateChange, including scoped errors. A connection
   * owner must stop subscriptions on disposal; a binding only stops its own handle.
   */
  subscribe(
    queryId: string,
    callback: (result: QueryResult) => void,
    onError?: (error: DrasiError) => void,
    onStateChange?: (state: QuerySubscriptionState) => void,
  ): QuerySubscription;
}

/** Minimal live transport used by bounded snapshot reconciliation. */
export interface QueryStream extends QueryConnection {
  isConnected(): boolean;
  subscribe(
    queryId: string,
    callback: (result: QueryDelta) => void,
    onError?: (error: DrasiError) => void,
  ): () => void;
}

/** Context for fresh per-request authentication, including each stream opening. */
export interface DrasiRequestContext {
  readonly url: string;
  readonly transport: 'rest' | 'sse';
  readonly signal: AbortSignal;
  readonly instanceId?: string;
}

/** Re-evaluated for every REST request and stream attempt. Never logged or cached as a token. */
export type DrasiHeadersProvider = (
  context: DrasiRequestContext,
) => HeadersInit | Promise<HeadersInit>;

export type DrasiHeaders = HeadersInit | DrasiHeadersProvider;

/** Passed to custom stream factories; each attempt receives its own headers and cancellation signal. */
export interface EventSourceOptions {
  readonly headers: Headers;
  readonly credentials: RequestCredentials;
  readonly signal: AbortSignal;
}

/** Defaults: ten retries after the first attempt, 1s exponential backoff capped at 30s, 10s open timeout. */
export interface ReconnectOptions {
  maxReconnectAttempts?: number;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  connectionTimeoutMs?: number;
}
