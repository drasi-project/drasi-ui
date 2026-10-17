// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import { computed, createApp, defineComponent, h, onUnmounted, ref, shallowRef, watch } from 'vue';
import {
  initialQueryState, nextTableSort, observeQuery, projectQueryRows, queryView, sortTableRows, trackRowChanges,
  type AcceptedQueryView, type AnimationDirection, type QueryObservation, type SortConfig,
} from '@drasi/ui-core';
import { ContractClient, darkTheme, readingOptions, type Reading } from '../.generated/host';
import '@drasi/ui-styles/styles.css';

const Canary = defineComponent({
  setup() {
    const client = shallowRef(new ContractClient());
    const queryId = ref('sensors');
    const reject = ref(false);
    const disposed = ref(false);
    const dark = ref(false);
    const sort = shallowRef<SortConfig | null>(null);
    const raw = shallowRef(initialQueryState());
    const lastGood = shallowRef<AcceptedQueryView<Reading> | null>(null);
    const animations = shallowRef(new Map<string, AnimationDirection>());
    let values = new Map<string, number | string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observation: QueryObservation | null = null;
    const stop = watch([client, queryId], ([current, id], _previous, cleanup) => {
      raw.value = initialQueryState();
      lastGood.value = null;
      values = new Map();
      observation = observeQuery(current, id, readingOptions.getKey, state => { raw.value = state; });
      const owned = observation;
      cleanup(() => owned.stop());
    }, { immediate: true, flush: 'sync' });
    const projection = computed(() => projectQueryRows(raw.value.rows, {
      ...readingOptions,
      transform: reject.value ? () => { throw new Error('Deliberately rejected projection'); } : readingOptions.transform,
    }, { resourceKind: 'query', resourceId: queryId.value }));
    watch([projection, () => raw.value.lastUpdate], ([next]) => {
      if (next.data !== null) lastGood.value = { data: next.data, lastUpdate: raw.value.lastUpdate };
    }, { flush: 'post' });
    const query = computed(() => queryView(raw.value, projection.value, lastGood.value));
    const sorted = computed(() => sortTableRows(query.value.data, sort.value));
    watch(() => query.value.data, rows => {
      if (rows === null) return;
      const tracked = trackRowChanges(rows, values, row => row.label, row => row.value,
        matchMedia('(prefers-reduced-motion: reduce)').matches);
      values = tracked.values;
      animations.value = tracked.changes;
      clearTimeout(timer);
      timer = setTimeout(() => { animations.value = new Map(); }, 500);
    });
    const dispose = () => {
      stop();
      observation?.stop();
      client.value.dispose();
      clearTimeout(timer);
      disposed.value = true;
    };
    onUnmounted(dispose);
    const actions: [string, () => void][] = [
      ['Update', () => client.value.update()],
      ['Sparse delete', () => client.value.sparseDelete()],
      ['Projection failure', () => { reject.value = true; }],
      ['Update while rejected', () => client.value.update(23)],
      ['Recover projection', () => { reject.value = false; }],
      ['Offline', () => client.value.offline()],
      ['Reconnect', () => client.value.reconnect()],
      ['Retry query', () => observation?.retry()],
      ['Empty query', () => client.value.empty(queryId.value)],
      ['Change query', () => { queryId.value = 'archive'; }],
      ['Replace connection', () => {
        const previous = client.value;
        client.value = new ContractClient(99);
        previous.dispose();
      }],
      ['Dispose', dispose],
    ];
    return () => h('main', { style: dark.value ? {
      ...darkTheme, color: darkTheme['--drasi-color-text'], background: darkTheme['--drasi-color-surface'],
    } : undefined }, [
      h('h1', 'Native Vue contract canary'),
      h('p', 'Simulated non-Server data. This is not the forthcoming public Vue control library.'),
      h('div', actions.map(([label, action]) => h('button', { type: 'button', onClick: action, disabled: disposed.value }, label))),
      h('button', { type: 'button', onClick: () => { dark.value = !dark.value; } }, 'Toggle theme'),
      disposed.value ? h('p', { role: 'status' }, 'Disposed') : h('section', [
        h('output', { 'data-testid': 'query-state', 'aria-label': 'Query state' }, JSON.stringify({
          status: query.value.status, stale: query.value.stale,
          values: query.value.data?.map(row => row.value) ?? [], error: query.value.error?.code ?? null,
        })),
        h('p', { role: 'status' }, `${query.value.stale ? 'Showing last known data. ' : ''}${query.value.status}`),
        query.value.error ? h('p', { role: 'alert' }, query.value.error.message) : null,
        h('div', { class: 'drasi-query-table' }, [
          h('div', { class: 'drasi-query-table__header' }, [h('h2', { class: 'drasi-query-table__title' }, 'Sensors')]),
          h('div', { class: 'drasi-query-table__scroll', role: 'region', tabindex: 0, 'aria-label': 'Sensors table viewport' }, [
            h('table', { class: 'drasi-query-table__table', 'aria-label': 'Sensors' }, [
              h('thead', { class: 'drasi-query-table__thead' }, [h('tr', ['label', 'value'].map(column =>
                h('th', {
                  scope: 'col', class: 'drasi-query-table__heading',
                  'aria-sort': sort.value?.column === column ? sort.value.direction === 'asc' ? 'ascending' : 'descending' : undefined,
                }, [h('button', {
                  type: 'button', class: 'drasi-query-table__sort-button',
                  onClick: () => { sort.value = nextTableSort(sort.value, column); },
                }, column === 'label' ? 'Station' : 'Reading')]),
              ))]),
              h('tbody', sorted.value?.map(row => h('tr', {
                key: row.label, class: ['drasi-query-table__row',
                  animations.value.get(row.label) ? `drasi-row--${animations.value.get(row.label)}` : ''],
              }, [h('td', { class: 'drasi-query-table__cell' }, row.label), h('td', { class: 'drasi-query-table__cell' }, String(row.value))]))),
            ]),
          ]),
        ]),
      ]),
      h('output', { 'data-testid': 'subscriptions', 'aria-label': 'Active subscriptions' }, String(client.value.activeSubscriptions)),
    ]);
  },
});

createApp(Canary).mount('#app');
