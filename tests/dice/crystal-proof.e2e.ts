import { test, expect } from '@playwright/test';

test('crystal proof renders and responds to the inspection angle without script or shader errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|webgl|three/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/campaign-preview.html?dice-proof');
  await expect(page.locator('[data-renderer="webgl"]')).toHaveCount(2);
  const canvas = page.locator('[data-seat="player"] > .crystal-proof-webgl');
  await canvas.scrollIntoViewIfNeeded();
  const before = await canvas.screenshot();
  await page.getByRole('slider', { name: 'Inspect angle' }).focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  expect(errors).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Rotate dice', exact: true }).click();
  const still = await canvas.screenshot();
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(still)).toBe(true);
});

test('WebGL failure and context loss keep the d20 result visible as artwork', async ({ page }) => {
  await page.goto('/campaign-preview.html?dice-proof');
  await expect(page.locator('[data-renderer="webgl"]')).toHaveCount(2);
  await page.locator('[data-seat="player"] > .crystal-proof-webgl').evaluate(canvas => {
    (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.locator('[data-seat="player"][data-renderer="fallback"]')).toBeVisible();
  await expect(page.getByRole('img', { name: 'player crystal d20, result 20', exact: true })).toBeVisible();

  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
      return contextId.includes('webgl') ? null : Reflect.apply(getContext, this, [contextId, ...args]);
    } as typeof getContext;
  });
  await page.reload();
  await expect(page.locator('[data-renderer="fallback"]')).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'rival crystal d20, result 20', exact: true })).toBeVisible();
});
