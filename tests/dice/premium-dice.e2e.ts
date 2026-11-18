import { test, expect, type Page } from '@playwright/test';

async function workbench(page: Page) {
  await page.goto('/campaign-preview.html?dice');
  await expect(page.locator('.dice-preview-gallery img')).toHaveCount(12);
  await expect.poll(() => page.locator('.dice-preview-gallery img').evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
}

async function gigChoice(page: Page) {
  await page.goto('/campaign-preview.html?decisions');
  await page.getByRole('combobox', { name: 'Position' }).click();
  await page.getByRole('option', { name: 'Gig die', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Roll d12', exact: true }).filter({ visible: true }).last()).toBeEnabled();
}

test('crystal artwork renders all six shapes in the two ownership colors', async ({ page }) => {
  await workbench(page);
  for (const seat of ['player', 'rival']) {
    const dice = page.locator(`.dice-preview-gallery[data-seat="${seat}"] .play-crystal-die`);
    for (const type of ['d4', 'd6', 'd8', 'd10', 'd12', 'd20']) {
      const icon = dice.filter({ hasText: new RegExp(`^${type}$`) }).locator('img');
      await expect(icon).toHaveAttribute('src', new RegExp(`${seat}-${type}\\.webp`));
      const color = await icon.evaluate(image => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image as HTMLImageElement, 0, 0, 64, 64);
        const rgba = ctx.getImageData(0, 0, 64, 64).data;
        let red = 0, blue = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          red += rgba[i] * rgba[i + 3]; blue += rgba[i + 2] * rgba[i + 3];
        }
        return { red, blue };
      });
      if (seat === 'player') expect(color.blue).toBeGreaterThan(color.red * 1.4);
      else expect(color.red).toBeGreaterThan(color.blue * 1.4);
    }
  }
});

test('hard throws last longer, emit collision sparks, and return the same saved result', async ({ page }) => {
  await workbench(page);
  const die = page.locator('.play-gigs [data-card-id="preview-player"]');
  const artwork = await die.locator('img').getAttribute('src');
  await page.getByRole('button', { name: 'Gentle drop', exact: true }).click();
  await page.clock.runFor(700);
  await expect(page.locator('.play-gig-roll')).toHaveAttribute('data-phase', 'landed');
  await page.getByRole('button', { name: 'Aggressive throw', exact: true }).click();
  await page.clock.runFor(700);
  await expect(page.locator('.play-gig-roll')).toHaveAttribute('data-phase', 'air');
  await expect(die).toHaveAttribute('data-roll-pending', '');
  expect(await page.locator('.play-gig-sparks canvas').evaluateAll(nodes => nodes.some(node => !(node as HTMLCanvasElement).hidden))).toBe(true);
  await page.clock.runFor(1800);
  await expect(page.locator('.play-gig-roll')).toHaveAttribute('data-phase', 'docked');
  await expect(die).not.toHaveAttribute('data-roll-pending');
  expect(await die.locator('img').getAttribute('src')).toBe(artwork);
  expect(await page.locator('.play-gig-sparks canvas').evaluateAll(nodes => nodes.every(node => (node as HTMLCanvasElement).hidden))).toBe(true);
});

test('simultaneous player and rival rolls complete without leaving hidden dice', async ({ page }) => {
  await workbench(page);
  await page.getByRole('button', { name: 'Both crews', exact: true }).click();
  await page.clock.runFor(180);
  await expect(page.locator('.play-gig-roll')).toHaveCount(2);
  await expect(page.locator('[data-roll-pending]')).toHaveCount(2);
  await page.clock.runFor(2300);
  await expect(page.locator('.play-gig-roll[data-phase="docked"]')).toHaveCount(2);
  await expect(page.locator('[data-roll-pending]')).toHaveCount(0);
});

async function expectTableToFit(page: Page) {
  await expect.poll(() => page.locator('.play-table').evaluate(table => {
    const bottom = table.getBoundingClientRect().bottom + window.scrollY;
    return bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight;
  })).toBe(true);
}

test('a real drag rolls and docks without scrolling the laptop table', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 690 });
  await gigChoice(page);
  await expectTableToFit(page);
  const source = page.getByRole('button', { name: 'Roll d12', exact: true }).last();
  const box = (await source.boundingBox())!;
  const field = (await page.locator('[data-zone="field:player"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(field.x + field.width * .75, field.y + field.height * .5, { steps: 8 });
  await expect(page.locator('.play-drag-ghost img')).toBeVisible();
  await page.mouse.move(field.x + field.width * .25, field.y + field.height * .5, { steps: 3 });
  await page.mouse.up();
  const rolling = page.locator('.play-gig-roll[data-seat="player"]').first();
  await expect(rolling).toHaveAttribute('data-launch', 'drag');
  const result = await rolling.getAttribute('data-result');
  await expect(page.locator('.play-roll-outcome').first()).toBeHidden();
  await expect(page.locator('.play-gig-roll-layer')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('button', { name: `d12 Gig · ${result}`, exact: true })).toBeVisible();
  await expect(page.locator('[data-roll-pending]')).toHaveCount(0);
  await expectTableToFit(page);
});

test('reduced motion interrupts a roll and keeps the authoritative result visible', async ({ page }) => {
  await gigChoice(page);
  await page.getByRole('button', { name: 'Roll d6', exact: true }).last().click();
  await page.getByRole('button', { name: 'Roll die', exact: true }).click();
  const rolling = page.locator('.play-gig-roll[data-seat="player"]').first();
  await expect(rolling).toBeAttached();
  const result = await rolling.getAttribute('data-result');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.play-gig-roll-layer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `d6 Gig · ${result}`, exact: true })).toBeVisible();
  await expect(page.locator('[data-roll-pending]')).toHaveCount(0);
});

test('losing the graphics context during a throw continues the same roll in Canvas and docks the saved value', async ({ page }) => {
  await workbench(page);
  await page.getByRole('button', { name: 'Aggressive throw' }).click();
  const die = page.locator('.play-gig-roll');
  await expect.poll(async () => {
    await page.clock.runFor(16);
    return die.getAttribute('data-renderer');
  }).toBe('webgl');
  const result = await die.getAttribute('data-result');
  await die.locator('.play-gig-mesh canvas:last-child').evaluate(node => {
    (node as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(die).toHaveAttribute('data-renderer', 'canvas');
  await page.clock.runFor(100);
  await expect(die.locator('.play-gig-mesh canvas').first()).toBeVisible();
  await page.clock.runFor(2200);
  await expect(die).toHaveAttribute('data-phase', 'docked');
  await expect(page.locator('[data-card-id="preview-player"] .play-crystal-die b')).toHaveText(result!);
});

test('a saved engine result docks with artwork when WebGL is unavailable from launch', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string, ...args: unknown[]) {
      return id.includes('webgl') ? null : Reflect.apply(original, this, [id, ...args]);
    } as typeof original;
  });
  await gigChoice(page);
  await page.getByRole('button', { name: 'Roll d12', exact: true }).last().click();
  await page.getByRole('button', { name: 'Roll die', exact: true }).click();
  const roll = page.locator('.play-gig-roll[data-seat="player"]').first();
  await expect(roll).toHaveAttribute('data-renderer', 'canvas');
  const result = await roll.getAttribute('data-result');
  const dock = page.getByRole('button', { name: `d12 Gig · ${result}`, exact: true });
  await expect(dock.locator('.play-crystal-die b')).toHaveText(result!);
  await expect(dock.locator('img')).toBeVisible();
  await expect(page.locator('[data-roll-pending]')).toHaveCount(0);
});
