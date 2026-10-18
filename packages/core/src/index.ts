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

/**
 * Framework-neutral data contracts, state and explicit transport ownership.
 * Server resource and wire contracts are available only through the adapter.
 */

export { DrasiError, asDrasiError, isAbortError } from './client/errors';
export type { DrasiErrorCode, DrasiErrorDetails, DrasiResourceKind } from './client/errors';
export { SSEClient } from './client/SSEClient';
export type {
  SSEClientOptions,
  EventSourceFactory,
  EventSourceLike,
} from './client/SSEClient';
export type * from './client/types';
export { readAdaptedResults } from './query/results';
export { accumulateResult } from './query/accumulation';
export { subscribeToQuery } from './query/subscription';
export type { SubscriptionOptions } from './query/subscription';
export { initialQueryState, retainQueryBaseline, observeQuery, projectQueryRows, queryView } from './query/state';
export type {
  RawQueryState, QueryObservation, QueryProjectionOptions, QueryProjection, QueryView, AcceptedQueryView,
} from './query/state';
export { compareTableValues, sortTableRows, nextTableSort } from './table/sort';
export type { SortConfig } from './table/sort';
export { trackRowChanges, mergeRowAnimations } from './table/animation';
export type { AnimationDirection, RowAnimationState } from './table/animation';
