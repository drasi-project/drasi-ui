// Copyright 2025 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import {
  useCallback, createContext, useContext, useEffect, useInsertionEffect, useMemo, useRef, useState,
} from 'react';
import {
  initialQueryState, observeQuery, projectQueryRows, queryView, retainQueryBaseline,
  type AcceptedQueryView, type ConnectionStatus, type DrasiError, type QueryClient,
  type QueryObservation, type RawQueryState, type ResultRow,
} from '@drasi/ui-core';
import type { UseDrasiQueryOptions, UseDrasiQueryResult } from './types';

export interface DrasiContextValue {
  client: QueryClient | null;
  initialized: boolean;
  error: DrasiError | null;
  /** App-owned shared-connection retry, distinct from a query-local refresh. */
  retry: () => void;
}

const DrasiContext = createContext<DrasiContextValue | undefined>(undefined);

/** Bind an app-owned data client. The owner connects, retries and disposes it. */
export const DrasiClientProvider = DrasiContext.Provider;

export function useDrasiClient(): DrasiContextValue {
  const context = useContext(DrasiContext);
  if (!context) throw new Error('useDrasiClient must be used within a <DrasiClientProvider>.');
  return context;
}

/** Independent query state; hoist one hook to share it across presentations. */
export function useDrasiQuery<T extends object = ResultRow>(
  queryId: string,
  options: UseDrasiQueryOptions<T>,
): UseDrasiQueryResult<T> {
  const { client, initialized, error: providerError } = useDrasiClient();
  const scope = useMemo(() => ({ client, queryId }), [client, queryId]);
  const [result, setResult] = useState<RawQueryState & { scope: typeof scope }>(
    () => ({ ...initialQueryState(), scope }),
  );
  const getKey = options.getKey;
  const committedGetKey = useRef(getKey);
  // A speculative render must never publish the callback used by live events.
  useInsertionEffect(() => { committedGetKey.current = getKey; }, [getKey]);
  const observationRef = useRef<{ scope: typeof scope; observation: QueryObservation } | null>(null);
  const lastGood = useRef<(AcceptedQueryView<T> & { scope: typeof scope }) | null>(null);
  const retry = useCallback(() => {
    if (observationRef.current?.scope === scope) observationRef.current.observation.retry();
  }, [scope]);

  useEffect(() => {
    const initial = initialQueryState(providerError);
    setResult(current => ({
      ...retainQueryBaseline(current.scope === scope ? current : initial, initial), scope,
    }));
    if (!initialized || !client) return;
    const observation = observeQuery(client, queryId, row => committedGetKey.current(row), next => {
      setResult(current => ({
        ...retainQueryBaseline(current.scope === scope ? current : initial, next), scope,
      }));
    });
    observationRef.current = { scope, observation };
    return () => {
      if (observationRef.current?.observation === observation) observationRef.current = null;
      observation.stop();
    };
  }, [queryId, client, initialized, providerError, scope]);

  const raw = result.scope === scope ? result : initialQueryState(providerError);
  const projection = useMemo(() => projectQueryRows(raw.rows, options, {
    instanceId: client?.instanceId, resourceKind: 'query', resourceId: queryId,
  }), [raw.rows, options.getKey, options.transform, options.postProcess, client, queryId]);
  useEffect(() => {
    if (projection.data !== null) {
      lastGood.current = { scope, data: projection.data, lastUpdate: raw.lastUpdate };
    }
  }, [projection, scope, raw.lastUpdate]);
  const previous = lastGood.current?.scope === scope ? lastGood.current : null;
  return { ...queryView(raw, projection, previous, providerError), retry };
}

export function useDrasiConnectionStatus(): ConnectionStatus {
  const { client, initialized, error: providerError } = useDrasiClient();
  const [state, setState] = useState<{ client: QueryClient | null; status: ConnectionStatus }>({
    client, status: { connected: false },
  });
  useEffect(() => {
    if (!client) {
      setState({ client, status: { connected: false, error: providerError ?? undefined } });
      return;
    }
    let active = true;
    const stop = client.onConnectionStatusChange(status => {
      if (active) setState({ client, status });
    });
    return () => { active = false; stop(); };
  }, [client, initialized, providerError]);
  return providerError ? { connected: false, error: providerError }
    : state.client === client ? state.status : { connected: false };
}
