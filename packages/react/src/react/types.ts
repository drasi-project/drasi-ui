// Copyright 2026 The Drasi Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

import type { QueryProjectionOptions, QueryView, ResultRow } from '@drasi/ui-core';

/** Identity precedes projection. A generic alone never validates a wire row. */
export type UseDrasiQueryOptions<T extends object = ResultRow> = QueryProjectionOptions<T>;

/** Best-effort data and explicit recovery state, not an atomic server snapshot. */
export interface UseDrasiQueryResult<T extends object = ResultRow> extends QueryView<T> {
  /** Query-local REST refresh; use useDrasiClient().retry for a shared connection failure. */
  retry: () => void;
}
