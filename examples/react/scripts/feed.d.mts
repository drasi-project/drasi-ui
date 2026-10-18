// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
export type ProbeReading =
  | { id: 'north-probe'; probeId: 'probe-1001'; room: 'North'; temperatureC: number }
  | { id: 'south-probe'; probeId: 'probe-2001'; room: 'South'; temperatureC: number }
  | { id: 'north-spare'; probeId: 'probe-1002'; room: 'North'; temperatureC: number }
  | { id: 'south-spare'; probeId: 'probe-2002'; room: 'South'; temperatureC: number };
export type FeedOperation = 'insert' | 'update' | 'delete';
export const probes: readonly [
  Extract<ProbeReading, { id: 'north-probe' }>,
  Extract<ProbeReading, { id: 'south-probe' }>,
  Extract<ProbeReading, { id: 'north-spare' }>,
  Extract<ProbeReading, { id: 'south-spare' }>,
];
export function sendReading(
  endpoint: string, probe: ProbeReading, operation?: FeedOperation,
): Promise<void>;
