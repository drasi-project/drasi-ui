// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import type { JsonValue, ResultRow } from '../../client/types';

/** Source subscription as serialized by the v1 full-view query endpoint. */
export interface QuerySource {
  readonly sourceId: string;
  readonly pipeline: readonly string[];
  readonly nodes: readonly string[];
  readonly relations: readonly string[];
}

export interface QueryJoinKey {
  readonly label: string;
  readonly property: string;
}

export interface QueryJoin {
  readonly id: string;
  readonly keys: readonly QueryJoinKey[];
}

export interface QueryMiddleware {
  readonly kind: string;
  readonly name: string;
  readonly config: Readonly<Record<string, JsonValue>>;
}

export type QueryLanguage = 'Cypher' | 'GQL';

/** Complete read-only v1 definition, not a resource creation request. */
export interface QueryConfig {
  readonly id: string;
  readonly autoStart: boolean;
  readonly query: string;
  readonly queryLanguage: QueryLanguage;
  readonly middleware: readonly QueryMiddleware[];
  readonly sources: readonly QuerySource[];
  readonly enableBootstrap: boolean;
  readonly bootstrapBufferSize: number;
  readonly joins?: readonly QueryJoin[];
  readonly priorityQueueCapacity?: number;
  readonly dispatchBufferCapacity?: number;
  readonly dispatchMode?: 'Channel';
  readonly storageBackend?: JsonValue;
  readonly outboxCapacity: number;
  readonly bootstrapTimeoutSecs: number;
}

export interface ReactionConfig {
  readonly id: string;
  readonly kind: string;
  readonly queries: readonly string[];
  readonly [property: string]: JsonValue | undefined;
}

export interface SseReactionConfig extends ReactionConfig {
  readonly kind: 'sse';
  readonly host: string;
  readonly port: number;
  readonly ssePath: string;
  readonly heartbeatIntervalMs: number;
}

export type ComponentStatus =
  | 'Starting' | 'Running' | 'Stopping' | 'Stopped'
  | 'Error' | 'Reconfiguring' | 'Added' | 'Removed';

export interface ComponentLinks {
  readonly self: string;
  readonly full: string;
}

export interface Component<T> {
  readonly id: string;
  readonly status: ComponentStatus;
  readonly error_message?: string;
  readonly links: ComponentLinks;
  readonly config: T;
}

export interface ReactionReference {
  readonly id: string;
  /** Explicit browser-reachable HTTP(S) URL; significant trailing slashes are preserved. */
  readonly endpoint: string;
}

export type RouteUnidentified = (
  rows: ResultRow[],
  deliver: (queryId: string, rows: ResultRow[]) => void,
) => void;

export interface LegacyResultAdapterOptions {
  /** Only used for missing IDs; never overrides an envelope's query ID. */
  routeUnidentified?: RouteUnidentified;
}
