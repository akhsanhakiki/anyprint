// Runs against the debug APK in an emulator via its WebView debugging port.
// Start the app and forward tcp:9222 to its webview_devtools_remote_<pid> first.
import { chromium, expect } from '@playwright/test';
import net from 'node:net';
import fs from 'node:fs';
const connections = [];
const server = net.createServer(socket => {
  const chunks = [];
  socket.on('data', chunk => chunks.push(chunk));
  socket.on('end', () => connections.push(Buffer.concat(chunks)));
});
await new Promise(resolve => server.listen(19100, '0.0.0.0', resolve));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
try {
  const page = browser.contexts()[0].pages()[0];
  await page.getByRole('navigation').getByRole('button', { name: 'Printers', exact: true }).click();
  await page.getByRole('button', { name: 'Add your first printer' }).click();
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.getByLabel('Printer IP address').fill('10.0.2.2');
  await page.getByLabel('Port', { exact: true }).fill('19100');
  await page.getByLabel('Printer name').fill('Test counter');
  await page.getByRole('button', { name: 'Save printer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test counter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Test print', exact: true }).click();
  await expect(page.getByText('Sent to printer', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect.poll(() => connections.length).toBe(1);
  fs.writeFileSync('docs/test-receipt.bin', connections[0]);
  if (connections[0][0] !== 0x1b || connections[0][1] !== 0x40 || connections[0].length < 1000) throw new Error('Invalid receipt output');
  await page.screenshot({ path: 'docs/screenshots/android-activity.png' });
  await page.getByRole('navigation').getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: 'Edit receipt' }).click();
  await page.getByLabel('Store name', { exact: true }).fill('Kopi Pagi');
  await page.getByLabel('Address or subtitle').fill('Jakarta, Indonesia');
  await page.getByLabel('Item name', { exact: true }).fill('Iced latte');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Unit price (IDR)', { exact: true }).fill('18000');
  await page.getByRole('button', { name: 'Preview receipt' }).click();
  await page.getByRole('button', { name: 'Print receipt', exact: true }).click();
  await expect(page.getByText('Sent to printer', { exact: true })).toHaveCount(2, { timeout: 30000 });
  await expect.poll(() => connections.length).toBe(2);
  // Deliberately close the simulated printer; subsequent jobs must fail BEFORE transmission.
  await new Promise(resolve => server.close(resolve));
  await page.getByRole('navigation').getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: 'Print receipt', exact: true }).click();
  await expect(page.getByText('Not sent', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button').filter({ hasText: 'Not sent' }).click();
  await expect(page.getByText(/Nothing was sent/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry safely' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/android-failure.png' });
  await page.getByRole('button', { name: 'Cancel job', exact: true }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  console.log(JSON.stringify({ passed: true, receivedJobs: connections.length, testReceiptBytes: connections[0].length, failure: 'Not sent; safe retry offered', cancelled: true }));
} finally { server.close(); await browser.close(); }
