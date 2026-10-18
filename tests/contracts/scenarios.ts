// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
export const contractScenarios = [
  { action: null, status: 'live', stale: false, values: [21, 18] },
  { action: 'Update', status: 'live', stale: false, values: [22, 18] },
  { action: 'Sparse delete', status: 'live', stale: false, values: [22] },
  { action: 'Projection failure', status: 'terminal-error', stale: true, values: [22] },
  { action: 'Update while rejected', status: 'terminal-error', stale: true, values: [22] },
  { action: 'Recover projection', status: 'live', stale: false, values: [23] },
  { action: 'Offline', status: 'reconnecting', stale: true, values: [23] },
  { action: 'Reconnect', status: 'live', stale: false, values: [23] },
  { action: 'Retry query', status: 'live', stale: false, values: [23] },
  { action: 'Empty query', status: 'empty', stale: false, values: [] },
  { action: 'Change query', status: 'live', stale: false, values: [5] },
  { action: 'Replace connection', status: 'live', stale: false, values: [99] },
] as const;
