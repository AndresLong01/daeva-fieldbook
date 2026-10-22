const {app,BrowserWindow,screen}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../qa-overlay-unlock');
app.setPath('userData',path.join(output,'profile'));
const ignored=new WeakMap();
const originalIgnore=BrowserWindow.prototype.setIgnoreMouseEvents;
BrowserWindow.prototype.setIgnoreMouseEvents=function(value,...args){ignored.set(this,value);return originalIgnore.call(this,value,...args);};
let cursor={x:-30000,y:-30000};
app.whenReady().then(()=>{screen.getCursorScreenPoint=()=>cursor;});
require('./main.cjs');
async function waitFor(check){
  for(let i=0;i<100;i++){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error('Timed out waiting for overlay state');
}
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Daeva Fieldbook'&&!w.webContents.isLoading()));
  await main.webContents.executeJavaScript(`window.desktop.settingsGet().then(s=>window.desktop.settingsSet({...s,overlayGameOnly:false,timerFontSize:135}))`);
  await main.webContents.executeJavaScript(`window.desktop.overlayLockClear()`);
  await main.webContents.executeJavaScript(`window.desktop.timerSeparateSet(true)`);
  await main.webContents.executeJavaScript(`window.desktop.timerPinsSet(['boss:Verteron:eternal-gartua','event:shugo'])`);
  await main.webContents.executeJavaScript(`window.desktop.goalSet({resource:'aria',target:40,items:[610670041]})`);
  await main.webContents.executeJavaScript(`window.desktop.noteOverlaySnapshot([{id:'12345678-1234-1234-1234-123456789abc',title:'Test note',body:'A route to remember'}])`);
  await waitFor(()=>BrowserWindow.getAllWindows().filter(w=>/\/(goal|timer|note)-overlay.html/.test(w.webContents.getURL())&&!w.webContents.isLoading()).length===4);
  const overlays=BrowserWindow.getAllWindows().filter(w=>/\/(goal|timer|note)-overlay.html/.test(w.webContents.getURL()));
  const results=[];
  for(const timer of overlays){
  for(let cycle=0;cycle<3;cycle++){
    const font=[75,135,175][cycle];
    await main.webContents.executeJavaScript(`window.desktop.settingsGet().then(s=>window.desktop.settingsSet({...s,goalFontSize:${font},timerFontSize:${font},noteFontSize:${font}}))`);
    await new Promise(resolve=>setTimeout(resolve,100));
    const rect=await timer.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.overlay-lock-button').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
    const x=Math.round(rect.x+rect.width/2),y=Math.round(rect.y+rect.height/2);
    timer.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
    timer.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});
    await waitFor(()=>!timer.isMovable()&&ignored.get(timer));
    assert.equal(BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('lock-control.html')),false);
    const bounds=timer.getBounds();
    cursor={x:bounds.x+x,y:bounds.y+y};
    await waitFor(()=>ignored.get(timer)===false);
    assert.equal(timer.isMovable(),false,'Hovering the lock must not unlock the window');
    cursor={x:bounds.x+10,y:bounds.y+bounds.height-10};
    await waitFor(()=>ignored.get(timer)===true);
    cursor={x:bounds.x+x,y:bounds.y+y};
    await waitFor(()=>ignored.get(timer)===false);
    timer.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
    timer.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});
    await waitFor(()=>timer.isMovable());
    cursor={x:-30000,y:-30000};
    await new Promise(resolve=>setTimeout(resolve,100));
    const state={overlay:timer.webContents.getURL().split('/').pop(),cycle,font,movable:timer.isMovable(),resizable:timer.isResizable(),locked:await timer.webContents.executeJavaScript(`window.desktop.overlayLockGet()`),drag:await timer.webContents.executeJavaScript(`getComputedStyle(document.querySelector('header')).webkitAppRegion`)};
    results.push(state);console.log(JSON.stringify(state));
    assert.equal(state.locked,false);assert.equal(state.movable,true);assert.equal(state.resizable,true);assert.equal(state.drag,'drag');
    assert.equal(ignored.get(timer),false,'Unlocked overlay stays interactive after cursor leaves lock button');
    const saved=JSON.parse(await fs.readFile(path.join(output,'profile/overlay-locks.json'),'utf8'));
    assert(Object.values(saved).every(locked=>locked===false));
  }
  }
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2));
  app.exit(0);
}).catch(async error=>{await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'error.txt'),String(error.stack));console.error(error);app.exit(1);});
