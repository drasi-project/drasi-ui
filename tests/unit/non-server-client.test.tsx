// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DrasiError, initialQueryState, observeQuery, projectQueryRows, queryView,
  type AcceptedQueryView, type QueryObservation, type RawQueryState,
} from '@drasi/ui-core';
import { DrasiClientProvider, useDrasiQuery } from '../../packages/react/src/react';
import { QueryTable } from '../../packages/react/src/components';
import { useDrasiServerClient } from '../../packages/react/src/adapters/drasi-server';
import { ContractClient, readingOptions, type Reading } from '../contracts/host';

describe('framework-neutral query ownership', () => {
  it('binds a structural non-Server client to the actual hook and QueryTable', async () => {
    const client = new ContractClient();
    const view = render(<React.StrictMode>
      <DrasiClientProvider value={{ client, initialized: true, error: null, retry: () => client.reconnect() }}>
        <QueryTable queryId="sensors" queryOptions={readingOptions} rowKey={row => row.label}
          columns={[{ key: 'label', label: 'Station' }, { key: 'value', label: 'Reading' }]} title="Sensors" />
      </DrasiClientProvider>
    </React.StrictMode>);
    await screen.findByText('North');
    expect(client.activeSubscriptions).toBe(1);
    act(() => client.update());
    expect(screen.getByText('22')).toBeTruthy();
    act(() => client.sparseDelete());
    expect(screen.queryByText('South')).toBeNull();
    act(() => client.offline());
    expect(screen.getByRole('alert').textContent).toContain('Showing last known data');
    await act(async () => { client.reconnect(); });
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();
    expect(client.activeSubscriptions).toBe(0);
    expect(client.activeListeners).toBe(0);
    expect(client.getConnectionStatus().connected).toBe(true);
    client.dispose();
  });

  it('keeps independent subscribers, query-local retries and committed projection baselines', async () => {
    const client = new ContractClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <DrasiClientProvider value={{ client, initialized: true, error: null, retry: vi.fn() }}>{children}</DrasiClientProvider>;
    const first = renderHook(({ reject }) => useDrasiQuery('sensors', {
      ...readingOptions, transform: row => {
        if (reject) throw new Error('private projection detail');
        return readingOptions.transform(row);
      },
    }), { wrapper, initialProps: { reject: false } });
    const other = renderHook(() => useDrasiQuery('archive', readingOptions), { wrapper });
    await waitFor(() => expect(first.result.current.status).toBe('live'));
    await waitFor(() => expect(other.result.current.status).toBe('live'));
    expect(client.activeSubscriptions).toBe(2);
    first.rerender({ reject: true });
    act(() => client.update(23));
    expect(first.result.current).toMatchObject({
      status: 'terminal-error', stale: true, data: [{ label: 'North', value: 21 }, { label: 'South', value: 18 }],
      error: { code: 'RESULT_PROCESSING_FAILED' }, errorScope: 'query',
    });
    expect(first.result.current.error?.message).not.toContain('private');
    first.rerender({ reject: false });
    expect(first.result.current.data?.[0].value).toBe(23);
    const otherReads = client.reads.get('archive');
    client.failSnapshot('sensors', new DrasiError('SERVER_UNAVAILABLE'));
    await act(async () => { first.result.current.retry(); });
    expect(first.result.current).toMatchObject({ status: 'terminal-error', stale: true, errorScope: 'query' });
    expect(other.result.current).toMatchObject({ status: 'live', stale: false });
    expect(client.reads.get('archive')).toBe(otherReads);
    client.failSnapshot('sensors', null);
    await act(async () => { first.result.current.retry(); });
    expect(first.result.current.status).toBe('live');
    first.unmount();
    other.unmount();
    expect(client.activeListeners).toBe(0);
    client.dispose();
  });

  it('does not expose Server inspection through an ordinary data provider', () => {
    const client = new ContractClient();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useDrasiServerClient(), {
      wrapper: ({ children }) =>
        <DrasiClientProvider value={{ client, initialized: true, error: null, retry: vi.fn() }}>{children}</DrasiClientProvider>,
    })).toThrow('Server <DrasiProvider>');
    error.mockRestore();
    client.dispose();
  });

  it('shares state derivation without sharing subscriptions or retaining disposed listeners', async () => {
    const client = new ContractClient();
    let current: RawQueryState = initialQueryState();
    let lastGood: AcceptedQueryView<Reading> | null = null;
    const changed = vi.fn((state: RawQueryState) => { current = state; });
    const observation: QueryObservation = observeQuery(client, 'sensors', readingOptions.getKey, changed);
    await waitFor(() => expect(current.state.status).toBe('live'));
    const projection = projectQueryRows(current.rows, readingOptions);
    expect(projection.data).not.toBeNull();
    if (projection.data) lastGood = { data: projection.data, lastUpdate: current.lastUpdate };
    const failure = projectQueryRows(current.rows, {
      ...readingOptions, postProcess: () => { throw new Error('private transform details'); },
    });
    expect(queryView(current, failure, lastGood)).toMatchObject({ stale: true, status: 'terminal-error' });
    for (let i = 0; i < 1000; i++) client.update(i);
    expect(projectQueryRows(current.rows, readingOptions).data?.[0].value).toBe(999);
    observation.stop();
    const calls = changed.mock.calls.length;
    observation.stop();
    observation.retry();
    client.update(1001);
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(observation.getSnapshot()).toBe(current);
    expect(client.activeSubscriptions).toBe(0);
    expect(client.activeListeners).toBe(0);
    client.dispose();
  });
});
