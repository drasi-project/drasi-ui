// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import {
  accumulateResult, DrasiError, subscribeToQuery,
  type ConnectionStatus, type QueryClient, type QueryDelta, type QueryResult,
  type QueryStream, type QuerySubscription, type QuerySubscriptionState,
  type QueryProjectionOptions, type ResultRow,
} from '@drasi/ui-core';

export interface Reading { label: string; value: number }

export const readingOptions: QueryProjectionOptions<Reading> = {
  getKey: row => {
    if (typeof row.station !== 'string' || !row.station) throw new TypeError('Missing station identity');
    return row.station;
  },
  transform: row => {
    if (typeof row.label !== 'string' || typeof row.value !== 'number' || !Number.isFinite(row.value)) {
      throw new TypeError('Invalid reading');
    }
    return { label: row.label, value: row.value };
  },
};

export const readings: ResultRow[] = [
  { station: 'north', label: 'North', value: 21 },
  { station: 'south', label: 'South', value: 18 },
];

class ContractStream implements QueryStream {
  private status: ConnectionStatus = { connected: true };
  private readonly statuses = new Set<(status: ConnectionStatus) => void>();
  private readonly queries = new Map<string, Set<(result: QueryDelta) => void>>();
  isConnected() { return this.status.connected; }
  getConnectionStatus() { return this.status; }
  onConnectionStatusChange(callback: (status: ConnectionStatus) => void) {
    this.statuses.add(callback);
    callback(this.status);
    return () => { this.statuses.delete(callback); };
  }
  subscribe(queryId: string, callback: (result: QueryDelta) => void) {
    const listeners = this.queries.get(queryId) ?? new Set();
    this.queries.set(queryId, listeners);
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (!listeners.size) this.queries.delete(queryId);
    };
  }
  emit(result: QueryDelta) {
    for (const callback of [...(this.queries.get(result.queryId) ?? [])]) callback(result);
  }
  connection(status: ConnectionStatus) {
    this.status = status;
    for (const callback of [...this.statuses]) callback(status);
  }
  get listenerCount() {
    return this.statuses.size + [...this.queries.values()].reduce((count, set) => count + set.size, 0);
  }
}

/**
 * Deterministic non-Server host shared by React and native Vue qualification.
 * No Server class, URLs, administrative DTOs, wire adapters or React types.
 */
export class ContractClient implements QueryClient {
  private readonly stream = new ContractStream();
  private readonly subscriptions = new Set<QuerySubscription>();
  private readonly snapshots = new Map<string, ResultRow[]>();
  private readonly failures = new Map<string, DrasiError>();
  readonly reads = new Map<string, number>();
  cancelledReads = 0;

  constructor(archiveValue = 5) {
    this.snapshots.set('sensors', readings.slice());
    this.snapshots.set('archive', [{ station: 'archived', label: 'Archive', value: archiveValue }]);
  }
  getConnectionStatus() { return this.stream.getConnectionStatus(); }
  onConnectionStatusChange(callback: (status: ConnectionStatus) => void) {
    return this.stream.onConnectionStatusChange(callback);
  }
  subscribe(
    queryId: string,
    callback: (result: QueryResult) => void,
    onError?: (error: DrasiError) => void,
    onStateChange?: (state: QuerySubscriptionState) => void,
  ): QuerySubscription {
    const subscription = subscribeToQuery({
      queryId, source: this.stream, details: { resourceKind: 'query', resourceId: queryId },
      maxRetries: 0, retryDelay: 1, maxRetryDelay: 1, maxPendingChanges: 4,
      snapshot: async signal => {
        this.reads.set(queryId, (this.reads.get(queryId) ?? 0) + 1);
        await Promise.resolve();
        if (signal.aborted) this.cancelledReads += 1;
        signal.throwIfAborted();
        const failure = this.failures.get(queryId);
        if (failure) throw failure;
        const rows = this.snapshots.get(queryId);
        if (!rows) throw new DrasiError('INVALID_CONFIGURATION', { resourceKind: 'query', resourceId: queryId });
        return rows.slice();
      },
      onStop: () => { this.subscriptions.delete(subscription); },
    }, callback, onError, onStateChange);
    this.subscriptions.add(subscription);
    return subscription;
  }
  emit(changes: QueryDelta['changes'], queryId = 'sensors') {
    const delta: QueryDelta = { kind: 'delta', queryId, changes, receivedAt: Date.now() };
    this.snapshots.set(queryId, accumulateResult(this.snapshots.get(queryId) ?? [], delta, readingOptions.getKey));
    this.stream.emit(delta);
  }
  update(value = 22) {
    this.emit([{ kind: 'update', before: { station: 'north' }, after: { station: 'north', label: 'North', value } }]);
  }
  sparseDelete() { this.emit([{ kind: 'delete', before: { station: 'south' } }]); }
  empty(queryId: string) {
    this.emit((this.snapshots.get(queryId) ?? []).map(row => ({
      kind: 'delete', before: { station: readingOptions.getKey(row) },
    })), queryId);
  }
  failSnapshot(queryId: string, failure: DrasiError | null) {
    if (failure) this.failures.set(queryId, failure);
    else this.failures.delete(queryId);
  }
  offline() {
    this.stream.connection({
      connected: false, reconnecting: true, error: new DrasiError('STREAM_UNAVAILABLE'),
    });
  }
  reconnect() { this.stream.connection({ connected: true, reconnecting: false }); }
  dispose() {
    for (const subscription of [...this.subscriptions]) subscription();
    this.stream.connection({ connected: false });
  }
  get activeSubscriptions() { return this.subscriptions.size; }
  get activeListeners() { return this.stream.listenerCount; }
}
