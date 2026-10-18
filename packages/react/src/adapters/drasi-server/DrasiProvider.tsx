// Copyright 2025 The Drasi Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DrasiError, asDrasiError, isAbortError } from '@drasi/ui-core';
import {
  DrasiClient, serverConfigurationKey,
  type DrasiClientOptions, type QueryConfig,
} from '@drasi/ui-core/adapters/drasi-server';
import { DrasiClientProvider } from '../../react/DrasiContext';

export interface DrasiServerContextValue {
  client: DrasiClient | null;
  initialized: boolean;
  error: DrasiError | null;
  retry: () => void;
}

const ServerContext = createContext<DrasiServerContextValue | undefined>(undefined);

/** Bind an already-owned Server client without initializing or disposing it. */
export function DrasiServerClientProvider({ value, children }: {
  value: DrasiServerContextValue;
  children: React.ReactNode;
}) {
  return <ServerContext.Provider value={value}>
    <DrasiClientProvider value={value}>{children}</DrasiClientProvider>
  </ServerContext.Provider>;
}

export interface DrasiProviderProps extends DrasiClientOptions {
  children: React.ReactNode;
}

export interface UseDrasiQueryDefinitionResult {
  config: QueryConfig | null;
  loading: boolean;
  error: DrasiError | null;
}

/** Optional read-only Server connection. All referenced resources must already exist. */
export const DrasiProvider: React.FC<DrasiProviderProps> = ({
  serverUrl, instanceId, queryIds, reaction, resultAdapter, reconciliation,
  fetch: fetcher, headers, credentials, eventSourceFactory, reconnect, requestTimeoutMs, children,
}) => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    client: DrasiClient | null; attempt: number; initialized: boolean; error: DrasiError | null;
  }>({ client: null, attempt: 0, initialized: false, error: null });
  const key = serverConfigurationKey({
    serverUrl, instanceId, queryIds, reaction, headers, credentials, reconnect, requestTimeoutMs, reconciliation,
  });
  const headersProvider = typeof headers === 'function' ? headers : undefined;
  const creation = useMemo(() => {
    try {
      if (key === null) throw new DrasiError('INVALID_CONFIGURATION', { instanceId });
      return {
        client: new DrasiClient({
          serverUrl, instanceId, queryIds, reaction, resultAdapter, reconciliation,
          fetch: fetcher, headers, credentials, eventSourceFactory, reconnect, requestTimeoutMs,
        }),
        error: null,
      };
    } catch (failure) {
      return { client: null, error: asDrasiError(failure, { instanceId }, 'INVALID_CONFIGURATION') };
    }
  }, [key, instanceId, resultAdapter, fetcher, eventSourceFactory, headersProvider]);
  const client = creation.client;
  const activeCreation = useRef<typeof creation | null>(null);
  const initialized = state.client === client && state.attempt === attempt && state.initialized;
  const error = creation.error ??
    (state.client === client && state.attempt === attempt ? state.error : null);
  const retry = useCallback(() => {
    if (activeCreation.current === creation) setAttempt(current => current + 1);
  }, [creation]);

  useEffect(() => {
    let cancelled = false;
    activeCreation.current = creation;
    setState({ client, attempt, initialized: false, error: creation.error });
    if (!client) {
      return () => {
        if (activeCreation.current === creation) activeCreation.current = null;
      };
    }
    const unsubscribe = client.onConnectionStatusChange(status => {
      if (!cancelled && status.error && !status.reconnecting) {
        setState({ client, attempt, initialized: false, error: status.error });
      }
    });
    client.initialize().then(() => {
      if (!cancelled) setState({ client, attempt, initialized: true, error: null });
    }).catch(err => {
      if (!cancelled && !isAbortError(err)) {
        setState({ client, attempt, initialized: false, error: asDrasiError(err, { instanceId }) });
      }
    });
    return () => {
      cancelled = true;
      if (activeCreation.current === creation) activeCreation.current = null;
      unsubscribe();
      void client.disconnect();
    };
  }, [client, attempt, instanceId, creation]);

  const value = useMemo<DrasiServerContextValue>(
    () => ({ client, initialized, error, retry }),
    [client, initialized, error, retry],
  );
  return <DrasiServerClientProvider value={value}>{children}</DrasiServerClientProvider>;
};

/** Server inspection is explicitly unavailable on a data-only provider. */
export function useDrasiServerClient(): DrasiServerContextValue {
  const context = useContext(ServerContext);
  if (!context) throw new Error('useDrasiServerClient must be used within a Server <DrasiProvider>.');
  return context;
}

export function useDrasiServerUiUrl(): string | null {
  const { client, initialized } = useDrasiServerClient();
  if (!initialized || !client) return null;
  return client.getServerUiUrl();
}

/** Fetch a complete read-only definition without leaking stale data across scopes. */
export function useDrasiQueryDefinition(queryId: string): UseDrasiQueryDefinitionResult {
  const { client, initialized, error: providerError } = useDrasiServerClient();
  const [config, setConfig] = useState<QueryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DrasiError | null>(null);
  const scope = useMemo(() => ({ client, queryId }), [client, queryId]);
  const [owner, setOwner] = useState(scope);
  useEffect(() => {
    if (owner !== scope) {
      setOwner(scope);
      setConfig(null);
    }
    if (!initialized || !client) {
      setError(providerError);
      setLoading(!providerError);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    client.getQueryConfig(queryId, controller.signal).then(result => {
      if (!cancelled) {
        setConfig(result);
        setLoading(false);
      }
    }).catch(queryError => {
      if (!cancelled && !isAbortError(queryError)) {
        setError(asDrasiError(queryError, {
          instanceId: client.instanceId, resourceKind: 'query', resourceId: queryId,
        }));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [queryId, client, initialized, providerError, scope]);
  return owner === scope ? { config, loading, error }
    : { config: null, loading: !providerError, error: providerError };
}
