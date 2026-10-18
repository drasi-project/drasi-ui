// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import { SSEClient, type SSEClientOptions } from '../../client/SSEClient';
import type { ResultAdapter } from '../../client/types';
import { sse034ResultAdapter } from './results';

export interface DrasiSSEClientOptions extends Omit<SSEClientOptions, 'resultAdapter'> {
  /** Default is the strict untemplated SSE 0.3.4 contract, not template inference. */
  resultAdapter?: ResultAdapter;
}

/** Optional Server wire default; all transport/lifecycle behavior is shared with SSEClient. */
export class DrasiSSEClient extends SSEClient {
  constructor(options: DrasiSSEClientOptions = {}) {
    super({ ...options, resultAdapter: options.resultAdapter ?? sse034ResultAdapter });
  }
}
