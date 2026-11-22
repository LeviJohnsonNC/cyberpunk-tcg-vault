import { expect, test, type Locator, type Page } from '@playwright/test';

async function openTable(page: Page, position: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://**/*', route => route.abort());
  await page.goto('/campaign-preview.html?decisions');
  await page.getByRole('combobox', { name: 'Position' }).click();
  await page.getByRole('option', { name: position, exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}

async function bounds(element: Locator) {
  await expect(element).toBeVisible();
  return (await element.boundingBox())!;
}

test('hand art waits for intent, swaps immediately and leaves the original cards clickable', async ({ page }) => {
  await openTable(page, 'Gig die');
  const hand = page.locator('.play-hand');
  const cards = hand.locator('.play-card');
  const first = cards.first(), second = cards.nth(1);
  const source = await bounds(first);
  const command = await bounds(page.locator('.play-command'));
  const lane = await bounds(hand);
  const art = page.locator('.play-art-preview');
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));

  await first.hover();
  await page.clock.runFor(249);
  await expect(art).toHaveCount(0);
  await page.clock.runFor(1);
  const preview = await bounds(art);
  expect(preview.width).toBeGreaterThan(source.width * 1.5);
  expect(preview.y).toBeGreaterThanOrEqual(command.y + command.height);
  expect(preview.y + preview.height).toBeCloseTo(source.y + source.height, 0);
  expect(preview.x).toBeGreaterThanOrEqual(lane.x);
  expect(preview.width / preview.height).toBeCloseTo(5 / 7);
  expect(await bounds(first)).toEqual(source);
  expect(await art.locator('.card-art').evaluate(node => getComputedStyle(node).transform)).toBe('none');

  await page.mouse.move(preview.x + preview.width / 2, preview.y + 12);
  await page.clock.runFor(120);
  await expect(art).toBeVisible();

  const secondName = await second.getAttribute('aria-label');
  await second.hover();
  await expect(art).toContainText(secondName!);
  await page.keyboard.press('i');
  await expect(page.getByRole('dialog', { name: secondName! })).toBeVisible();
  await page.keyboard.press('Escape');
  await first.click();
  await expect(page.getByRole('dialog', { name: /^Actions for/ })).toBeVisible();
  await expect(art).toHaveCount(0);
});

test('keyboard focus opens the art immediately and Escape preserves the chosen die', async ({ page }) => {
  await openTable(page, 'Gig die');
  const die = page.getByRole('button', { name: 'Roll d12', exact: true }).last();
  await die.click();
  const hand = page.locator('.play-hand');
  await hand.locator('.play-details').first().focus();
  await page.keyboard.press('Tab');
  const focused = hand.locator('.play-card').nth(1);
  await expect(focused).toBeFocused();
  await expect(page.locator('.play-art-preview[data-keyboard]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.play-art-preview')).toHaveCount(0);
  await expect(die).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('i');
  await expect(page.locator('dialog.play-inspect')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(focused).toBeFocused();
});

test('field art stays beside its source and clear of the command and other targets', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openTable(page, 'Target effect');
  const target = page.locator('.play-field[data-seat="rival"] .play-card[data-target="true"]').first();
  await target.hover();
  const source = await bounds(target);
  const preview = await bounds(page.locator('.play-art-preview'));
  expect(preview.x >= source.x + source.width || preview.x + preview.width <= source.x).toBe(true);
  const obstacles = page.locator('.play-command, .play-gigs .play-die, .play-hand .play-card, [data-target="true"]');
  for (const item of await obstacles.all()) {
    const box = await item.boundingBox();
    if (box) expect(preview.x + preview.width <= box.x || preview.x >= box.x + box.width ||
      preview.y + preview.height <= box.y || preview.y >= box.y + box.height).toBe(true);
  }
  await target.click();
  await expect(page.locator('.play-art-preview')).toHaveCount(0);
  await expect(target).toHaveAttribute('aria-pressed', 'true');
});

test('dragging a hand card dismisses the art and activates its original drag handle', async ({ page }) => {
  await openTable(page, 'Main turn');
  const card = page.locator('.play-hand .play-card[data-draggable="true"]').first();
  await card.hover();
  const art = page.locator('.play-art-preview');
  await expect(art).toBeVisible();
  const box = await bounds(card);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 6 });
  await expect(art).toHaveCount(0);
  await expect(page.locator('.play-drag-ghost[data-kind="card"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.play-drag-ghost')).toHaveCount(0);
});

test('a crowded hand still opens full inspection when the close-up has no safe space', async ({ page }) => {
  await openTable(page, 'Target effect');
  const card = page.locator('.play-hand .play-card').nth(1);
  await page.clock.install();
  await card.hover();
  await page.clock.runFor(300);
  await expect(page.locator('.play-art-preview')).toHaveCount(0);
  await page.keyboard.press('i');
  await expect(page.locator('dialog.play-inspect')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.play-hand .play-details').nth(1).click();
  await expect(page.locator('dialog.play-inspect')).toBeVisible();
});
