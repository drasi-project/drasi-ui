import { test, expect, type Page } from '@playwright/test';
import { audit } from './axeAudit';

async function action(page: Page, action: string, queryId = 'north-room') {
  const response = await page.request.post('/__guide/action', { data: { action, queryId } });
  expect(response.ok()).toBe(true);
}
async function stats(page: Page): Promise<{ opens: number; streams: number; reads: Record<string, number> }> {
  const response = await page.request.get('/__guide/stats');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('the exact first-book app runs, changes a reading, sorts, resets, and respects motion', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cold storage', exact: true })).toBeVisible();
  const north = page.getByRole('row').filter({ hasText: 'probe-1001' });
  await expect(north).toContainText('3.0');
  await page.getByRole('button', { name: 'Warm North' }).click();
  await expect(north).toContainText('8.0');
  await expect(north).toContainText('Needs attention');
  await page.getByRole('button', { name: 'Temperature (C)', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toContainText('South');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Reset readings' }).click();
  await expect(north).toContainText('3.0');
  expect((await stats(page)).opens).toBe(0);
  await audit(page, info, 'literal-guide-first-screen');
  expect(errors).toEqual([]);
});

test('controlled sorting follows the literal sorting lesson and clears to input order', async ({ page }) => {
  await page.goto('/fixture/fixture.html?lesson=sorting');
  await expect(page.locator('tbody tr').first()).toContainText('9.0');
  await page.getByRole('button', { name: 'Warm North', exact: true }).click();
  await expect(page.locator('tbody tr').nth(1)).toContainText('probe-1001');
  await page.getByRole('button', { name: 'Reset readings', exact: true }).click();
  await page.getByRole('button', { name: 'Temperature (C)', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('tbody tr').first()).toContainText('3.0');
  await page.getByRole('button', { name: 'Input order', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toContainText('6.0');
  expect((await stats(page)).opens).toBe(0);
});

test('the backend-free dialog removal can be cancelled, reset, and unmounted before its timer fires', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window);
    let scheduled: number | undefined;
    window.setTimeout = (handler, timeout, ...args) => {
      const id = schedule(handler, timeout, ...args);
      if (timeout === 8000) scheduled = id;
      return id;
    };
    window.clearTimeout = id => {
      if (id === scheduled) {
        document.documentElement.dataset.lessonTimerCancelled = 'yes';
        scheduled = undefined;
      }
      cancel(id);
    };
  });
  await page.goto('/fixture/fixture.html?lesson=review');
  const probe = page.getByRole('row').filter({ hasText: 'probe-1001' });
  const schedule = page.getByRole('button', { name: 'Remove probe-1001 in 8 seconds', exact: true });
  for (const name of ['Cancel removal', 'Reset readings']) {
    await schedule.click();
    await expect(schedule).toBeDisabled();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-lesson-timer-cancelled', 'yes');
    await page.clock.fastForward(8100);
    await expect(probe).toContainText('3.0');
    await page.evaluate(() => { delete document.documentElement.dataset.lessonTimerCancelled; });
  }
  await schedule.click();
  await page.getByRole('button', { name: 'Unmount lesson', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-lesson-timer-cancelled', 'yes');
  await page.clock.fastForward(8100);
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('the book shares snapshots across cards/table, reprojects, and isolates retry and sparse deletes', async ({ page }) => {
  await page.goto('/fixture/fixture.html?lesson=failure');
  const north = page.getByRole('region', { name: 'North room', exact: true });
  const south = page.getByRole('region', { name: 'South room', exact: true });
  await expect(north.getByRole('status').filter({ hasText: 'Query: live' })).toBeVisible();
  await expect(south.getByRole('status').filter({ hasText: 'Query: live' })).toBeVisible();
  const baseline = await stats(page);
  expect(baseline.streams).toBe(1);
  expect(baseline.reads).toEqual({ 'north-room': 1, 'south-room': 1 });
  await north.getByLabel('Show warm probes only').check();
  await expect(north.getByRole('status').filter({ hasText: 'Query: empty' })).toBeVisible();
  expect((await stats(page)).reads).toEqual(baseline.reads);
  await action(page, 'warm');
  await expect(north.getByRole('list')).toContainText('8.0');
  await expect(north.getByRole('table')).toContainText('8.0');
  await page.getByLabel('Demonstrate a projection error (client only)').check();
  await expect(north.getByRole('alert')).toContainText('RESULT_PROCESSING_FAILED');
  await expect(north.getByRole('alert')).toContainText('last known');
  await expect(north.getByRole('table')).toContainText('8.0');
  await expect(south.getByRole('status').filter({ hasText: 'Query: live' })).toBeVisible();
  await expect(north.getByRole('button', { name: 'Retry query', exact: true })).toHaveCount(0);
  await page.getByLabel('Demonstrate a projection error (client only)').uncheck();
  await expect(north.getByRole('alert')).toHaveCount(0);
  await action(page, 'fail-query');
  await north.getByRole('button', { name: 'Refresh query', exact: true }).click();
  await expect(north.getByRole('alert')).toContainText('UNAUTHENTICATED');
  await expect(north.getByRole('button', { name: 'Retry query', exact: true })).toBeVisible();
  await action(page, 'repair-query');
  await north.getByRole('button', { name: 'Retry query', exact: true }).click();
  await expect(north.getByRole('alert')).toHaveCount(0);
  expect((await stats(page)).opens).toBe(baseline.opens);
  expect((await stats(page)).reads['south-room']).toBe(baseline.reads['south-room']);
  await action(page, 'delete');
  await expect(north.getByRole('table')).toContainText('No probes match this view');
  await expect(north.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unmount lesson', exact: true }).click();
  await expect.poll(async () => (await stats(page)).streams).toBe(0);
});

test('QueryTable uses the same literal model and app-owned client, without a Server superclass', async ({ page }) => {
  await page.goto('/fixture/fixture.html?lesson=query-table');
  const north = page.getByRole('table', { name: 'North room', exact: true });
  await expect(north).toContainText('3.0');
  await action(page, 'warm');
  await expect(north).toContainText('8.0');
  await action(page, 'delete');
  await expect(north.getByRole('row').filter({ hasText: 'probe-1001' })).toHaveCount(0);
  await expect(north).toContainText('6.0');
  expect((await stats(page)).streams).toBe(1);
});

test('the capstone keeps theme, focus and last-known state while owning connection replacement', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/fixture/fixture.html?lesson=capstone');
  const north = page.getByRole('table', { name: 'North room', exact: true });
  await expect(north).toContainText('3.0');
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await page.getByRole('button', { name: 'Right-to-left layout', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const opener = north.getByRole('row').filter({ hasText: 'probe-1001' }).getByRole('button', { name: 'Review probe' });
  // Match the book's keyboard exercise; WebKit pointer clicks need not focus buttons.
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close review' })).toBeFocused();
  await expect(dialog).toHaveCSS('background-color', 'rgb(15, 23, 42)');
  await expect(dialog).toHaveCSS('direction', 'rtl');
  await action(page, 'delete');
  await expect(dialog).toContainText('no longer in the current view');
  await expect(dialog.getByRole('button', { name: 'Record local review' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'North room', exact: true })).toBeFocused();
  await action(page, 'restore');
  await expect(north).toContainText('3.0');
  const baseline = await stats(page);
  await action(page, 'fail-stream');
  await expect(page.getByRole('button', { name: 'Retry connection', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'North room: terminal-error (last-known readings)' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry connection', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'North room: live' })).toBeVisible();
  await expect.poll(async () => (await stats(page)).streams).toBe(1);
  expect((await stats(page)).opens).toBe(baseline.opens + 1);
  await page.getByRole('button', { name: 'Replace owner' }).click();
  await expect(north).toContainText('3.0');
  await expect.poll(async () => (await stats(page)).streams).toBe(1);
  await audit(page, info, 'literal-guide-capstone-dark-rtl-narrow');
  await page.getByRole('button', { name: 'Unmount lesson' }).click();
  await expect.poll(async () => (await stats(page)).streams).toBe(0);
  expect(errors).toEqual([]);
  info.annotations.push({ type: 'qualification-boundary', description: 'Literal installed guide over a deterministic test gateway; not a real Drasi backend or human AT acceptance.' });
});
