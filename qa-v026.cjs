const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const profile=path.join(__dirname,'..',`qa-profile-v026-${Date.now()}`);
const output=path.join(__dirname,'..','qa-v026');
app.setPath('userData',profile);
// Drive focus transitions deterministically while the user may be playing AION 2.
const childProcess=require('node:child_process');
const {PassThrough}=require('node:stream');
const {EventEmitter}=require('node:events');
const originalSpawn=childProcess.spawn;
let focusProbe;
childProcess.spawn=function(command,args,options){
  if(args?.some(arg=>String(arg).endsWith('game-focus.ps1'))){
    focusProbe=new EventEmitter();
    focusProbe.stdout=new PassThrough();focusProbe.stderr=new PassThrough();
    focusProbe.kill=()=>{focusProbe.stdout.end();focusProbe.stderr.end();};
    setImmediate(()=>focusProbe.stdout.write('other\n'));
    return focusProbe;
  }
  return originalSpawn(command,args,options);
};
require('./main.cjs');
async function waitFor(check){
  for(let i=0;i<100;i++){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error('Timed out waiting for app state');
}
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Daeva Fieldbook'&&!w.webContents.isLoading()));
  const errors=[];
  main.webContents.on('console-message',(_event,level,message)=>{if(level>=2)errors.push(message);});
  main.show();main.focus();main.setContentSize(1200,800);
  assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('#resource-list .resource-icon').length`),0);
  assert.equal(await main.webContents.executeJavaScript(`document.querySelector('footer').textContent`),'Aion 2 Fan Project');
  assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('#open-goal svg').length`),1);
  await new Promise(resolve=>setTimeout(resolve,300));
  await fs.writeFile(path.join(output,'gather.png'),(await main.webContents.capturePage()).toPNG());
  await main.webContents.executeJavaScript(`document.getElementById('abyss-tab').click();document.querySelector('[data-pin="abyss:watcher"]').click()`);
  await waitFor(()=>main.webContents.executeJavaScript(`window.desktop.timerPinsGet().then(pins=>pins.includes('abyss:watcher'))`));
  let timer=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()));
  await waitFor(()=>timer.webContents.executeJavaScript(`document.getElementById('timer-items').textContent.includes('Watcher Kaira')`));
  main.focus();
  await waitFor(()=>!timer.isVisible());
  assert.equal(timer.isVisible(),false,'Default focus-only setting hides overlays outside AION 2');
  focusProbe.stdout.write('game\n');
  await waitFor(()=>timer.isVisible());
  focusProbe.stdout.write('other\n');
  await waitFor(()=>!timer.isVisible());
  const scheduleMatch=await main.webContents.executeJavaScript(`(()=>{const now=Date.now();return {expected:nextAbyssStart(abyssEvents.find(e=>e.id==='watcher'),now),offset:data.abyssClockOffset};})()`);
  assert.equal(await timer.webContents.executeJavaScript(`pinnedSnapshot[0].dueAt`),scheduleMatch.expected);
  await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  await main.webContents.executeJavaScript(`document.getElementById('overlay-game-only').click()`);
  await waitFor(()=>timer.isVisible());
  assert.equal((await main.webContents.executeJavaScript(`window.desktop.settingsGet()`)).overlayGameOnly,false);
  // Lock hit testing and repeated unlock cycles are covered in qa-overlay-unlock.cjs.
  await main.webContents.executeJavaScript(`window.desktop.settingsGet().then(s=>window.desktop.settingsSet({...s,timerFontSize:100}))`);
  await main.webContents.executeJavaScript(`document.getElementById('abyss-tab').click();document.querySelector('[data-pin="abyss:siege"]').click()`);
  await waitFor(()=>timer.webContents.executeJavaScript(`document.querySelectorAll('.timer-item').length===2`));
  assert(timer.getBounds().height>=100,'Additional Abyss pin expands the minimum height');
  await main.webContents.executeJavaScript(`document.getElementById('separate-event-overlay').click()`);
  timer=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('kind=event')&&!w.webContents.isLoading()));
  await waitFor(()=>timer.webContents.executeJavaScript(`document.querySelectorAll('.timer-item').length===2`));
  const oldDue=await timer.webContents.executeJavaScript(`pinnedSnapshot.find(i=>i.key==='abyss:watcher').dueAt`);
  await main.webContents.executeJavaScript(`data.abyssClockOffset+=15;persist();renderAbyss();updateTimerCountdowns()`);
  await waitFor(()=>timer.webContents.executeJavaScript(`pinnedSnapshot.find(i=>i.key==='abyss:watcher').dueAt!==${oldDue}`));
  const expectedDue=await main.webContents.executeJavaScript(`nextAbyssStart(abyssEvents.find(e=>e.id==='watcher'))`);
  assert.equal(await timer.webContents.executeJavaScript(`pinnedSnapshot.find(i=>i.key==='abyss:watcher').dueAt`),expectedDue);
  await timer.webContents.executeJavaScript(`document.querySelector('[data-alert-key="abyss:watcher"]').click()`);
  await waitFor(()=>timer.webContents.executeJavaScript(`document.querySelector('[data-alert-key="abyss:watcher"]').getAttribute('aria-pressed')==='true'`));
  // Inject a scheduled start inside the one-minute alert window without waiting for a real spawn.
  await timer.webContents.executeJavaScript(`window.qaAlerts=0;void window.desktop.onAlertPlay(()=>window.qaAlerts++)`);
  await main.webContents.executeJavaScript(`window.qaPins=timerPins;timerPins=[];window.desktop.timerOverlaySnapshot([{key:'abyss:watcher',name:'Watcher Kaira',label:'45s',dueAt:Date.now()+45000,endAt:0},{key:'abyss:siege',name:'Artifact Siege',label:'3h',dueAt:Date.now()+10800000,endAt:0}])`);
  await waitFor(()=>timer.webContents.executeJavaScript(`window.qaAlerts===1`));
  await new Promise(resolve=>setTimeout(resolve,1200));
  assert.equal(await timer.webContents.executeJavaScript(`window.qaAlerts`),1,'Alert fires once per scheduled start');
  await main.webContents.executeJavaScript(`timerPins=window.qaPins;updateTimerCountdowns()`);
  await new Promise(resolve=>setTimeout(resolve,300));
  await fs.writeFile(path.join(output,'abyss.png'),(await main.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(output,'abyss-overlay.png'),(await timer.webContents.capturePage()).toPNG());
  await timer.webContents.executeJavaScript(`document.querySelector('.overlay-lock-button').click()`);
  await waitFor(()=>!timer.isMovable());
  await main.webContents.executeJavaScript(`window.desktop.overlayVisibilitySet(false)`);
  assert(!timer.isVisible());
  await main.webContents.executeJavaScript(`window.desktop.overlayVisibilitySet(true)`);
  assert(timer.isVisible());
  await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  await main.webContents.executeJavaScript(`document.getElementById('overlay-game-only').click()`);
  main.focus();
  await waitFor(()=>!timer.isVisible());
  await fs.writeFile(path.join(output,'settings.png'),(await main.webContents.capturePage()).toPNG());
  const reload=new Promise(resolve=>main.webContents.once('did-finish-load',resolve));main.webContents.reload();await reload;
  await waitFor(()=>main.webContents.executeJavaScript(`document.querySelector('[data-pin="abyss:watcher"]').getAttribute('aria-pressed')==='true'`));
  assert.equal((await main.webContents.executeJavaScript(`window.desktop.settingsGet()`)).overlayGameOnly,true);
  await main.webContents.executeJavaScript(`document.getElementById('clear-timer-pins').click()`);
  await waitFor(()=>!BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('timer-overlay.html')));
  assert.equal(await main.webContents.executeJavaScript(`document.querySelector('[data-pin="abyss:watcher"]').getAttribute('aria-pressed')`),'false');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,abyssScheduleMatches:true,abyssAlertOnce:true,simulatedFocusAndManualVisibility:true,errors},null,2));
  app.exit(0);
}).catch(async error=>{await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'error.txt'),String(error.stack||error)+'\n'+JSON.stringify(BrowserWindow.getAllWindows().map(w=>({id:w.id,url:w.webContents.getURL(),visible:w.isVisible(),loading:w.webContents.isLoading(),bounds:w.getBounds()})),null,2));app.exit(1);});
