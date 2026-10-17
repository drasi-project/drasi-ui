import { test, expect } from '@playwright/test';
import { contractScenarios } from '../contracts/scenarios';
import { audit } from './axeAudit';

test('shared non-Server snapshot/update/delete/projection/stale/retry/scope/disposal contract', async ({ page, request }, info) => {
  const diagnostics: string[] = [];
  page.on('pageerror', error => diagnostics.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  if (info.project.metadata.kind === 'next') {
    const response = await request.get('/');
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain('Server-rendered route with a package client boundary');
    expect(html).toContain('initial-loading');
  }
  await page.goto('/');
  for (const step of contractScenarios) {
    if (step.action) await page.getByRole('button', { name: step.action, exact: true }).click();
    await expect.poll(async () => JSON.parse(await page.getByTestId('query-state').innerText())).toMatchObject({
      status: step.status, stale: step.stale, values: [...step.values],
    });
  }
  const card = page.locator('.drasi-query-table').first();
  await expect(card).toHaveCSS('height', '400px');
  await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(card).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.locator('main').evaluate(element => { element.dir = 'rtl'; });
  await expect(card).toHaveCSS('direction', 'rtl');
  await audit(page, info, 'native-framework-dark-rtl');
  await page.getByRole('button', { name: 'Dispose', exact: true }).click();
  await expect(page.getByRole('status', { name: '' })).toContainText('Disposed');
  await expect(page.getByTestId('subscriptions')).toHaveText('0');
  expect(diagnostics).toEqual([]);
  info.annotations.push({
    type: 'qualification-boundary',
    description: 'Real installed framework/runtime and shared core behavior; not a live Server or human screen-reader acceptance.',
  });
});
