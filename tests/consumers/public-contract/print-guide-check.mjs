import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderPrintGuide, printDiagram } from '../../../scripts/print-guide.mjs';

test('print edition preserves all chapters, figures, captions, source links and readable diagram alternatives', async () => {
  const html = await renderPrintGuide(fileURLToPath(new URL('../../../docs/react', import.meta.url)), 'a'.repeat(40));
  assert.equal((html.match(/<h3 id="\d+-/g) ?? []).length, 17);
  assert.equal((html.match(/<img /g) ?? []).length, 14);
  assert.equal((html.match(/<figcaption>/g) ?? []).length, 14);
  assert.equal((html.match(/class="diagram"/g) ?? []).length, 3);
  assert(html.indexOf('Subscribe to this query') < html.indexOf('GET current results'));
  assert(html.includes('white-space: pre-wrap'));
  assert(html.includes('overflow-wrap: anywhere'));
  assert(!html.includes('<script'));
  assert(!html.includes('<img src="http'));
  assert(html.includes('href="#reference-data-table"'));
  assert(html.includes('id="reference-data-table"'));
  assert(html.includes(`/blob/${'a'.repeat(40)}/packages/react/src/components/DataTable.md`));
  assert(html.includes('source-book-sha256'));
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const missing = [...html.matchAll(/\bhref="#([^"]+)"/g)].map(match => match[1]).filter(id => !ids.has(id));
  assert.deepEqual(missing, [], 'Offline/print links must resolve within the complete edition');
  assert.throws(() => printDiagram('unsupported\nstuff'), /explicit print alternative/);
});
