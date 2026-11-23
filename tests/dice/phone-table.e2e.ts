import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

async function openPosition(page: Page, position: string) {
  await page.route('https://**/*', route => route.abort());
  await page.goto('/campaign-preview.html?decisions=' + position);
  await expect(page.locator('.phone-table')).toBeVisible();
}

test('the preview phone footer leads to the playable table and Back returns to Play', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('/#/collection');
  const play = page.locator('.vault-mobile-nav').getByRole('link', { name: 'Play', exact: true });
  await play.tap();
  await page.getByRole('link', { name: 'Try the phone table' }).tap();
  await expect(page.locator('.phone-hand').getByRole('button', { name: /^Satori/ })).toBeVisible();
  await page.goBack();
  await expect(play).toHaveAttribute('aria-current', 'page');
});

test('Ask Coach explains the phone decision and returns to the same board', async ({page})=>{
  await openPosition(page,'satori');
  const table=page.locator('.phone-table');
  const state=await table.getAttribute('data-state-id');
  const ask=page.getByRole('button',{name:'Ask Coach'});
  await ask.tap();
  const plan=page.getByRole('dialog',{name:'Your turn plan'});
  await expect(plan.getByRole('heading',{name:'Play now'})).toBeVisible();
  await expect(plan.getByRole('heading',{name:'Then play'})).toBeVisible();
  await plan.getByRole('button',{name:'Back to table'}).tap();
  await expect(plan).toBeHidden();
  await expect(table).toHaveAttribute('data-state-id',state!);
  await expect(table.locator('[data-coach-pick="true"]').first()).toBeVisible();
});

test('inspect, change the equip host and payment, rotate and confirm once', async ({ page }) => {
  await openPosition(page, 'satori');
  const table = page.locator('.phone-table');
  const initialState = await table.getAttribute('data-state-id');
  const unit = page.locator('.phone-side[data-seat=player] .phone-card').first();
  const unitId = await unit.getAttribute('data-board-card');
  await page.getByRole('button', {name: /^Satori/}).tap();
  const inspector = page.getByRole('dialog');
  await expect(inspector).toContainText('Equip to a friendly Unit or face-up Legend');
  await expect(inspector).toContainText('Current cost');
  await inspector.getByRole('button', {name:'Equip', exact:true}).tap();
  await expect(inspector).toHaveCount(0);
  await page.getByText('Eligible targets (2)', {exact:true}).tap();
  const targets = page.locator('[data-pick-option]');
  await expect(targets).toHaveCount(2);
  await targets.filter({hasText:'Viktor'}).tap();
  await expect(page.locator('[data-confirm-move]')).toContainText('Viktor');
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('[data-confirm-move]')).toContainText('Viktor');
  await page.locator('[data-step=host]').tap();
  await page.getByRole('button', {name:'Details for Corpo Security', exact:true}).first().tap();
  await expect(inspector).toContainText('Current power');
  await inspector.getByRole('button',{name:'Close'}).tap();
  await unit.tap();
  await page.getByText('Payment sources (2)', {exact:true}).tap();
  const payment = page.locator('[data-pick-option]').first();
  await payment.tap();
  const confirm = page.getByRole('button', {name:'Equip to Corpo Security · 2 €$'});
  await expect(confirm).toBeDisabled();
  await payment.tap();
  await expect(table).toHaveAttribute('data-state-id', initialState!);
  await confirm.tap();
  await expect(page.locator(`[data-board-card="${unitId}"]`)).toHaveAccessibleName(/power 4/i);
  await expect(page.locator('.phone-side[data-seat=player] header')).toContainText('0 €$');
  await expect(page.locator('.phone-hand')).not.toContainText('Satori');
  await page.reload();
  await expect(page.locator(`[data-board-card="${unitId}"]`)).toHaveAccessibleName(/power 4/i);
});

