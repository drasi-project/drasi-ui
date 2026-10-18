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
 * `@drasi/react` — reusable React building blocks for UIs driven by Drasi
 * Continuous Queries.
 *
 * - {@link DrasiClientProvider}: binds an app-owned data client.
 * - {@link useDrasiQuery} and friends: subscribe to a query's live result set.
 * - {@link DataTable}: provider-free presentation, sorting and animation.
 * - {@link QueryTable}: a small live-query composition of that presentation.
 * - {@link Modal}: client-mounted accessible overlay ownership and portal theming.
 *
 * The public API is organized into three groups:
 * - `client`     — framework-neutral core compatibility exports.
 * - `react`      — data-only React bindings and hooks.
 * - `components` — presentation (`DataTable`, `QueryTable`, `Modal`, icons).
 * - `adapters/drasi-server` — explicit optional Server provider and inspection.
 */

export * from '@drasi/ui-core';
export * from './react';
export * from './components';
