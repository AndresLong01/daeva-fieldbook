// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-goal-completion',String(Date.now()));
fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({overlayGameOnly:false,goalShortcut:'Control+Alt+G'}));
app.setPath('userData',profile);
app.requestSingleInstanceLock=()=>true;
const visible=new WeakMap();
const registered=[];
const detectors=[];
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
function BackgroundWindow(options){
  const window=new BrowserWindow({...options,show:false,webPreferences:{...options.webPreferences,backgroundThrottling:false}});
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
  if(id==='electron')return {...electron,BrowserWindow:BackgroundWindow,globalShortcut:{register:key=>{registered.push(key);return true;},unregister:()=>{},unregisterAll:()=>{}}};
  if(id==='node:child_process')return {spawn:()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};detectors.push(child);return child;}};
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
  assert.deepEqual(registered,['Control+Alt+O'],'Only the overlay visibility shortcut should be registered');
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('goal-shortcut')===null`),true);
  assert.equal(await main.webContents.executeJavaScript(`window.desktop.settingsGet().then(settings=>'goalShortcut' in settings)`),false);
  const variants=require('./capture/item-variants.json').aria.slice(0,2);
  const ids=variants.map(item=>item.id);
  await main.webContents.executeJavaScript(`window.desktop.goalSet({resource:'aria',target:2,items:${JSON.stringify(ids)}})`);
  await waitFor(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('goal-overlay.html')&&!w.webContents.isLoading()));
  const overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('goal-overlay.html'));
  assert.equal(await overlay.webContents.executeJavaScript(`document.querySelector('header').textContent.includes('DRAG')`),false);
  // Simulate the existing gather detector's item event without reading game traffic.
  for(let i=0;i<2;i++){
    detectors.at(-1).stdout.write(JSON.stringify({type:'item',item:ids[0],kind:0,count:1})+'\n');
    await waitFor(()=>main.webContents.executeJavaScript(`window.desktop.goalGet().then(goals=>goals.find(goal=>goal.itemId===${ids[0]}).current===${i+1})`));
  }
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelector('.completed .goal-complete')?.textContent==='Complete!'`));
  await overlay.webContents.executeJavaScript(`window.qaCompletedRow=document.querySelector('.completed');void 0;`);
  await main.webContents.executeJavaScript(`window.desktop.goalAdjust(${ids[1]},1)`);
  assert.equal(await overlay.webContents.executeJavaScript(`document.querySelector('.completed')===window.qaCompletedRow`),true,'Other goals must not replace/restart the completing row');
  await new Promise(resolve=>setTimeout(resolve,900));
  assert.equal(await overlay.webContents.executeJavaScript(`Number(getComputedStyle(document.querySelector('.goal-complete')).opacity)>0.95`),true,'Complete text must fade in');
  await waitFor(()=>main.webContents.executeJavaScript(`window.desktop.goalGet().then(goals=>goals.length===1)`));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'gather-goal.json'),'utf8')).map(goal=>goal.itemId),[ids[1]]);
  assert.equal(await overlay.webContents.executeJavaScript(`document.querySelectorAll('.goal-row').length`),1);
  await main.webContents.executeJavaScript(`window.desktop.goalAdjust(${ids[1]},1)`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelector('.completed')!==null`));
  await main.webContents.executeJavaScript(`window.desktop.goalAdjust(${ids[1]},-1)`);
  await waitFor(()=>overlay.webContents.executeJavaScript(`document.querySelector('.completed')===null`));
  await new Promise(resolve=>setTimeout(resolve,3300));
  assert.equal(await main.webContents.executeJavaScript(`window.desktop.goalGet().then(goals=>goals.length)`),1,'A count correction must cancel automatic removal');
  await main.webContents.executeJavaScript(`window.desktop.goalAdjust(${ids[1]},1)`);
  await new Promise(resolve=>setTimeout(resolve,2800));
  assert.equal(await overlay.webContents.executeJavaScript(`Number(getComputedStyle(document.querySelector('.goal-row')).opacity)<1`),true,'Completed entry must fade out');
  await waitFor(()=>overlay.isDestroyed());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'gather-goal.json'),'utf8')),[]);
  assert.equal(await main.webContents.executeJavaScript(`window.desktop.goalGet().then(goals=>goals.length)`),0);
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false));
  console.log('PASS: removed shortcut, detector-driven completion, Complete text fade, stable rows, persisted removal, cancellation after correction, fade-out, and closing the last goal overlay. No visible windows or real detector launched.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
