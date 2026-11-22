import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  // Deterministic offline artwork: exercise the supported missing-art state.
  await page.route('https://**/*', (route) => route.abort());
});

test('skip navigation preserves the route and focus remains visible in forced colors', async ({ page }) => {
  await page.goto('/#/prices');
  await expect(page).toHaveTitle('Price Book · Cyberpunk TCG Vault');
  await expect(page.locator('main h1:visible')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await page.emulateMedia({ forcedColors: 'active' });
  expect(await skip.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page).toHaveURL(/#\/prices$/);
  await page.evaluate(() => { location.hash = '/meta'; });
  await expect(page).toHaveTitle('Meta Intel · Cyberpunk TCG Vault');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('main h1:visible')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveTitle('Price Book · Cyberpunk TCG Vault');
  await expect(page.locator('main')).toBeFocused();
});

test('empty screens have accessible controls and fit the viewport', async ({ page }) => {
  for (const route of ['collection', 'prices', 'builder', 'meta', 'add', 'about', 'upgrade', 'shared']) {
    await page.goto(`/#/${route}`);
    await expect(page.locator('main h1:visible')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('phone navigation recovers when the keyboard or a modal closes', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The bottom navigation is only rendered on phones');
  await page.goto('/#/collection');
  await page.getByRole('button', { name: 'Browse the full catalog' }).click();
  const nav = page.locator('.vault-mobile-nav');
  const search = page.getByRole('searchbox', { name: 'Search cards' });
  await search.fill('Jackie');
  await expect(nav).toBeVisible();

  // Browser emulation can focus a field but has no OS keyboard. Simulate its viewport changes.
  const resizeVisibleArea = (heightLost: number, scale = 1) => page.evaluate(({ heightLost, scale }) => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: (window.innerHeight - heightLost) / scale },
      scale: { configurable: true, value: scale },
    });
    viewport.dispatchEvent(new Event('resize'));
  }, { heightLost, scale });

  await resizeVisibleArea(295);
  await expect(nav).toBeHidden();
  await resizeVisibleArea(50, 1.5);
  await expect(nav).toBeVisible();
  await expect(search).toBeFocused();
  await resizeVisibleArea(295, 1.5);
  await expect(nav).toBeHidden();
  await resizeVisibleArea(0);
  await expect(nav).toBeVisible();
  await expect(search).toBeFocused();

  // A modal can restore focus to the prior field when its trigger didn't take focus.
  await page.getByRole('button', { name: 'Filters', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Close filters' }).click();
  await expect(search).toBeFocused();
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Prices' }).click();
  await expect(page).toHaveTitle('Price Book · Cyberpunk TCG Vault');
  await expect(nav).toBeVisible();
});

test('Play fits in the phone footer and stays selected through Campaign and Back', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The footer is a phone navigation surface.');
  await page.goto('/#/prices');
  const footer = page.locator('.vault-mobile-nav');
  const play = footer.getByRole('link', { name: 'Play', exact: true });
  await expect(play).toHaveAttribute('href', '#/play');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await footer.getByRole('link').evaluateAll(links => links.map(link => {
      const { top, width, height } = link.getBoundingClientRect();
      return { top, width, height };
    }));
    expect(boxes).toHaveLength(6);
    expect(boxes.every(box => box.top === boxes[0].top && box.width >= 44 && box.height >= 44)).toBe(true);
  }
  await play.tap();
  await expect(play).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: /Campaign.*Begin story/i }).tap();
  await expect(page).toHaveURL(/#\/play\?mode=campaign$/);
  await expect(play).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/#\/play$/);
  await page.goBack();
  await expect(footer.getByRole('link', { name: 'Prices' })).toHaveAttribute('aria-current', 'page');
  await expect(play).not.toHaveAttribute('aria-current');
});

test('sample vault builds in a worker and opens an inspectable card', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('main h1:visible')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty-vault.png') });
  await page.getByRole('button', { name: 'Explore the sample Vault' }).click();
  await expect(page.locator('.binder-pocket').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sample-vault.png') });
  const first = page.locator('.binder-open').first();
  await first.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  const worker = page.waitForEvent('worker');
  await page.evaluate(() => { location.hash = '/meta'; });
  expect((await worker).url()).toContain('deck.worker');
  await expect(page.getByRole('button', { name: /^Open draft/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Open draft/ }).click();
  await expect(page).toHaveTitle('Deck Builder · Cyberpunk TCG Vault');
  await expect(page.locator('main h1:visible')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('planner uses a worker, recalculates budgets, and keeps inputs responsive', async ({ page }) => {
  const worker = page.waitForEvent('worker');
  await page.goto('/#/upgrade');
  expect((await worker).url()).toContain('deck.worker');
  await expect(page.getByRole('region', { name: 'Starting point' })).toBeVisible();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  const budget = page.getByRole('spinbutton', { name: /Custom budget/ });
  await budget.fill('25');
  await budget.fill('10');
  await expect(budget).toHaveValue('10');
  await expect(page.getByRole('status').filter({ hasText: 'Finding upgrades' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Starting point' })).toContainText('$10');
  await page.getByText('Lock cards (keep a card at its current count)', { exact: true }).click();
  const lock = page.locator('button.up-lock').first();
  await lock.click();
  await expect(lock).toBeFocused();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Starting point' })).toBeVisible();
  await expect(lock).toBeFocused();
});

test('a failed calculation can retry without exposing stale suggestions', async ({ page }) => {
  let blocked = true;
  await page.route('**/deck.worker-*.js', (route) => blocked ? route.abort() : route.continue());
  await page.goto('/#/upgrade');
  await expect(page.getByRole('alert')).toContainText('Could not calculate suggestions');
  await expect(page.getByRole('region', { name: 'Starting point' })).toHaveCount(0);
  blocked = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Starting point' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
