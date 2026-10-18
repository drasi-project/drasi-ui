import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderPrintGuide, printDiagram } from '../print-guide.mjs';

test('print edition preserves all chapters, figures, captions, source links and readable diagram alternatives', async () => {
  const html = await renderPrintGuide(fileURLToPath(new URL('../../packages/react', import.meta.url)), 'a'.repeat(40));
  assert.equal((html.match(/<h3 id="\d+-/g) ?? []).length, 17);
  assert.equal((html.match(/<img /g) ?? []).length, 14);
  assert.equal((html.match(/<figcaption>/g) ?? []).length, 14);
  assert.equal((html.match(/class="diagram"/g) ?? []).length, 3);
  assert(html.indexOf('Subscribe to this query') < html.indexOf('GET current results'));
  assert(html.includes('white-space: pre-wrap'));
  assert(html.includes('overflow-wrap: anywhere'));
  assert(!html.includes('<script'));
  assert(!html.includes('<img src="http'));
  assert(html.includes(`/blob/${'a'.repeat(40)}/packages/react/docs/reference/`));
  assert(html.includes('source-book-sha256'));
  assert.throws(() => printDiagram('unsupported\nstuff'), /explicit print alternative/);
});
