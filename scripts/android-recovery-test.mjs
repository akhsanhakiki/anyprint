import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const sockets = [];
let receivedBytes = 0;
const server = net.createServer(socket => { sockets.push(socket); socket.on('data', chunk => { receivedBytes += chunk.length; }); });
await new Promise(resolve => server.listen(19101, '0.0.0.0', resolve));
let browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
try {
  let page = browser.contexts()[0].pages()[0];
  const id = crypto.randomUUID();
  await page.evaluate(async id => {
    const api = window.Capacitor.Plugins.Printer;
    const state = await api.getState();
    const profile = { ...state.profiles[0], port: 19101, paceMs: 100, textMode: "image" };
    const receipt = { title: 'Recovery test', subtitle: 'SIMULATED PRINTER', reference: 'RECOVERY-TEST', date: '', currency: 'IDR', footer: 'Test only', qr: '', logo: '', items: Array.from({length: 10}, (_, i) => ({id: String(i), name: 'A long receipt line to keep transmission active during the deliberate interruption test.', quantity: 1, price: 1000})) };
    // Duplicate bridge calls with the same ID must still result in one durable job.
    await api.enqueue({ id, receipt, profile });
    await api.enqueue({ id, receipt, profile });
  }, id);
  await expect.poll(() => receivedBytes, { timeout: 15000 }).toBeGreaterThan(0);
  const before = await page.evaluate(async id => (await window.Capacitor.Plugins.Printer.getState()).jobs.filter(j => j.id === id), id);
  expect(before).toHaveLength(1); expect(before[0].state).toBe('sending');
  adb('shell', 'am', 'force-stop', 'com.anyprint.app');
  await browser.close().catch(() => {});
  sockets.forEach(s => s.destroy()); await new Promise(resolve => server.close(resolve));
  adb('shell', 'am', 'start', '-n', 'com.anyprint.app/.MainActivity');
  let pid = '';
  await expect.poll(() => { try { pid = adb('shell', 'pidof', 'com.anyprint.app'); return pid; } catch { return ''; } }).not.toBe('');
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  await expect.poll(async () => { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true, timeout: 2000 }); return true; } catch { return false; } }, { timeout: 15000 }).toBe(true);
  page = browser.contexts()[0].pages()[0];
  await page.getByRole('navigation').getByRole('button', {name: 'Activity', exact: true}).click();
  await expect(page.getByText('Check the paper', {exact: true}).first()).toBeVisible();
  await page.getByRole('button').filter({hasText:'RECOVERY-TEST'}).first().click();
  await expect(page.getByText('The app stopped while sending. Check the paper before reprinting.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Retry safely'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Print another copy'}).click();
  await expect(page.getByRole('heading', {name: 'Print another copy?'})).toBeVisible();
  await page.getByRole('button', {name: 'Go back', exact: true}).click();
  const after = await page.evaluate(async id => (await window.Capacitor.Plugins.Printer.getState()).jobs.filter(j => j.id === id), id);
  expect(after).toHaveLength(1); expect(after[0].state).toBe('unknown');
  await page.screenshot({path: 'docs/screenshots/android-recovery.png'});
  const result = {passed:true, duplicateSubmissionJobs:before.length, bytesBeforeInterruption:receivedBytes, before:before[0].state, after:after[0].state, automaticRetry:false, explicitCopyConfirmation:true};
  fs.writeFileSync('docs/recovery-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { sockets.forEach(s=>s.destroy()); server.close(); await browser?.close().catch(()=>{}); }
