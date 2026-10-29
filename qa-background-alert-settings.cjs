// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-alert-settings',String(Date.now()));
fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'app-settings.json'),JSON.stringify({overlayGameOnly:false,volume:42,overlayOpacity:61,timerFontSize:140,...(process.argv.includes('--saved')?{alertIntervals:[300,180,60,30]}:process.argv.includes('--none')?{alertIntervals:[]}:{} )}));
app.setPath('userData',profile);
app.requestSingleInstanceLock=()=>true;
const visible=new WeakMap();
function BackgroundWindow(options){
  const window=new BrowserWindow({...options,show:false});
  const execute=window.webContents.executeJavaScript.bind(window.webContents);
  window.webContents.executeJavaScript=async code=>{try{return await execute(code);}catch(error){console.error('Failed renderer check:',code);throw error;}};
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
  await waitFor(()=>main.webContents.executeJavaScript(`fieldbookSettings.volume===42`));
  const expected=process.argv.includes('--saved')?[300,180,60,30]:process.argv.includes('--none')?[]:[60];
  assert.deepEqual(await main.webContents.executeJavaScript(`[...document.querySelectorAll('[name="alert-interval"]:checked')].map(input=>Number(input.value))`),expected,'Saved selections must restore, with one minute as the legacy default');
  await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click();window.playFieldbookAlert=async volume=>{window.qaSoundVolume=volume;};void 0;`);
  await waitFor(()=>main.webContents.executeJavaScript(`document.getElementById('settings-panel').hidden===false`));
  for(const intervals of [[300,180,60,30],[300,30],[],[180,60]]){
    await main.webContents.executeJavaScript(`for(const checkbox of document.querySelectorAll('[name="alert-interval"]')){const checked=${JSON.stringify(intervals)}.includes(Number(checkbox.value));if(checkbox.checked!==checked)checkbox.click();}`);
    await waitFor(()=>JSON.stringify(JSON.parse(fs.readFileSync(path.join(profile,'app-settings.json'),'utf8')).alertIntervals)===JSON.stringify(intervals));
    assert.deepEqual(await main.webContents.executeJavaScript(`window.desktop.settingsGet().then(settings=>settings.alertIntervals)`),intervals);
  }
  await main.webContents.executeJavaScript(`document.getElementById('alert-volume').value=36;document.getElementById('alert-volume').dispatchEvent(new Event('input'));`);
  await waitFor(()=>JSON.parse(fs.readFileSync(path.join(profile,'app-settings.json'),'utf8')).volume===36);
  await main.webContents.executeJavaScript(`document.getElementById('test-alert').click()`);
  await waitFor(()=>main.webContents.executeJavaScript(`window.qaSoundVolume===36`));
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'app-settings.json'),'utf8'));
  assert.deepEqual(saved.alertIntervals,[180,60]);assert.equal(saved.overlayOpacity,61);assert.equal(saved.timerFontSize,140);
  for(const invalid of [null,'60',[10],[-30],['60'],[300,180,60,30,30]]){
    assert.equal(await main.webContents.executeJavaScript(`window.desktop.settingsSet({alertIntervals:${JSON.stringify(invalid)}}).then(()=>false,()=>true)`),true,'Invalid selections must be rejected');
  }
  main.webContents.reload();
  await waitFor(()=>!main.webContents.isLoading());
  await waitFor(()=>main.webContents.executeJavaScript(`fieldbookSettings.volume===36&&JSON.stringify(fieldbookSettings.alertIntervals)==='[180,60]'`));
  assert.deepEqual(await main.webContents.executeJavaScript(`[...document.querySelectorAll('[name="alert-interval"]:checked')].map(input=>Number(input.value))`),[180,60]);
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false));
  console.log('PASS: alert defaults/restoration, checkbox combinations and none, saved volume, sound test volume, input validation, renderer reload, and preservation of appearance settings. No visible windows or sound.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
