const {app,BrowserWindow,screen}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const childProcess=require('node:child_process');
const duplicate=process.argv.includes('--duplicate');
const output=path.resolve(__dirname,'../qa-instance-lifecycle');
const run=process.argv.find(arg=>arg.startsWith('--run='))?.slice(6)||String(Date.now());
app.setPath('userData',path.join(output,run,duplicate?'duplicate-profile':'primary-profile'));
let reads=0,minimumChanges=0,focusStarts=0;
const helpers=[];
const spawn=childProcess.spawn;
childProcess.spawn=function(command,args,options){
  const child=spawn(command,args,options);
  if(args?.some(arg=>String(arg).endsWith('game-focus.ps1'))){focusStarts++;helpers.push(child);}
  return child;
};
const minimum=BrowserWindow.prototype.setMinimumSize;
BrowserWindow.prototype.setMinimumSize=function(...args){minimumChanges++;return minimum.apply(this,args);};
app.whenReady().then(()=>{const cursor=screen.getCursorScreenPoint;screen.getCursorScreenPoint=()=>{reads++;return cursor();};});
require('./main.cjs');
async function waitFor(check){
  for(let i=0;i<100;i++){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('Timed out waiting for lifecycle state');
}
if(!duplicate)app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Daeva Fieldbook'&&!w.webContents.isLoading()));
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(focusStarts,0,'No focus watcher without overlays');
  assert.equal(reads,0,'No hit testing without overlays');
  let forwarded=0;app.on('second-instance',()=>forwarded++);
  const second=spawn(process.execPath,[__filename,'--duplicate','--run='+run],{windowsHide:true,stdio:'pipe'});
  let error='';second.stderr.on('data',chunk=>error+=chunk);
  const code=await new Promise((resolve,reject)=>{second.once('exit',resolve);second.once('error',reject);});
  assert.equal(code,0,error);await waitFor(()=>forwarded===1);
  assert.equal(BrowserWindow.getAllWindows().length,1,'Duplicate profile must not open another Fieldbook');
  assert.equal(app.getPath('userData'),path.join(output,run,'primary-profile'));
  await main.webContents.executeJavaScript(`window.desktop.settingsSet({overlayGameOnly:false})`);
  await main.webContents.executeJavaScript(`window.desktop.timerPinsSet(['event:shugo'])`);
  const overlay=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()&&w.isVisible()));
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(focusStarts,0,'Always-visible overlays do not need a focus watcher');
  assert.equal(reads,0,'Unlocked overlays do not need lock hit testing');
  const previousMinimum=minimumChanges;
  await new Promise(resolve=>setTimeout(resolve,2100));
  assert.equal(minimumChanges,previousMinimum,'Timer ticks must not reset unchanged native minimum sizes');
  await overlay.webContents.executeJavaScript(`window.desktop.overlayLockToggle()`);
  await waitFor(()=>reads>0);
  await main.webContents.executeJavaScript(`window.desktop.overlayVisibilitySet(false)`);
  const hiddenReads=reads;await new Promise(resolve=>setTimeout(resolve,200));assert.equal(reads,hiddenReads);
  await main.webContents.executeJavaScript(`window.desktop.overlayVisibilitySet(true)`);
  await waitFor(()=>reads>hiddenReads);
  await overlay.webContents.executeJavaScript(`window.desktop.overlayLockToggle()`);
  const unlockedReads=reads;await new Promise(resolve=>setTimeout(resolve,200));assert.equal(reads,unlockedReads);
  await main.webContents.executeJavaScript(`window.desktop.settingsSet({overlayGameOnly:true})`);
  await waitFor(()=>focusStarts===1);
  helpers[0].kill();
  await new Promise(resolve=>setTimeout(resolve,1000));
  assert.equal(focusStarts,1,'A failed helper must not cause a rapid restart loop');
  await waitFor(()=>focusStarts===2);
  await main.webContents.executeJavaScript(`window.desktop.settingsSet({overlayGameOnly:false})`);
  await waitFor(()=>helpers.every(child=>child.exitCode!==null||child.signalCode!==null));
  await main.webContents.executeJavaScript(`window.desktop.timerPinsSet([])`);
  assert.equal(BrowserWindow.getAllWindows().length,1);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,duplicateForwarded:forwarded,profilesKeptSeparate:true,idleHitTests:0,unchangedMinimumUpdates:0,focusStarts,helpersStopped:true},null,2));
  console.log('PASS: shared instance lock, separate data, idle polling, watcher lifetime, and stable window sizing');
  main.close();
}).catch(error=>{console.error(error);app.exit(1);});
