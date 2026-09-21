import { test, expect } from '@playwright/test';
test('receipt editor persists a real draft and calculates its total', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Let’s print.' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit receipt' }).click();
  await page.getByLabel('Store name', { exact: true }).fill('Kopi Pagi');
  await page.getByLabel('Item name', { exact: true }).fill('Iced latte');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Unit price (IDR)', { exact: true }).fill('18000');
  await page.getByRole('button', { name: 'Preview receipt' }).click();
  await expect(page.getByRole('article', { name: 'Receipt preview' })).toContainText('Kopi Pagi');
  await expect(page.locator('.receipt-total')).toContainText('36.000');
  await page.reload();
  await expect(page.getByRole('article', { name: 'Receipt preview' })).toContainText('Iced latte');
  await page.screenshot({ path: 'docs/screenshots/receipt-mobile.png', fullPage: true });
});
test('browser preview is honest about unavailable native printing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up a printer', exact: true }).click();
  await page.getByRole('button', { name: 'Show paired devices' }).click();
  await expect(page.getByRole('alert')).toContainText('requires the Anyprint Android app');
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.getByLabel('Printer IP address').fill('192.168.1.100');
  await page.getByLabel('Printer name').fill('Counter printer');
  await page.getByRole('button', { name: 'Save printer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('requires the Anyprint Android app');
});
test('small viewport has no horizontal overflow and all navigation works', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  for (const name of ['Printers', 'Activity', 'Print']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Printers', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/printers-mobile.png', fullPage: true });
});
test('quality controls default to native font and darker output', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up a printer', exact: true }).click();
  await expect(page.getByRole('combobox', {name:'Text printing', exact:true})).toHaveValue('native');
  await expect(page.getByRole('combobox', {name:'Print weight', exact:true})).toHaveValue('bold');
  await page.getByRole('combobox', {name:'Text printing', exact:true}).selectOption('image');
  await page.getByRole('combobox', {name:'Print weight', exact:true}).selectOption('normal');
  await expect(page.getByRole('combobox', {name:'Text printing', exact:true})).toHaveValue('image');
  await expect(page.getByRole('combobox', {name:'Print weight', exact:true})).toHaveValue('normal');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('VSC setup selects image output and solid logos without losing address', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Set up a printer',exact:true}).click();
  await page.getByRole('button',{name:'Network',exact:true}).click();
  await page.getByLabel('Printer IP address').fill('192.168.1.100');
  await page.getByRole('button',{name:'Use VSC TM-58D Pro setup',exact:true}).click();
  await expect(page.getByLabel('Printer IP address')).toHaveValue('192.168.1.100');
  await expect(page.getByRole('combobox',{name:'Text printing',exact:true})).toHaveValue('image');
  await expect(page.getByRole('combobox',{name:'Logo rendering',exact:true})).toHaveValue('solid');
  await page.getByText('Compatibility settings',{exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Image mode',exact:true})).toHaveValue('column');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
