import { expect, test } from '@playwright/test';

test('uploaded photos keep printing detail and save each suggested printing separately', async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/scan', (route) => route.fulfill({ json: { matches: [
    { slug: 'towerfall', printingId: '15920617-a06f-4302-9dfb-c85d3470c7eb', collectorNumber: '138', printingCode: 'MS01-WNC', qty: 2 },
    { slug: 'towerfall', printingId: 'b4ff8d51-99e1-4d6f-b8b7-c98d59283400', collectorNumber: '167', printingCode: 'MS01-WNC', qty: 1 },
    { slug: 'towerfall', printingId: '4d8a1ccb-6d46-45b1-839a-fd3b7fa84b72', collectorNumber: 'β167', printingCode: 'MS01-WNC', qty: 1 },
    { slug: 'towerfall', printingId: null, qty: 1 },
  ] } }));
  await page.goto('/#/add');
  await page.getByRole('tab', { name: 'Scan cards' }).click();

  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = 2400;
    const context = canvas.getContext('2d')!;
    ['red', 'green', 'blue', 'yellow'].forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(index % 2 * 1600, Math.floor(index / 2) * 1200, 1600, 1200);
    });
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  const request = page.waitForRequest('**/api/scan');
  await page.getByRole('heading', { name: 'Upload photos' }).locator('..').locator('input[type=file]')
    .setInputFiles({ name: 'scan.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  const submitted = await request;
  expect(submitted.postDataBuffer()!.length).toBeLessThan(4_500_000);
  const { image, detailImages } = submitted.postDataJSON();
  expect(detailImages).toHaveLength(4);
  const sizes = await page.evaluate(async (images: string[]) => Promise.all(images.map(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const size = [bitmap.width, bitmap.height];
    bitmap.close();
    return size;
  })), [image, ...detailImages]);
  expect(sizes).toEqual([[1600, 1200], [1800, 1350], [1800, 1350], [1800, 1350], [1800, 1350]]);

  const printings = page.getByRole('combobox', { name: 'Printing' });
  await expect(printings).toHaveText(['WNC Retail #138 · Epic', 'WNC Retail #167 · Iconic Other', 'WNC Beta #β167 · Iconic Other', 'Printing unspecified']);
  await expect(page.getByText('Read #167 · MS01-WNC', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add 5 to vault' }).click();
  await expect(page.getByText('Added 5 cards to your vault')).toBeVisible();

  await page.evaluate(() => { location.hash = '/collection'; });
  await page.getByRole('button', { name: /^Open Towerfall/ }).click();
  const dialog = page.getByRole('dialog');
  for (const [number, count] of [['138', 2], ['167', 1], ['β167', 1]] as const) {
    const row = dialog.getByRole('button', { name: new RegExp(`#${number}\\b`) });
    await expect(row.locator('.card-drawer-row-qty')).toHaveText(String(count));
  }
});
