import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { exportShowcase } from '../../scripts/export-showcase.mjs';
import { serveExample } from '../../examples/react/scripts/web.mjs';

for (const mount of ['/', '/drasi-ui/']) {
  test(`exported showcase navigation and assets work at ${mount} without backend destinations`, async ({ page, request }) => {
    const consumers = JSON.parse(await readFile('.artifacts/consumers.json', 'utf8'));
    const directory = await mkdtemp(join(tmpdir(), 'drasi-static-browser-'));
    const root = join(directory, 'site');
    await mkdir(root);
    const destination = mount === '/' ? join(root, 'export') : join(root, 'drasi-ui');
    let web: Awaited<ReturnType<typeof serveExample>> | undefined;
    try {
      await exportShowcase(consumers, destination);
      web = await serveExample({ dist: mount === '/' ? destination : root, port: 0 });
      const base = `${web.url}${mount}`;
      const requests: string[] = [];
      const errors: string[] = [];
      page.on('request', outgoing => requests.push(outgoing.url()));
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.route('**/*', route => route.request().url().startsWith(base)
        ? route.continue() : route.abort('blockedbyclient'));
      for (const entry of ['', 'index.html']) {
        await page.goto(base + entry);
        await expect(page.getByText('Simulation only.', { exact: true })).toBeVisible();
        const nav = page.getByRole('navigation', { name: 'Examples' });
        await expect(nav.getByRole('link')).toHaveCount(1);
        await expect(nav.getByRole('link', { name: 'Live table', exact: true })).toHaveCount(0);
        const simulation = nav.getByRole('link', { name: 'Simulated states' });
        expect(await simulation.evaluate(link => {
          if (!(link instanceof HTMLAnchorElement)) throw new Error('Expected a native navigation link');
          return link.href;
        })).toBe(base);
        await simulation.click();
        await expect(page).toHaveURL(base);
        await page.getByLabel('Simulated query state').selectOption('live');
        await expect(page.getByRole('table', { name: 'Simulated readings' })).toBeVisible();
        await page.getByRole('button', { name: 'Apply simulated update' }).click();
        await expect(page.getByRole('row').filter({ hasText: 'sim-probe-101' })).toContainText('4.0');
      }
      for (const missing of ['hooks.html', 'query-table.html', 'showcase.html']) {
        expect((await request.get(base + missing)).status()).toBe(404);
      }
      expect(requests.every(url => url.startsWith(base) && !/\/api\/|\/events(?:[/?]|$)/.test(url))).toBe(true);
      expect(requests.some(url => url.includes('/assets/'))).toBe(true);
      expect(web.requests).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await web?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test(`complete local examples keep all four navigation destinations within ${mount}`, async ({ page, request }) => {
    const consumers = JSON.parse(await readFile('.artifacts/consumers.json', 'utf8'));
    const directory = await mkdtemp(join(tmpdir(), 'drasi-example-navigation-'));
    const site = join(directory, 'site');
    const destination = mount === '/' ? site : join(site, 'drasi-ui');
    let web: Awaited<ReturnType<typeof serveExample>> | undefined;
    try {
      await cp(join(consumers.consumers.examples.directory, 'dist'), destination, { recursive: true });
      web = await serveExample({ dist: site, port: 0 });
      const base = `${web.url}${mount}`;
      await page.goto(base + 'showcase.html');
      const links = page.getByRole('navigation', { name: 'Examples' }).getByRole('link');
      await expect(links).toHaveText(['Live table', 'QueryTable', 'Hooks only', 'Simulated states']);
      const destinations = await links.evaluateAll(elements => elements.map(element => {
        if (!(element instanceof HTMLAnchorElement)) throw new Error('Expected a native navigation link');
        return element.href;
      }));
      expect(destinations).toEqual([base, base + 'query-table.html', base + 'hooks.html', base + 'showcase.html']);
      for (const url of destinations) expect((await request.get(url)).ok()).toBe(true);
      await links.filter({ hasText: 'Simulated states' }).click();
      await expect(page).toHaveURL(base + 'showcase.html');
      await expect(page.getByText('Simulation only.', { exact: true })).toBeVisible();
      expect(web.requests).toEqual([]);
    } finally {
      await web?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