test('a native hand swipe reveals the eleventh card without inspecting or moving', { tag: '@chromium-swipe' }, async ({ page, context }) => {
  await openPosition(page, 'crowded');
  const table = page.locator('.phone-table');
  const initialState = await table.getAttribute('data-state-id');
  const hand = page.locator('.phone-hand');
  const cards = hand.locator('.phone-card');
  await expect(cards).toHaveCount(11);
  const session = await context.newCDPSession(page);
  for (const [width,height] of [[360,740],[390,844],[430,932],[844,390]]) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await hand.locator('.phone-strip').evaluate(strip => { strip.scrollLeft = 0; });
    const bounds = (await hand.locator('.phone-strip').boundingBox())!;
    const start = Math.floor(bounds.x + bounds.width - 30);
    const y = Math.floor(bounds.y + 30);
    for (let gesture = 0; gesture < 5; gesture++) {
      await session.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:start,y}]});
      for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:Math.round(start - (bounds.width - 65) * i / 6),y}]});
      await session.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    }
    await expect(hand.locator('.phone-range')).toContainText('11 of 11');
    await expect(table).toHaveAttribute('data-state-id',initialState!);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await cards.last().tap();
  await expect(page.getByRole('dialog')).toContainText('Psycho Squad');
  await expect(page.getByRole('dialog')).toContainText('Printed rules');
});

test('a crowded defense identifies the attacker, highlights the exact blocker and waits for confirmation', async ({ page }) => {
  await openPosition(page,'defense');
  const table = page.locator('.phone-table');
  const state = await table.getAttribute('data-state-id');
  const command = page.locator('.phone-command');
  await expect(command).toContainText('Your response');
  await expect(command.getByRole('region',{name:'Combat'})).toContainText('Field Operator');
  await expect(command).toContainText('Your Gigs');
  await command.locator('[data-move=useBlocker]').tap();
  await command.getByText(/^Eligible targets/).tap();
  const options = command.locator('[data-pick-option]');
  expect(await options.count()).toBeGreaterThan(4);
  const blocker = options.last();
  const id = await blocker.getAttribute('data-pick-option');
  await expect(blocker).toContainText('Yours · Slot 9 · Power');
  await blocker.tap();
  const tile = page.locator(`[data-board-card="${id}"]`);
  await expect(tile).toHaveAttribute('aria-pressed','true');
  await expect(table).toHaveAttribute('data-state-id',state!);
  await expect(command.locator('[data-confirm-move=useBlocker]')).toContainText('slot 9');
  await command.locator('[data-confirm-move=useBlocker]').tap();
  await expect(command).toContainText('Defender');
  await expect(tile).toContainText('Defender');
  await page.getByRole('button',{name:'Log',exact:true}).tap();
  await expect(page.getByRole('dialog')).toContainText(/block/i);
});

test('a routine sale and end turn use the offered actions and leave a readable rival reply', async ({ page }) => {
  await openPosition(page, 'exchange');
  await page.getByRole('button',{name:/^Floor It/}).tap();
  await page.getByRole('dialog').getByRole('button',{name:/Sell/}).tap();
  const confirm = page.locator('[data-confirm-move=sellCard]');
  await expect(confirm).toBeEnabled();
  await confirm.tap();
  await expect(page.locator('.phone-hand')).not.toContainText('Floor It');
  await page.locator('.phone-command [data-move=passPhase]').tap();
  await page.locator('[data-confirm-move=passPhase]').tap();
  await page.getByRole('button',{name:'Log',exact:true}).tap();
  await expect(page.getByRole('dialog').locator('li').first()).toContainText('Field Operator attacked your Gigs.');
  await expect(page.getByRole('dialog').locator('li').first()).toContainText('Turn 2 · Rival');
});

test('concealed slots stay private and browsing restores focus without advancing the match', async ({ page }) => {
  await openPosition(page, 'satori');
  const table = page.locator('.phone-table');
  const state = await table.getAttribute('data-state-id');
  const piles = page.getByRole('button', { name:'Rival resources and piles' });
  await piles.tap();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name:/Legend slot 1/}).tap();
  const concealed = page.getByRole('dialog', {name:'Face-down card'});
  await expect(concealed).toContainText('identity is concealed');
  await expect(concealed.getByText('Printed rules')).toHaveCount(0);
  await expect(concealed.locator('[data-card-back]')).toHaveCount(1);
  await concealed.getByRole('button', {name:'Close'}).tap();
  await dialog.getByRole('button', {name:'Close'}).tap();
  await expect(piles).toBeFocused();
  await expect(table).toHaveAttribute('data-state-id',state!);
  const sizes = await table.locator('button:visible').evaluateAll(buttons => buttons.map(button => {
    const {width,height} = button.getBoundingClientRect();
    return Math.min(width,height);
  }));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
});

