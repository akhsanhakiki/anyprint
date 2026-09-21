import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
const adb = (...args) => execFileSync('adb', args, {encoding:'utf8'}).trim();
async function attach() {
  let browser;
  await expect.poll(async () => {
    try {
      const pid=adb('shell','pidof','com.anyprint.app');
      adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
      browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true,timeout:2000});
      return true;
    } catch {return false;}
  },{timeout:15000}).toBe(true);
  const page=browser.contexts()[0].pages()[0];
  await page.getByRole('navigation').getByRole('button',{name:'Print',exact:true}).waitFor();
  return {browser,page};
}
let {browser,page}=await attach();
const received=[];
const server=net.createServer(socket=>{const chunks=[];socket.on('data',chunk=>chunks.push(chunk));socket.on('end',()=>received.push(Buffer.concat(chunks)));});
try {
  // Start with v0.1.0 and real saved profile/draft, then upgrade without clearing app data.
  await page.evaluate(async()=>{
    await window.Capacitor.Plugins.Printer.saveProfile({profile:{id:'upgrade-printer',name:'Existing counter',connection:'network',address:'10.0.2.2',port:19102,paperMm:58,dots:384,imageMode:'raster',paceMs:10,cut:false}});
    localStorage.setItem('anyprint.selected','upgrade-printer');
  });
  await page.getByRole('button', {name:'Edit receipt'}).click();
  await page.getByLabel('Store name', {exact:true}).fill('Existing store');
  await page.getByLabel('Item name', {exact:true}).fill('Iced latte');
  await page.getByLabel('Quantity', {exact:true}).fill('2');
  await page.getByLabel('Unit price (IDR)', {exact:true}).fill('18000');
  await page.getByRole('button', {name:'Preview receipt'}).click();
  await page.reload();
  await expect(page.getByRole('article',{name:'Receipt preview'})).toContainText('Existing store');
  await browser.close();
  adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk');
  adb('shell','am','start','-n','com.anyprint.app/.MainActivity');
  ({browser,page}=await attach());
  await expect(page.getByRole('article',{name:'Receipt preview'})).toContainText('Existing store');
  const state=await page.evaluate(()=>window.Capacitor.Plugins.Printer.getState());
  expect(state.profiles.find(p=>p.id==='upgrade-printer')).toMatchObject({address:'10.0.2.2',dots:384});
  await new Promise(resolve=>server.listen(19102,'0.0.0.0',resolve));
  await page.getByRole('button',{name:'Print receipt',exact:true}).click();
  await expect.poll(()=>received.length).toBe(1);
  const native=received[0].toString('latin1');
  expect(native).toContain('Iced latte\n'); expect(native).toContain('IDR 36.000\n');
  expect(native).toContain('\x1bE\x01'); expect(native).not.toContain('\x1dv0');
  await page.getByRole('navigation').getByRole('button',{name:'Printers',exact:true}).click();
  await page.getByRole('button',{name:'Edit Existing counter',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Text printing',exact:true})).toHaveValue('native');
  await expect(page.getByRole('combobox',{name:'Print weight',exact:true})).toHaveValue('bold');
  await page.getByRole('combobox',{name:'Text printing',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/screenshots/print-quality-settings.png',scale:'css'});
  await page.getByRole('button',{name:'Save printer',exact:true}).click();
  await page.getByRole('button',{name:'Test print',exact:true}).click();
  await expect.poll(()=>received.length,{timeout:20000}).toBe(2);
  const diagnostic=received[1].toString('latin1');
  expect(diagnostic).toContain('Normal: AaBb 0123456789\n'); expect(diagnostic).toContain('Bold:   AaBb 0123456789\n');
  expect(diagnostic).toContain('\x1dv0');
  fs.writeFileSync('docs/quality-test-receipt.bin',received[1]);
  await page.getByRole('navigation').getByRole('button',{name:'Printers',exact:true}).click();
  await page.getByRole('button',{name:'Edit Existing counter',exact:true}).click();
  await page.getByRole('combobox',{name:'Text printing',exact:true}).selectOption('image');
  await page.getByRole('button',{name:'Save printer',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Print',exact:true}).click();
  await page.getByRole('button',{name:'Print receipt',exact:true}).click();
  await expect.poll(()=>received.length,{timeout:20000}).toBe(3);
  expect(received[2].toString('latin1')).toContain('\x1dv0');
  expect(received[2].toString('latin1')).not.toContain('Iced latte\n');
  const result={passed:true,upgradePreservesPrinterAndDraft:true,legacyDefaults:'native + bold',residentTextBytes:received[0].length,imageBytes:received[2].length,qualityTestBytes:received[1].length,normalBoldComparison:true};
  fs.writeFileSync('docs/quality-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser?.close().catch(()=>{});server.close();}
