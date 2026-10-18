// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../src/Shell';

function navigation(showcaseOnly = false) {
  const html = renderToStaticMarkup(createElement(Shell, {
    title: 'Navigation contract', showcaseOnly, children: null,
  }));
  const nav = /<nav aria-label="Examples">([\s\S]*?)<\/nav>/.exec(html)?.[1];
  assert(nav);
  return { html: nav, links: [...nav.matchAll(/href="([^"]+)"/g)].map(match => match[1]) };
}

test('full-example navigation stays within root or nested deployments and names existing pages', async () => {
  const { links } = navigation();
  assert.deepEqual(links, ['./', './query-table.html', './hooks.html', './showcase.html']);
  for (const base of ['https://example.invalid/', 'https://example.invalid/drasi-ui/']) {
    for (const page of ['index.html', 'query-table.html', 'hooks.html', 'showcase.html']) {
      for (const href of links) {
        const destination = new URL(href, new URL(page, base));
        assert(destination.href.startsWith(base), `${page} escaped ${base}`);
        const filename = destination.pathname.slice(new URL(base).pathname.length) || 'index.html';
        await access(new URL(`../${filename}`, import.meta.url));
      }
    }
  }
});

test('static navigation links only its exported entry without backend destinations', () => {
  const { html, links } = navigation(true);
  assert.deepEqual(links, ['./']);
  assert.doesNotMatch(html, /query-table\.html|hooks\.html|showcase\.html|>Live table</);
  for (const base of ['https://example.invalid/', 'https://example.invalid/drasi-ui/']) {
    for (const page of ['', 'index.html']) assert.equal(new URL(links[0], base + page).href, base);
  }
});
