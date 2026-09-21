import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const adb = (...args) => execFileSync('adb', args, {encoding:'utf8'});
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', {noDefaults:true});
try {
  const page = browser.contexts()[0].pages()[0];
  await page.getByRole('navigation').getByRole('button', {name:'Printers',exact:true}).click();
  await page.getByRole('button', {name:'Add your first printer'}).click();
  await page.getByRole('button', {name:'Show paired devices'}).click();
  adb('shell','uiautomator','dump','/sdcard/anyprint-permission.xml');
  const xml = adb('shell','cat','/sdcard/anyprint-permission.xml');
  const button = xml.match(/<node[^>]*resource-id="com.android.permissioncontroller:id\/permission_deny_button"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!button) throw new Error('Android Nearby devices permission dialog was not found');
  const [,x1,y1,x2,y2] = button.map(Number);
  adb('shell','input','tap',String(Math.round((x1+x2)/2)),String(Math.round((y1+y2)/2)));
  await expect(page.getByRole('alert')).toContainText('permission was denied');
  await page.screenshot({path:'docs/screenshots/android-permission-denied.png'});
  await page.getByRole('button', {name:'USB',exact:true}).click();
  await page.getByRole('button', {name:'Find USB printers'}).click();
  await expect(page.getByText(/No USB devices found/)).toBeVisible();
  console.log(JSON.stringify({passed:true, bluetoothPermissionDenial:'recoverable message', usbWithoutDevice:'clear empty state'}));
  await page.getByRole('navigation').getByRole('button', {name:'Print',exact:true}).click();
} finally { await browser.close(); }
