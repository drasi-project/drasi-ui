// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
'use client';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { DrasiClientProvider, useDrasiQuery } from '@drasi/react/react';
import { DataTable, Modal } from '@drasi/react/components';
import { ContractClient, readingOptions } from './host';

function Query({ queryId, reject, setRetry }: {
  queryId: string; reject: boolean; setRetry: (retry: () => void) => void;
}) {
  const options = useMemo(() => ({
    ...readingOptions,
    transform: reject ? () => { throw new Error('Deliberately rejected projection'); } : readingOptions.transform,
  }), [reject]);
  const query = useDrasiQuery(queryId, options);
  useEffect(() => { setRetry(query.retry); }, [query.retry, setRetry]);
  return <>
    <output data-testid="query-state" aria-label="Query state">{JSON.stringify({
      status: query.status, stale: query.stale, values: query.data?.map(row => row.value) ?? [],
      error: query.error?.code ?? null,
    })}</output>
    <p role="status">{query.stale ? 'Showing last known data. ' : ''}{query.status}</p>
    <DataTable title="Sensors" rows={query.data} rowKey={row => row.label}
      columns={[{ key: 'label', label: 'Station' }, { key: 'value', label: 'Reading' }]}
      state={{ loading: query.loading, stale: query.stale, error: query.error, retry: query.retry }} />
    <p aria-label="Shared presentation">Readings: {query.data?.length ?? 0}</p>
  </>;
}

function App() {
  const [client, setClient] = useState(() => new ContractClient());
  const [queryId, setQueryId] = useState('sensors');
  const [reject, setReject] = useState(false);
  const [disposed, setDisposed] = useState(false);
  const [dark, setDark] = useState(false);
  const [modal, setModal] = useState(false);
  const [retry, saveRetry] = useState<() => void>(() => () => {});
  const setRetry = useMemo(() => (value: () => void) => { saveRetry(() => value); }, []);
  useEffect(() => {
    client.reconnect();
    return () => client.dispose();
  }, [client]);
  const actions: [string, () => void][] = [
    ['Update', () => client.update()],
    ['Sparse delete', () => client.sparseDelete()],
    ['Projection failure', () => setReject(true)],
    ['Update while rejected', () => client.update(23)],
    ['Recover projection', () => setReject(false)],
    ['Offline', () => client.offline()],
    ['Reconnect', () => client.reconnect()],
    ['Retry query', () => retry()],
    ['Empty query', () => client.empty(queryId)],
    ['Change query', () => setQueryId('archive')],
    ['Replace connection', () => setClient(new ContractClient(99))],
    ['Dispose', () => { setDisposed(true); client.dispose(); }],
  ];
  return <main data-drasi-theme={dark ? 'dark' : 'light'}>
    <h1>React contract consumer</h1>
    <p>Simulated non-Server data. One hoisted query drives the table and summary.</p>
    <div>{actions.map(([label, action]) =>
      <button key={label} type="button" onClick={action} disabled={disposed}>{label}</button>)}</div>
    <button type="button" onClick={() => setDark(value => !value)}>Toggle theme</button>
    <button type="button" onClick={() => setModal(true)}>Open details</button>
    {disposed ? <p role="status">Disposed</p> :
      <DrasiClientProvider value={{ client, initialized: true, error: null, retry: () => client.reconnect() }}>
        <Query queryId={queryId} reject={reject} setRetry={setRetry} />
      </DrasiClientProvider>}
    <output data-testid="subscriptions" aria-label="Active subscriptions">{client.activeSubscriptions}</output>
    <Modal open={modal} onClose={() => setModal(false)} title="Reading details">
      <p>Provider-free modal</p>
      <button type="button" onClick={() => setModal(false)}>Close details</button>
    </Modal>
  </main>;
}

export function ReactContractApp() {
  return <StrictMode><App /></StrictMode>;
}
