// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-interactions',String(Date.now()));
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
  await main.webContents.executeJavaScript(`window.desktop.timerPinsSet(['event:shugo'])`);
  await waitFor(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()));
  const overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html'));
  await main.webContents.executeJavaScript(`window.desktop.timerOverlaySnapshot([{key:'event:shugo',name:'Shugo Festival',label:'5m',dueAt:Date.now()+300000,endAt:0}])`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelector('.alert-button')!==null`));
  overlay.setPosition(100,100);
  const before=overlay.getBounds();
  // Synthetic pointer events exercise the header handlers without desktop input.
  await overlay.webContents.executeJavaScript(`moveHeader.setPointerCapture=()=>{};moveHeader.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,button:0,bubbles:true}));`);
  await overlay.webContents.executeJavaScript(`window.desktop.overlayLockGet()`);
  cursor={x:180,y:145};
  await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,bubbles:true}));`);
  await waitFor(()=>overlay.getBounds().x===before.x+80&&overlay.getBounds().y===before.y+45);
  await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));`);
  await overlay.webContents.executeJavaScript(`window.desktop.overlayLockGet()`);
  const after=overlay.getBounds();cursor={x:250,y:250};
  await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,bubbles:true}));`);
  await new Promise(resolve=>setTimeout(resolve,50));assert.deepEqual(overlay.getBounds(),after);
  await overlay.webContents.executeJavaScript(`window.qaBell=document.querySelector('.alert-button');window.qaBell.dispatchEvent(new PointerEvent('pointerdown',{pointerId:8,button:0,bubbles:true}));render();render();`);
  assert.equal(await overlay.webContents.executeJavaScript(`document.querySelector('.alert-button')===window.qaBell`),true,'Timer refresh must preserve the pressed button');
  await overlay.webContents.executeJavaScript(`window.qaBell.click()`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`window.qaBell.getAttribute('aria-pressed')==='true'`));
  assert.deepEqual(overlay.getBounds(),after,'Button clicks must not drag the overlay');
  await overlay.webContents.executeJavaScript(`window.desktop.overlayLockToggle()`);
  await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,button:0,bubbles:true}));window.desktop.overlayMove('start');`);
  await overlay.webContents.executeJavaScript(`window.desktop.overlayLockGet()`);
  cursor={x:500,y:500};
  await overlay.webContents.executeJavaScript(`window.desktop.overlayMove('move')`);
  await new Promise(resolve=>setTimeout(resolve,50));assert.deepEqual(overlay.getBounds(),after,'Locked overlay must not move');
  await overlay.webContents.executeJavaScript(`window.desktop.overlayLockToggle()`);
  assert.equal(overlay.isMovable(),true);
  await main.webContents.executeJavaScript(`document.getElementById('overlay-opacity').value=61;document.getElementById('overlay-opacity').dispatchEvent(new Event('input'));document.getElementById('timer-font-size').value=140;document.getElementById('timer-font-size').dispatchEvent(new Event('input'));`);
  await waitFor(()=>{const settings=JSON.parse(fs.readFileSync(path.join(profile,'app-settings.json'),'utf8'));return settings.overlayOpacity===61&&settings.timerFontSize===140;});
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false),'No native window may be shown by this test');
  fs.writeFileSync(path.join(profile,'report.json'),JSON.stringify({passed:true,dragDelta:{x:80,y:45},buttonsSurviveRefresh:true,lockedMovementBlocked:true,settingsSaved:true,nativeWindowsShown:false},null,2));
  console.log('PASS: background drag handlers, persistent alert buttons, lock protection, and settings saves. No desktop input or visible windows.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
