// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
export type AnimationDirection = 'up' | 'down' | 'change' | null;

export interface RowAnimationState {
  animations: Map<string, AnimationDirection>;
  revisions: Map<string, number>;
  nextRevision: number;
}

/** Pure bookkeeping; timers, media queries and DOM animation ownership stay in the binding. */
export function trackRowChanges<T>(
  data: readonly T[],
  previous: ReadonlyMap<string, number | string>,
  rowKey: (row: T) => string,
  getValue: (row: T) => number | string | undefined,
  reducedMotion: boolean,
) {
  const values = new Map<string, number | string>();
  const keys = new Set<string>();
  const changes = new Map<string, AnimationDirection>();
  for (const row of data) {
    const key = rowKey(row);
    keys.add(key);
    const value = getValue(row);
    const before = previous.get(key);
    if (value !== undefined) values.set(key, value);
    if (!reducedMotion && value !== undefined && before !== undefined && value !== before) {
      changes.set(key, typeof value === 'number' && typeof before === 'number'
        ? value > before ? 'up' : 'down'
        : 'change');
    }
  }
  return { values, keys, changes };
}

/** Revisions identify decoration restarts, never row identity. */
export function mergeRowAnimations(
  previous: RowAnimationState,
  keys: ReadonlySet<string>,
  changes: ReadonlyMap<string, AnimationDirection>,
): RowAnimationState {
  const animations = new Map([...previous.animations].filter(([key]) => keys.has(key)));
  if (changes.size === 0 && animations.size === previous.animations.size) return previous;
  const revisions = new Map([...previous.revisions].filter(([key]) => keys.has(key)));
  for (const [key, value] of changes) {
    animations.set(key, value);
    revisions.set(key, previous.nextRevision);
  }
  return { animations, revisions, nextRevision: previous.nextRevision + (changes.size > 0 ? 1 : 0) };
}
