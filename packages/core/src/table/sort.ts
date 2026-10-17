// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
export interface SortConfig {
  column: string;
  direction: 'asc' | 'desc';
}

const textOrder = new Intl.Collator('en-US', { sensitivity: 'variant', numeric: false });

/** Numbers, then fixed-English text representations, then nullish values. */
export function compareTableValues(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (typeof a === 'number') {
    if (typeof b !== 'number') return -1;
    if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1;
    if (Number.isNaN(b)) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof b === 'number') return 1;
  return textOrder.compare(String(a), String(b));
}

/** Stable derived order, without mutating input or removing raw identities. */
export function sortTableRows<T extends object>(
  rows: readonly T[] | null,
  sort: SortConfig | null,
): readonly T[] | null {
  if (rows === null || !sort) return rows;
  return [...rows].sort((a, b) => {
    const comparison = compareTableValues(Reflect.get(a, sort.column), Reflect.get(b, sort.column));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

export function nextTableSort(sort: SortConfig | null, column: string): SortConfig {
  return { column, direction: sort?.column === column && sort.direction === 'asc' ? 'desc' : 'asc' };
}