test('a damaged fixture checkpoint opens a fresh playable position', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa:command-bar:checkpoint:Equip Satori', '{'));
  await openPosition(page, 'satori');
  await expect(page.getByRole('status').filter({ hasText: 'Opened a fresh table' })).toBeVisible();
  await page.getByRole('button', { name: /^Satori/ }).tap();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Equip', exact: true })).toBeEnabled();
});

test('blocked fixture storage still applies a confirmed payment and preserves the current table', async ({ page }) => {
  await page.addInitScript(() => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key.startsWith('qa:command-bar:checkpoint')) throw new DOMException('Read blocked', 'SecurityError');
      return read.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('qa:command-bar:checkpoint')) throw new DOMException('Write blocked', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await openPosition(page, 'satori');
  await page.getByRole('button', { name: /^Satori/ }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Equip', exact: true }).tap();
  const unit = page.locator('.phone-side[data-seat=player] .phone-card').first();
  await unit.tap();
  await page.locator('[data-confirm-move=playCard]').tap();
  await expect(unit).toHaveAccessibleName(/Power 4/i);
  await expect(page.locator('.phone-side[data-seat=player] header')).toContainText('0 €$');
  await expect(page.getByRole('status').filter({ hasText: 'keep playing in this tab' })).toBeVisible();
  await page.getByRole('button', { name: 'Show test controls' }).tap();
  await page.getByRole('button', { name: 'Resume saved fixture' }).tap();
  await expect(unit).toHaveAccessibleName(/Power 4/i);
});

test('switching review positions preserves each direct link and checkpoint', async ({ page }) => {
  await openPosition(page, 'satori');
  await page.getByRole('button', { name: /^Satori/ }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Equip', exact: true }).tap();
  await page.locator('.phone-side[data-seat=player] .phone-card').first().tap();
  await page.locator('[data-confirm-move]').tap();
  await page.getByRole('button', { name:'Show test controls' }).tap();
  await page.getByRole('combobox', { name:'Position' }).click();
  await page.getByRole('option', { name:'Crowded defense', exact:true }).click();
  await page.reload();
  await expect(page.locator('.phone-command')).toContainText('Your response');
  await page.goto('/campaign-preview.html?decisions=satori');
  await expect(page.locator('.phone-side[data-seat=player] .phone-card').first()).toHaveAccessibleName(/Power 4/i);
});

test('enlarged text keeps the field reachable and confirms the intended blocker in short landscape', async ({ page }) => {
  await page.setViewportSize({width:667, height:320});
  await openPosition(page, 'defense');
  await page.addStyleTag({content:'html { font-size: 200%; }'});
  const field = page.locator('.phone-side[data-seat=player]');
  expect((await field.boundingBox())!.height).toBeGreaterThan(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(667);
  await page.locator('[data-move=useBlocker]').tap();
  await page.locator('.phone-options summary').tap();
  const option = page.locator('[data-pick-option]').last();
  const target = await option.getAttribute('data-pick-option');
  await option.tap();
  const confirm = page.locator('[data-confirm-move=useBlocker]');
  await expect(confirm).toContainText('slot 9');
  await confirm.tap();
  await expect(field.locator(`[data-board-card="${target}"]`)).toContainText('Defender');
});

test('card and combat names and chosen payment sources pass the accessibility scan', async ({ page }) => {
  async function scan() {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map(issue => ({ id: issue.id, nodes: issue.nodes.map(node => node.target) }))).toEqual([]);
  }
  await openPosition(page, 'satori');
  await page.getByRole('button', { name: /^Satori/ }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Equip', exact: true }).tap();
  await page.locator('.phone-side[data-seat=player] .phone-card').first().tap();
  await page.getByText('Payment sources (2)', { exact: true }).tap();
  await scan();
  await page.goto('/campaign-preview.html?decisions=defense');
  await expect(page.locator('.phone-command')).toContainText('Your response');
  await scan();
});
