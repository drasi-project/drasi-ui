// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { marked, Renderer } from 'marked';
import { markdownAnchors } from '../tests/consumers/public-contract/documentation-links.mjs';
import { guideFigures } from './guide-assets.mjs';

const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const table = (headings, rows) => `<table class="diagram"><thead><tr>${headings.map(value =>
  `<th>${escape(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row =>
  `<tr>${row.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** Text-first print alternatives are derived from the canonical Mermaid, not authored separately. */
export function printDiagram(source) {
  const lines = source.trim().split('\n').map(line => line.trim()).filter(Boolean);
  const kind = lines.shift();
  if (kind === 'flowchart LR') {
    const labels = new Map([...source.matchAll(/(\w+)\["([^"]+)"\]/g)].map(match => [match[1], match[2]]));
    return table(['From', 'To'], lines.map(line => {
      const match = /^(\w+)(?:\["[^"]*"\])?\s*-->\s*(\w+)(?:\["[^"]*"\])?$/.exec(line);
      assert(match, `Unsupported print flow: ${line}`);
      return [labels.get(match[1]) ?? match[1], labels.get(match[2]) ?? match[2]];
    }));
  }
  if (kind === 'stateDiagram-v2') {
    return table(['From state', 'Transition', 'To state'], lines.map(line => {
      const match = /^([\w[\]*]+)\s*-->\s*([\w[\]*]+)(?::\s*(.*))?$/.exec(line);
      assert(match, `Unsupported print transition: ${line}`);
      return [match[1].replaceAll('_', '-'), match[3] ?? 'Start', match[2].replaceAll('_', '-')];
    }));
  }
  assert.equal(kind, 'sequenceDiagram', 'Add an explicit print alternative for this diagram syntax');
  const participants = new Map(), rows = [];
  for (const line of lines) {
    const participant = /^participant (\w+) as (.+)$/.exec(line);
    if (participant) { participants.set(participant[1], participant[2]); continue; }
    const message = /^(\w+)-{1,2}>>(\w+): (.+)$/.exec(line);
    if (message) {
      rows.push([participants.get(message[1]), participants.get(message[2]), message[3]]);
      continue;
    }
    const note = /^Note over (\w+): (.+)$/.exec(line);
    if (note) { rows.push([participants.get(note[1]), 'Note', note[2]]); continue; }
    const branch = /^(alt|else) (.+)$/.exec(line);
    if (branch) { rows.push(['Alternative', branch[1], branch[2]]); continue; }
    assert.equal(line, 'end', `Unsupported print sequence: ${line}`);
  }
  return table(['Sender / condition', 'Receiver / branch', 'Action in order'], rows);
}

export async function renderPrintGuide(packageRoot, source) {
  assert(/^[a-f0-9]{40}$/.test(source), 'Printable references require an exact source commit');
  const book = await readFile(resolve(packageRoot, 'docs/developer-guide/README.md'), 'utf8');
  const images = new Map();
  for (const name of guideFigures) {
    const bytes = await readFile(resolve(packageRoot, 'docs/developer-guide/figures', name));
    images.set(`figures/${name}`, `data:image/png;base64,${bytes.toString('base64')}`);
  }
  const renderer = new Renderer(), headings = new Map();
  renderer.heading = (text, depth, raw) => {
    const slug = [...markdownAnchors(`${'#'.repeat(depth)} ${raw}`)][0];
    const count = headings.get(slug) ?? 0;
    headings.set(slug, count + 1);
    return `<h${depth} id="${slug}${count ? `-${count}` : ''}">${text}</h${depth}>\n`;
  };
  renderer.code = (code, language) => language === 'mermaid'
    ? printDiagram(code)
    : `<pre><code>${escape(code)}</code></pre>\n`;
  renderer.html = html => {
    if (/^\s*<!--[\s\S]*-->\s*$/.test(html)) return '';
    assert(/^\s*(?:<a id="[a-z0-9-]+">|<\/a>|<a id="[a-z0-9-]+"><\/a>)\s*$/.test(html),
      'Unexpected raw HTML in printable book');
    return html;
  };
  renderer.image = (href, title, text) => {
    assert(images.has(href), `Only registered local figures may enter the print edition: ${href}`);
    const entities = { '&#39;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' };
    const alt = text.replace(/&#39;|&quot;|&lt;|&gt;|&amp;/g, entity => entities[entity]);
    return `<img src="${images.get(href)}" alt="${escape(alt)}"${title ? ` title="${escape(title)}"` : ''}>`;
  };
  renderer.link = (href, title, text) => {
    const target = href.startsWith('#') || /^https?:/.test(href) ? href
      : new URL(href, `https://github.com/drasi-project/drasi-ui/blob/${source}/packages/react/docs/developer-guide/`).href;
    assert(target.startsWith('#') || target.startsWith('https://'), 'Unsafe print link');
    return `<a href="${escape(target)}"${title ? ` title="${escape(title)}"` : ''}>${text}</a>`;
  };
  let inNotes = false;
  const markdown = book.split('\n').map(line => {
    const note = /^\[\^([a-z]+)\]: (.*)$/.exec(line);
    if (note) { inNotes = true; return `#### Source ${note[1]}\n\n${note[2]}`; }
    return inNotes ? line.replace(/^ {4}/, '') : line;
  }).join('\n').replace(/\[\^([a-z]+)\]/g, '[source $1](#source-$1)');
  let html = marked.parse(markdown, { renderer, gfm: true });
  html = html.replace(/<p>(<img[\s\S]*?>)<\/p>\s*<p><em>(Figure [\s\S]*?)<\/em><\/p>/g,
    '<figure>$1<figcaption>$2</figcaption></figure>');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="source-book-sha256" content="${createHash('sha256').update(book).digest('hex')}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'">
<title>The React developer guide - print edition</title><style>
@page { size: A4; margin: 16mm; }
body { max-width: 80ch; margin: 2rem auto; padding: 0 1rem; font: 11pt/1.45 system-ui,sans-serif; color: #111; background: white; }
h1,h2,h3,h4 { break-after: avoid; line-height: 1.2; }
h2 { margin-top: 2rem; } h3 { margin-top: 1.5rem; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 9pt; padding: .7rem; border: 1px solid #aaa; }
code { font-family: ui-monospace,monospace; overflow-wrap: anywhere; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 1rem 0; }
th,td { border: 1px solid #aaa; padding: .4rem; text-align: left; overflow-wrap: anywhere; }
tr { break-inside: avoid; } thead { display: table-header-group; }
figure { margin: 1rem 0; break-inside: avoid; } figcaption { font-size: 9pt; }
img { display: block; max-width: 100%; max-height: 180mm; object-fit: contain; margin: auto; }
a { color: #164d88; overflow-wrap: anywhere; }
@media print { body { margin: 0; padding: 0; max-width: none; } h2 { break-before: page; }
  #source-notes ~ p a[href^="https://"]::after { content: " (" attr(href) ")"; font-size: 8pt; } }
</style></head><body>${html}</body></html>\n`;
}

if (import.meta.main) {
  assert(process.argv.length <= 3, 'Usage: print-guide.mjs [OUTPUT_HTML]');
  const output = resolve(process.argv[2] ?? '.artifacts/react-developer-guide.html');
  await mkdir(dirname(output), { recursive: true });
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await writeFile(output, await renderPrintGuide(resolve('packages/react'), source));
  console.log(`Printable, offline book: ${output}`);
}
