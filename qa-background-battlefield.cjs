// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-battlefield',String(Date.now()));
fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({overlayGameOnly:false}));
fs.writeFileSync(path.join(profile,'pinned-timers.json'),JSON.stringify(['event:battlefield']));
fs.writeFileSync(path.join(profile,'timer-overlay-settings.json'),JSON.stringify({separateEvents:false,alertPins:['event:battlefield']}));
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
  await waitFor(()=>main.webContents.executeJavaScript(`document.querySelector('[data-pin="event:battlefield"]').getAttribute('aria-pressed')==='true'`));
  assert.deepEqual(await main.webContents.executeJavaScript(`window.desktop.timerPinsGet()`),['event:battlefield']);
  await waitFor(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()));
  let overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html'));
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelector('[data-alert-key="event:battlefield"]')?.getAttribute('aria-pressed')==='true'`));
  await main.webContents.executeJavaScript(`toggleTimerPin('event:battlefield')`);
  assert.deepEqual(await main.webContents.executeJavaScript(`window.desktop.timerPinsGet()`),[]);
  await main.webContents.executeJavaScript(`toggleTimerPin('event:battlefield')`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'pinned-timers.json'),'utf8')),['event:battlefield']);
  await main.webContents.executeJavaScript(`window.desktop.timerSeparateSet(true)`);
  await waitFor(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('kind=event')&&!w.webContents.isLoading()));
  overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('kind=event'));
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelector('[data-alert-key="event:battlefield"]')!==null`));
  // Intercept sound inside the hidden renderer: no audio reaches the desktop.
  await overlay.webContents.executeJavaScript(`window.qaAlerts=0;window.playFieldbookAlert=async()=>{window.qaAlerts++;};document.querySelector('[data-alert-key="event:battlefield"]').click();`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelector('[data-alert-key="event:battlefield"]').getAttribute('aria-pressed')==='true'`));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'timer-overlay-settings.json'),'utf8')).alertPins,['event:battlefield']);
  await main.webContents.executeJavaScript(`window.qaDueAt=Date.now()+55000;window.qaScheduledStatus=scheduledEventStatus;scheduledEventStatus=(event,now)=>event.id==='battlefield'?{label:'55s',kind:'countdown',dueAt:window.qaDueAt,endAt:0}:window.qaScheduledStatus(event,now);updateTimerCountdowns();`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`window.qaAlerts===1`));
  await new Promise(resolve=>setTimeout(resolve,1200));
  assert.equal(await overlay.webContents.executeJavaScript(`window.qaAlerts`),1,'One-minute alert must fire only once');
  await main.webContents.executeJavaScript(`scheduledEventStatus=window.qaScheduledStatus;updateTimerCountdowns();`);
  const layouts=[];
  for(const width of [520,800,1120,1600]){
    main.setContentSize(width,790);
    await new Promise(resolve=>setTimeout(resolve,60));
    const layout=await main.webContents.executeJavaScript(`(()=>{const header=document.querySelector('.topbar').getBoundingClientRect();return {width:innerWidth,valid:[...document.querySelectorAll('.event-chip,.event-options')].every(element=>{const box=element.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=header.top&&box.bottom<=header.bottom;}),chips:document.querySelectorAll('.event-chip').length};})()`);
    assert.equal(layout.valid,true,`Timer bar must fit at ${width}px`);
    assert.equal(layout.chips,4);
    layouts.push(layout);
  }
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false),'No native windows may be shown');
  fs.writeFileSync(path.join(profile,'report.json'),JSON.stringify({passed:true,pinRestored:true,alertRestored:true,pinSaved:true,separateEventOverlay:true,oneMinuteAlertOnce:true,layouts,nativeWindowsShown:false},null,2));
  console.log('PASS: Battlefield pin/alert restore and save, separate event overlay, one-minute alert deduplication, and four responsive header sizes. No desktop input, sound, or visible windows.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
