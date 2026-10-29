// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-overlay-input',String(Date.now()));
fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({overlayGameOnly:false}));
app.setPath('userData',profile);
app.requestSingleInstanceLock=()=>true;
const visible=new WeakMap();
const ignored=new WeakMap();
const forwarded=new WeakMap();
function BackgroundWindow(options){
  const window=new BrowserWindow({...options,show:false});
  visible.set(window,options.show!==false);
  const setIgnore=window.setIgnoreMouseEvents.bind(window);
  window.setIgnoreMouseEvents=(value,options)=>{ignored.set(window,value);forwarded.set(window,options?.forward===true);setIgnore(value,options);};
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
  await main.webContents.executeJavaScript(`window.desktop.timerSeparateSet(true)`);
  await main.webContents.executeJavaScript(`window.desktop.timerPinsSet(['boss:Verteron:eternal-gartua','event:shugo'])`);
  await main.webContents.executeJavaScript(`window.desktop.noteOverlaySnapshot([{id:'12345678-1234-1234-1234-123456789abc',title:'QA',body:'Input recovery'}])`);
  await waitFor(()=>BrowserWindow.getAllWindows().filter(w=>/\/(timer|note)-overlay.html/.test(w.webContents.getURL())&&!w.webContents.isLoading()).length===3);
  const overlays=BrowserWindow.getAllWindows().filter(w=>/\/(timer|note)-overlay.html/.test(w.webContents.getURL()));
  for(const overlay of overlays){
    overlay.setSize(600,180);
    for(const zoom of [1,1.25,1.75,0.8]){
      overlay.webContents.setZoomFactor(zoom);
      await overlay.webContents.executeJavaScript(`reportLockButtonBounds()`);
      cursor={x:-30000,y:-30000};
      await overlay.webContents.executeJavaScript(`window.desktop.overlayLockToggle()`);
      await waitFor(()=>ignored.get(overlay)===true);
      assert.equal(forwarded.get(overlay),true);
      const rect=await overlay.webContents.executeJavaScript(`(()=>{const r=lockButton.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
      const bounds=overlay.getContentBounds();
      cursor={x:Math.round(bounds.x+(rect.x+rect.width/2)*zoom),y:Math.round(bounds.y+(rect.y+rect.height/2)*zoom)};
      await waitFor(()=>ignored.get(overlay)===false);
      // Keep the overlay locked across hide/show, then unlock using its actual handler.
      overlay.hide();overlay.showInactive();
      await waitFor(()=>ignored.get(overlay)===false);
      await overlay.webContents.executeJavaScript(`lockButton.click()`);
      await waitFor(()=>overlay.isMovable()&&ignored.get(overlay)===false);
      await waitFor(()=>overlay.webContents.executeJavaScript(`!document.body.classList.contains('overlay-locked')`));
      cursor={x:100,y:100};
      overlay.setPosition(100,100);
      await overlay.webContents.executeJavaScript(`moveHeader.setPointerCapture=()=>{};moveHeader.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,button:0,bubbles:true}));window.desktop.overlayLockGet();`);
      cursor={x:155,y:135};
      await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,buttons:1,bubbles:true}));`);
      await waitFor(()=>overlay.getBounds().x===155&&overlay.getBounds().y===135);
      await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));`);
      await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointerdown',{pointerId:8,button:0,bubbles:true}));moveHeader.dispatchEvent(new PointerEvent('pointermove',{pointerId:8,buttons:0,bubbles:true}));`);
      assert.equal(await overlay.webContents.executeJavaScript(`movingPointer`),null,'A missed mouse-up must not leave a drag active');
      await overlay.webContents.executeJavaScript(`resizeGrip.setPointerCapture=()=>{};resizeGrip.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,button:0,bubbles:true}));resizeGrip.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:9}));`);
      assert.equal(await overlay.webContents.executeJavaScript(`resizeStart`),null,'Lost resize capture must clear the gesture');
      await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointerdown',{pointerId:10,button:0,bubbles:true}));window.dispatchEvent(new Event('blur'));`);
      assert.equal(await overlay.webContents.executeJavaScript(`movingPointer`),null,'Interrupted drags must clear on blur');
      // Simulate Windows retaining click-through after a visibility/style transition.
      overlay.setIgnoreMouseEvents(true,{forward:true});
      overlay.hide();overlay.showInactive();
      assert.equal(ignored.get(overlay),false,'Showing an unlocked overlay must restore native interaction');
      overlay.setIgnoreMouseEvents(true,{forward:true});
      await overlay.webContents.executeJavaScript(`moveHeader.dispatchEvent(new PointerEvent('pointerenter'));window.desktop.overlayLockGet();`);
      assert.equal(ignored.get(overlay),false,'Forwarded hover must recover native input');
    }
    // Renderer reload must discard stale bounds and recover its lock control.
    cursor={x:-30000,y:-30000};
    await overlay.webContents.executeJavaScript(`window.desktop.overlayLockToggle()`);
    overlay.webContents.reload();
    await waitFor(()=>!overlay.webContents.isLoading());
    await waitFor(()=>overlay.webContents.executeJavaScript(`typeof lockButton!=='undefined'&&lockButton.getAttribute('aria-pressed')==='true'`));
    await main.webContents.executeJavaScript(`window.desktop.overlayLockClear()`);
    assert.equal(ignored.get(overlay),false);
  }
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false));
  console.log('PASS: three overlay types, 12 lock/unlock cycles at four zoom levels, dragging after unlock, hide/show and hover input recovery, renderer reload, and Unlock all. No desktop input or visible windows.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
