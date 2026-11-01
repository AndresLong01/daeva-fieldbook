// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-server-clock',String(Date.now()));
fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({overlayGameOnly:false}));
app.setPath('userData',profile);
app.requestSingleInstanceLock=()=>true;
const visible=new WeakMap();
function BackgroundWindow(options){
  const window=new BrowserWindow({...options,show:false});
  visible.set(window,options.show!==false);
  window.show=window.showInactive=()=>{visible.set(window,true);window.emit('show');};
  window.hide=()=>{visible.set(window,false);window.emit('hide');};
  window.isVisible=()=>visible.get(window);
  window.focus=()=>{};
  return window;
}
Object.setPrototypeOf(BackgroundWindow,BrowserWindow);
const load=Module._load;
Module._load=function(id,parent,isMain){
  if(id==='electron')return {...electron,BrowserWindow:BackgroundWindow,globalShortcut:{register:()=>true,unregister:()=>{},unregisterAll:()=>{}}};
  return load.call(this,id,parent,isMain);
};
let cursor={x:100,y:100};
app.whenReady().then(()=>{screen.getCursorScreenPoint=()=>cursor;});
require('./main.cjs');
async function waitFor(check){
  for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,30));}
  throw Error('Timed out waiting for background interaction');
}
app.whenReady().then(async()=>{
  await waitFor(()=>BrowserWindow.getAllWindows().some(w=>w.getTitle()==='Daeva Fieldbook'&&!w.webContents.isLoading()));
  const main=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Daeva Fieldbook');
  await main.webContents.executeJavaScript(`data.abyssClockOffset=-420;delete data.abyssClockMode;persist();`);
  main.webContents.reload();
  await waitFor(async()=>!main.webContents.isLoading()&&await main.webContents.executeJavaScript(`typeof renderAbyss==='function'`));
  assert.equal(await main.webContents.executeJavaScript('data.abyssClockMode'),'server');
  await main.webContents.executeJavaScript(`window.qaRealNow=Date.now;window.qaNow=Date.parse('2026-11-01T08:30:00Z');Date.now=()=>window.qaNow;renderAbyss();updateTimerCountdowns();`);
  assert.deepEqual(await main.webContents.executeJavaScript(`[$('abyss-server-clock').textContent,$('abyss-clock-zone').textContent,$('abyss-clock-input').disabled]`),['01:30:00','PDT · automatic',true]);
  await main.webContents.executeJavaScript(`window.qaNow=Date.parse('2026-11-01T09:30:00Z');renderAbyss();updateTimerCountdowns();`);
  assert.deepEqual(await main.webContents.executeJavaScript(`[$('abyss-server-clock').textContent,$('abyss-clock-zone').textContent,$('event-rift').textContent]`),['01:30:00','PST · automatic','30m 00s']);
  await main.webContents.executeJavaScript(`toggleTimerPin('event:rift')`);
  await main.webContents.executeJavaScript(`toggleTimerPin('abyss:nahma')`);
  await main.webContents.executeJavaScript(`toggleTimerPin('event:battlefield')`);
  await waitFor(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()));
  const overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html'));
  await waitFor(()=>overlay.webContents.executeJavaScript('pinnedSnapshot.length===3'));
  const due=await overlay.webContents.executeJavaScript(`Object.fromEntries(pinnedSnapshot.map(item=>[item.key,new Date(item.dueAt).toISOString()]))`);
  assert.deepEqual(due,{'event:rift':'2026-11-01T10:00:00.000Z','abyss:nahma':'2026-11-02T05:00:00.000Z','event:battlefield':'2026-11-01T19:00:00.000Z'});
  await main.webContents.executeJavaScript(`$('abyss-clock-mode').value='fixed';$('abyss-clock-mode').dispatchEvent(new Event('change'));data.abyssClockOffset=540;persist();renderAbyss();updateTimerCountdowns();`);
  assert.equal(await main.webContents.executeJavaScript(`$('abyss-clock-input').disabled`),false);
  await waitFor(()=>overlay.webContents.executeJavaScript(`pinnedSnapshot.find(item=>item.key==='abyss:nahma').dueAt===Date.parse('2026-11-01T12:00:00Z')`));
  main.webContents.reload();
  await waitFor(async()=>!main.webContents.isLoading()&&await main.webContents.executeJavaScript(`typeof renderAbyss==='function'`));
  assert.deepEqual(await main.webContents.executeJavaScript(`[data.abyssClockMode,data.abyssClockOffset]`),['fixed',540]);
  await main.webContents.executeJavaScript(`$('abyss-clock-mode').value='server';$('abyss-clock-mode').dispatchEvent(new Event('change'));`);
  assert.equal(await main.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('daeva-fieldbook-v1')).abyssClockMode`),'server');
  // Alert thresholds consume the same corrected UTC deadlines as the app.
  await overlay.webContents.executeJavaScript(`window.playFieldbookAlert=async()=>{};void 0;`);
  await main.webContents.executeJavaScript(`Date.now=()=>Date.parse('2026-11-01T18:59:05Z');updateTimerCountdowns();renderAbyss();`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`pinnedSnapshot.find(item=>item.key==='event:rift').dueAt===Date.parse('2026-11-01T19:00:00Z')`));
  assert.equal(await main.webContents.executeJavaScript(`$('event-rift').textContent`),'55s');
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false));
  console.log('PASS: saved daylight offset migrates, live PDT/PST rollover without restart, corrected app/overlay deadlines, manual clock preservation, automatic mode persistence, and corrected alert deadline. No desktop input or visible windows.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
