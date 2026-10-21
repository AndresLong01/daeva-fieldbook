const {app,BrowserWindow}=require('electron');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const profile=path.join(__dirname,'..','qa-profile-v100');
const output=path.join(__dirname,'..','qa-v100');
app.setPath('userData',profile);
Object.defineProperty(app,'isPackaged',{get:()=>true});
const updater=new EventEmitter();
let available=false,failCheck=false,failDownload=false,downloadCalls=0,installArgs=null;
updater.checkForUpdates=async()=>{if(failCheck)throw new Error('Simulated network failure');updater.emit(available?'update-available':'update-not-available',{version:available?'1.0.1':'1.0.0'});};
updater.downloadUpdate=async()=>{downloadCalls++;updater.emit('download-progress',{percent:43});await new Promise(resolve=>setTimeout(resolve,200));if(failDownload){updater.emit('error',new Error('Simulated download failure'));throw new Error('Failed');}updater.emit('update-downloaded',{version:'1.0.1'});return ['verified-installer.exe'];};
updater.quitAndInstall=(...args)=>{installArgs=args;};
require.cache[require.resolve('electron-updater')]={exports:{autoUpdater:updater}};
require('./main.cjs');
async function waitFor(check){for(let i=0;i<100;i++){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Timed out');}
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Daeva Fieldbook'&&!w.webContents.isLoading()));
  const errors=[];main.webContents.on('console-message',(_event,level,message)=>{if(level>=2)errors.push(message);});
  main.setContentSize(1200,800);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('region')===null&&document.getElementById('category')===null&&document.getElementById('map-layer-label')===null`),true);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-resource-name').textContent`),'Aria Locations');
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-resource-context').textContent`),'VERTERON / PLANTS');
  const counts={};
  for(const region of ['Verteron','Altgard','Chaotic Lower Reshanta']){
    await main.webContents.executeJavaScript(`document.getElementById('map-region').value=${JSON.stringify(region)};document.getElementById('map-region').dispatchEvent(new Event('change'))`);
    const actual=await main.webContents.executeJavaScript(`({region:document.getElementById('map-region').value,rows:[...document.querySelectorAll('[data-resource]')].map(b=>({id:b.dataset.resource,count:Number(b.querySelector('.row-count').firstChild.textContent)})),expected:resources.filter(r=>r.regions[document.getElementById('map-region').value]).map(r=>r.id).sort(),all:Number(document.getElementById('all-resource-count').textContent),map:document.getElementById('map-image').getAttribute('href')})`);
    assert.equal(actual.region,region);assert.deepEqual(actual.rows.map(r=>r.id).sort(),actual.expected);assert.equal(actual.all,actual.rows.length);counts[region]=actual.rows.length;
    for(const row of actual.rows){assert.equal(row.count,await main.webContents.executeJavaScript(`knownSpots.filter(s=>s.resource===${JSON.stringify(row.id)}&&s.region===${JSON.stringify(region)}).length`));}
    if(region==='Altgard'){assert(!actual.rows.some(r=>r.id==='aria'));assert(actual.rows.some(r=>r.id==='azpha'));await new Promise(resolve=>setTimeout(resolve,200));await fs.writeFile(path.join(output,'altgard.png'),(await main.webContents.capturePage()).toPNG());}
    await main.webContents.executeJavaScript(`document.querySelector('[data-category="Minerals"]').click()`);
    assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-region').value`),region);
    assert.equal(await main.webContents.executeJavaScript(`[...document.querySelectorAll('[data-resource]')].every(b=>resources.find(r=>r.id===b.dataset.resource).category==='Minerals')`),true);
    await main.webContents.executeJavaScript(`document.querySelector('[data-category="All"]').click()`);
  }
  await main.webContents.executeJavaScript(`document.getElementById('map-region').value='Altgard';document.getElementById('map-region').dispatchEvent(new Event('change'));document.querySelector('[data-favorite="azpha"]').click();document.getElementById('favorites-filter').click()`);
  assert.deepEqual(await main.webContents.executeJavaScript(`[...document.querySelectorAll('[data-resource]')].map(b=>b.dataset.resource)`),['azpha']);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-resource-name').textContent`),'Azpha Locations');
  await main.webContents.executeJavaScript(`document.getElementById('map-region').value='Verteron';document.getElementById('map-region').dispatchEvent(new Event('change'))`);
  assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('[data-resource]').length`),0);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-region').disabled`),false);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-region').value`),'Verteron');
  await main.webContents.executeJavaScript(`document.getElementById('clear-filters').click();document.getElementById('map-region').value='Altgard';document.getElementById('map-region').dispatchEvent(new Event('change'))`);
  const reload=new Promise(resolve=>main.webContents.once('did-finish-load',resolve));main.webContents.reload();await reload;
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-region').value`),'Altgard');
  await main.webContents.executeJavaScript(`document.querySelector('[data-category="All"]').focus();document.getElementById('resource-filters').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('favorites-filter').getAttribute('aria-selected')`),'true');
  await main.webContents.executeJavaScript(`document.querySelector('[data-category="All"]').click();document.getElementById('search').value='no-such-gatherable';document.getElementById('search').dispatchEvent(new Event('input'))`);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-region').value`),'Altgard');
  await main.webContents.executeJavaScript(`document.getElementById('clear-filters').click()`);
  // Real IPC and renderer, with a controllable updater transport to exercise failure and retry states.
  await main.webContents.executeJavaScript(`window.desktop.updateCheck()`);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('download-update').hidden`),true);
  failCheck=true;
  assert.equal((await main.webContents.executeJavaScript(`window.desktop.updateCheck()`)).status,'error');
  failCheck=false;available=true;
  await main.webContents.executeJavaScript(`window.desktop.updateCheck()`);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('download-update').hidden`),false);
  assert.equal(downloadCalls,0,'Checking must never download automatically');
  main.setContentSize(960,720);
  await new Promise(resolve=>setTimeout(resolve,300));
  await fs.writeFile(path.join(output,'update-available.png'),(await main.webContents.capturePage()).toPNG());
  assert.equal(await main.webContents.executeJavaScript(`document.documentElement.scrollWidth<=innerWidth`),true);
  failDownload=true;
  assert.equal((await main.webContents.executeJavaScript(`window.desktop.updateDownload()`)).status,'error');
  assert.equal(installArgs,null,'Failed download must not install');
  failDownload=false;
  await main.webContents.executeJavaScript(`document.getElementById('download-update').click();document.getElementById('download-update').click()`);
  await waitFor(()=>installArgs);
  assert.equal(downloadCalls,2,'Ignore duplicate clicks during download');
  assert.deepEqual(installArgs,[true,true],'One click requests silent installation and relaunch');
  assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,counts,mapPersistence:true,scopedFavorites:true,updaterFailureRecovery:true,installArgs,downloadCalls,errors},null,2));app.exit(0);
}).catch(async error=>{await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'error.txt'),String(error.stack||error));app.exit(1);});
