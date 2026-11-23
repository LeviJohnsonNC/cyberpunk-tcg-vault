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

test('the opening spread shows six priced cards, supports inspection and keeps the same cards in the fan', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openTable(page, 'Opening hand');
  const spread = page.getByRole('region', { name: 'Your opening hand' });
  const cards = spread.locator('.play-card');
  await expect(cards).toHaveCount(6);
  const ids = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-card-id')));
  const first = await bounds(cards.first());
  const last = await bounds(cards.last());
  expect(first.width).toBeGreaterThanOrEqual(130);
  expect(first.y).toBe(last.y);
  for (const card of await cards.all()) {
    await expect(card.locator('.play-opening-caption strong')).toBeVisible();
    await expect(card.locator('.play-opening-caption b')).toHaveText(/\d+ €\$/);
  }
  const keep = page.getByRole('button', { name: 'Keep hand', exact: true });
  expect((await bounds(keep)).y).toBeGreaterThanOrEqual(first.y + first.height);
  await cards.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.play-inspect')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cards.first()).toBeFocused();
  await keep.click();
  await expect(spread).toHaveCount(0);
  const hand = page.getByRole('region', { name: 'Your hand', exact: true });
  for (const id of ids) await expect(hand.locator(`[data-board-card="${id}"]`)).toBeVisible();
});

test('mulligan replaces the opening hand and the saved decision resumes', async ({ page }) => {
  await openTable(page, 'Opening hand');
  const hand = page.locator('.play-hand');
  const ids = () => hand.locator('.play-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-card-id')));
  const initial = await ids();
  await page.getByRole('button', { name: 'Mulligan', exact: true }).click();
  await expect.poll(ids).not.toEqual(initial);
  const redrawn = await ids();
  await page.reload();
  await expect.poll(ids).toEqual(redrawn);
  await expect(page.locator('button[data-move="mulligan"]')).toHaveCount(0);
});

test('hover shows printed rules beside the art and leaves full inspection and card actions accessible', async ({ page }) => {
  await openTable(page, 'Equip Satori');
  const card = page.locator('.play-hand').getByRole('button', { name: 'Satori', exact: true });
  await card.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toContainText(/draw 1/i);
  const art = await bounds(page.locator('.play-art-preview'));
  const rules = await bounds(tooltip);
  expect(rules.x + rules.width <= art.x + 1 || rules.x >= art.x + art.width - 1).toBe(true);
  await page.mouse.move(rules.x + rules.width / 2, rules.y + 18);
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('i');
  await expect(page.locator('dialog.play-inspect')).toBeVisible();
  await page.keyboard.press('Escape');
  await card.click();
  await expect(page.getByRole('dialog', { name: /Actions for Satori/ })).toBeVisible();
  await expect(tooltip).toHaveCount(0);
});
