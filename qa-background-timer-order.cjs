// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-timer-order',String(Date.now()));
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
  const bossKeys=await main.webContents.executeJavaScript(`(()=>{
    window.qaBosses=bosses.filter(b=>b.region==='Verteron').slice(0,5);
    window.qaStatuses=[{kind:'countdown',label:'10m',dueAt:Date.now()+600000},{kind:'unknown',label:'No report'},{kind:'countdown',label:'1m',dueAt:Date.now()+60000},{kind:'up',label:'Reported up'},{kind:'due',label:'Due',dueAt:Date.now()-1000}];
    bossStatus=boss=>window.qaStatuses[window.qaBosses.indexOf(boss)]||{kind:'unknown',label:'No report'};
    $('boss-region').value='Verteron';selectedBossKey=bossKey(window.qaBosses[0]);updateTimerCountdowns();
    window.qaPin=document.querySelector('[data-pin="boss:'+selectedBossKey+'"]');
    return window.qaBosses.map(bossKey);
  })()`);
  const order=await main.webContents.executeJavaScript(`[...$('boss-list').querySelectorAll('[data-boss-key]')].map(row=>row.dataset.bossKey)`);
  assert.deepEqual(new Set(order.slice(0,2)),new Set([bossKeys[3],bossKeys[4]]));
  assert.equal(order[2],bossKeys[2]);assert.equal(order[3],bossKeys[0]);assert(order.indexOf(bossKeys[1])>3);
  await main.webContents.executeJavaScript(`window.qaStatuses[0].dueAt=Date.now()+10000;updateTimerCountdowns();`);
  assert.equal(await main.webContents.executeJavaScript(`$('boss-list').querySelectorAll('[data-boss-key]')[2].dataset.bossKey`),bossKeys[0]);
  assert.equal(await main.webContents.executeJavaScript(`document.querySelector('[data-pin="boss:'+selectedBossKey+'"]')===window.qaPin`),true,'Reordering must preserve pin button identity');
  assert.equal(await main.webContents.executeJavaScript(`$('boss-list').querySelector('.selected').dataset.bossKey`),bossKeys[0]);
  await main.webContents.executeJavaScript(`$('boss-search').value=window.qaBosses[0].name;renderBossList();`);
  assert.equal(await main.webContents.executeJavaScript(`$('boss-list').querySelectorAll('[data-boss-key]').length`),1);
  await main.webContents.executeJavaScript(`$('boss-search').value='';window.qaStatuses[0]={kind:'unknown',label:'No report'};updateTimerCountdowns();`);
  assert.equal(await main.webContents.executeJavaScript(`$('boss-list').querySelectorAll('[data-boss-key]')[2].dataset.bossKey`),bossKeys[2],'Losing a known timer must move it below known countdowns');
  await main.webContents.executeJavaScript(`window.qaRealNow=Date.now;Date.now=()=>Date.parse('2026-10-29T11:59:00Z');data.abyssClockMode='fixed';data.abyssClockOffset=540;renderAbyss();`);
  assert.deepEqual(await main.webContents.executeJavaScript(`[...$('abyss-list').querySelectorAll('[data-abyss-id]')].map(row=>row.dataset.abyssId)`),['siege','argo','kaira','tamasa','watcher','nahma']);
  await main.webContents.executeJavaScript(`Date.now=()=>Date.parse('2026-10-29T12:00:01Z');renderAbyss();`);
  assert.deepEqual(await main.webContents.executeJavaScript(`[...$('abyss-list').querySelectorAll('[data-abyss-id]')].map(row=>row.dataset.abyssId)`),['argo','kaira','tamasa','watcher','nahma','siege']);
  await main.webContents.executeJavaScript(`Date.now=window.qaRealNow;window.desktop.timerPinsSet(['event:shugo','event:rift','event:invasion','event:battlefield'])`);
  await waitFor(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()));
  const overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html'));
  await main.webContents.executeJavaScript(`window.desktop.timerOverlaySnapshot([{key:'event:rift',name:'Rift',label:'10m',dueAt:Date.now()+600000,endAt:0},{key:'event:battlefield',name:'Battlefield',label:'No report',dueAt:0,endAt:0},{key:'event:shugo',name:'Shugo',label:'1m',dueAt:Date.now()+60000,endAt:0},{key:'event:invasion',name:'Invasion',label:'OPEN',dueAt:Date.now()+3600000,endAt:Date.now()+300000}])`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelectorAll('.timer-item').length===4`));
  assert.deepEqual(await overlay.webContents.executeJavaScript(`[...document.querySelectorAll('.timer-item')].map(row=>row.dataset.key)`),['event:invasion','event:shugo','event:rift','event:battlefield']);
  await overlay.webContents.executeJavaScript(`window.qaBell=document.querySelector('[data-alert-key="event:rift"]');pinnedSnapshot.find(item=>item.key==='event:rift').dueAt=Date.now()+5000;render();`);
  assert.equal(await overlay.webContents.executeJavaScript(`document.querySelectorAll('.timer-item')[1].dataset.key`),'event:rift');
  assert.equal(await overlay.webContents.executeJavaScript(`window.qaBell===document.querySelector('[data-alert-key="event:rift"]')`),true);
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false));
  console.log('PASS: soonest-first boss/overlay order, active/due priority, unknown times last, live reordering, selection/filter retention, stable buttons, and Abyss rollover. No desktop interaction or visible windows.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
