import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

test('an interrupted Play Mode download retries on the campaign route', async ({ page }) => {
  await page.goto('/#/collection');
  await expect(page.locator('main h1')).toBeVisible();
  // The preload and import can issue separate requests. Let both fail until
  // Vite reports the failed import, then allow the retry to fetch the real file.
  await page.evaluate(() => {
    window.addEventListener('vite:preloadError', () => { document.body.dataset.interrupted = 'true'; }, { once: true });
  });
  await page.route('**/assets/PlayMode-*.js', async route => {
    if (await page.locator('body').getAttribute('data-interrupted')) await route.continue();
    else await route.fulfill({ status: 404, body: 'Missing chunk' });
  });
  await page.evaluate(() => { location.hash = '/play?mode=campaign'; });
  await expect(page.getByRole('heading', { name: 'Last Call.' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-interrupted', 'true');
});

test('an unavailable screen keeps navigation usable and can be reloaded', async ({ page }) => {
  const asset = '**/assets/PriceBook-*.css';
  await page.route(asset, route => route.fulfill({ status: 404, body: 'Missing stylesheet' }));
  await page.goto('/#/prices');
  await expect(page.getByRole('alert')).toHaveText('Price Book couldn’t open.');
  await page.getByRole('link', { name: 'Cyberpunk TCG Vault home' }).click();
  await expect(page.locator('main h1:visible')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Reload screen' })).toBeVisible();
  await page.unroute(asset);
  await page.getByRole('button', { name: 'Reload screen' }).click();
  await expect(page.locator('main h1:visible')).toHaveText(/Price\s*Book/i);
});

test('campaign opens and restores a saved table when the window regains focus', async ({ page, isMobile }, testInfo) => {
  await page.goto('/#/play');
  await page.getByRole('link', { name: /Campaign.*Begin story/ }).click();
  await page.getByRole('button', { name: 'Choose your crew' }).click();
  await page.getByRole('button', { name: 'Start with The Heist' }).click();
  const launch = page.getByRole('button', { name: 'Take the contract' });
  // A failed worker download must allow another launch from the same board.
  const engine = '**/assets/campaign.worker-*.js';
  await page.route(engine, route => route.abort());
  await launch.click();
  await expect(page.getByRole('alert')).toContainText('campaign engine stopped');
  await page.unroute(engine);
  await launch.click();
  const table = page.locator(isMobile ? '.phone-table[data-match-id]' : '.play-grid[data-match-id]');
  await expect(table).toBeVisible();
  const matchId = await table.getAttribute('data-match-id');
  await page.getByRole('link', { name: 'Cyberpunk TCG Vault home' }).click();
  await expect(page.locator('main h1')).toBeVisible();
  await page.evaluate(() => {
    // Fire focus while the initial IndexedDB read is in flight, before its
    // completion handler can decide whether to reopen the saved table.
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (args[0] === 'campaigns') {
        IDBDatabase.prototype.transaction = transaction;
        queueMicrotask(() => window.dispatchEvent(new Event('focus')));
      }
      return tx;
    };
    location.hash = '/play?mode=campaign';
  });
  await expect(table).toHaveAttribute('data-match-id', matchId!);
  await expect(table.locator(isMobile ? '.phone-command' : '.play-command-inner')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('restored-campaign-table.png') });
  const skip = page.getByRole('button', { name: /Skip intro/i });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: 'Ask Coach' }).click();
  await expect(page.getByRole('dialog', { name: 'Your turn plan' }).getByRole('heading', { name: 'Play now' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to table' }).click();
  await expect(table).toHaveAttribute('data-match-id', matchId!);
  if (isMobile) {
    const stateId = await table.getAttribute('data-state-id');
    await page.getByRole('button', { name: 'All actions' }).tap();
    await page.getByRole('button', { name: 'Campaign board' }).tap();
    await page.getByRole('button', { name: 'Return to match' }).tap();
    await expect(table).toHaveAttribute('data-state-id', stateId!);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(table).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(table).toHaveAttribute('data-match-id', matchId!);
    await expect(table).toHaveAttribute('data-state-id', stateId!);
  }
});
