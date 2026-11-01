// Integration checks with real renderers but no visible windows, desktop input,
// global shortcuts, or single-instance notifications to the user's running app.
const electron=require('electron');
const {app,BrowserWindow,screen}=electron;
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const profile=path.resolve(__dirname,'../qa-background-pets',String(Date.now()));
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
  const errors=[];
  main.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error(event.message);}});
  await main.webContents.executeJavaScript(`$('pets-tab').click();`);
  assert.deepEqual(await main.webContents.executeJavaScript(`({visible:!$('pets-panel').hidden,otherHidden:$('gather-panel').hidden,active:$('pets-tab').getAttribute('aria-current'),all:$('pet-show-all').checked,mixed:$('pet-show-all').indeterminate,count:$('pet-markers').children.length,rows:$('pet-list').children.length,types:[...$('pet-category').options].map(o=>o.value)})`),{visible:true,otherHidden:true,active:'page',all:true,mixed:false,count:324,rows:183,types:['All','Cogni','Fera','Natura','Varian']});
  for(const [region,counts] of [['Verteron',{All:324,Cogni:48,Fera:189,Natura:62,Varian:25}],['Altgard',{All:313,Cogni:53,Fera:169,Natura:52,Varian:39}]]){
    await main.webContents.executeJavaScript(`$('pet-region').value=${JSON.stringify(region)};$('pet-region').dispatchEvent(new Event('change'));`);
    for(const [category,count] of Object.entries(counts)){
      await main.webContents.executeJavaScript(`$('pet-category').value=${JSON.stringify(category)};$('pet-category').dispatchEvent(new Event('change'));`);
      assert.equal(await main.webContents.executeJavaScript(`$('pet-markers').children.length`),count,region+' '+category);
      assert.equal(await main.webContents.executeJavaScript(`$('pet-show-all').checked`),true);
    }
  }
  await main.webContents.executeJavaScript(`$('pet-region').value='Verteron';$('pet-region').dispatchEvent(new Event('change'));$('pet-category').value='Cogni';$('pet-category').dispatchEvent(new Event('change'));$('pet-list').querySelector('input').click();`);
  assert.equal(await main.webContents.executeJavaScript(`$('pet-show-all').indeterminate`),true);
  assert.equal(await main.webContents.executeJavaScript(`$('pet-markers').querySelector('[data-pet="'+$('pet-list').querySelector('input').dataset.pet+'"]')===null`),true,'Unchecking a pet hides all of its spots');
  await main.webContents.executeJavaScript(`$('pet-show-all').click();$('pet-show-all').click();`);
  assert.deepEqual(await main.webContents.executeJavaScript(`[!!$('pet-map-empty').hidden,$('pet-markers').children.length,$('pet-show-all').checked]`),[false,0,false]);
  await main.webContents.executeJavaScript(`$('pet-list').querySelector('input').click();`);
  assert.equal(await main.webContents.executeJavaScript(`new Set([...$('pet-markers').children].map(e=>e.dataset.pet)).size`),1);
  assert.equal(await main.webContents.executeJavaScript(`$('pet-map-title').textContent.endsWith(' Locations')`),true);
  await main.webContents.executeJavaScript(`$('pet-category').value='Fera';$('pet-category').dispatchEvent(new Event('change'));`);
  assert.equal(await main.webContents.executeJavaScript(`$('pet-markers').children.length`),189,'Cogni changes leave Fera selections intact');
  await main.webContents.executeJavaScript(`$('pet-search').value='Unstable Spider';$('pet-search').dispatchEvent(new Event('input'));`);
  assert.equal(await main.webContents.executeJavaScript(`$('pet-list').children.length`),1);
  await main.webContents.executeJavaScript(`$('pet-search').value='not-a-pet';$('pet-search').dispatchEvent(new Event('input'));`);
  assert.deepEqual(await main.webContents.executeJavaScript(`[$('pet-show-all').disabled,$('pet-no-results').hidden,$('pet-markers').children.length]`),[true,false,0]);
  await main.webContents.executeJavaScript(`$('pet-search').value='';$('pet-search').dispatchEvent(new Event('input'));$('pet-category').value='Cogni';$('pet-category').dispatchEvent(new Event('change'));$('pet-show-teleports').click();$('pet-marker-size').value='1.3';$('pet-marker-size').dispatchEvent(new Event('input'));`);
  assert((await main.webContents.executeJavaScript(`$('pet-teleports').children.length`))>0);
  const saved=await main.webContents.executeJavaScript(`JSON.stringify({selections:data.petSelections,region:data.petRegion,category:data.petCategory,marker:data.petMarkerSize,teleports:data.petTeleports})`);
  main.webContents.reload();
  await waitFor(async()=>!main.webContents.isLoading()&&await main.webContents.executeJavaScript(`typeof renderPets==='function'`));
  assert.equal(await main.webContents.executeJavaScript(`JSON.stringify({selections:data.petSelections,region:data.petRegion,category:data.petCategory,marker:data.petMarkerSize,teleports:data.petTeleports})`),saved);
  await main.webContents.executeJavaScript(`$('pets-tab').click();$('pet-category').value='All';$('pet-category').dispatchEvent(new Event('change'));$('pet-show-all').click();$('pet-map-reset').click();`);
  assert.equal(await main.webContents.executeJavaScript(`$('pet-markers').children.length`),324);
  const before=await main.webContents.executeJavaScript(`({scale:petScale,size:$('pet-markers').firstElementChild.transform.baseVal.getItem(1).matrix.a})`);
  await main.webContents.executeJavaScript(`$('pet-map').dispatchEvent(new KeyboardEvent('keydown',{key:'+'}));`);
  const after=await main.webContents.executeJavaScript(`({scale:petScale,size:$('pet-markers').firstElementChild.transform.baseVal.getItem(1).matrix.a})`);
  assert(after.scale>before.scale);assert(after.size*after.scale<before.size*before.scale,'Pointers shrink visually when zooming in');
  const priorX=await main.webContents.executeJavaScript('petX');
  await main.webContents.executeJavaScript(`$('pet-map').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'}));`);
  assert.equal(await main.webContents.executeJavaScript('petX'),priorX+40);
  main.setMinimumSize(400,400);
  for(const width of [520,800,1120,1600]){
    main.setContentSize(width,900);
    await new Promise(resolve=>setTimeout(resolve,100));
    const bounds=await main.webContents.executeJavaScript(`(()=>{const map=$('pet-map-stage').getBoundingClientRect(),list=$('pet-list').getBoundingClientRect();return {mapWidth:map.width,mapHeight:map.height,listHeight:list.height,right:map.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
    assert(bounds.mapWidth>250&&bounds.mapHeight>200&&bounds.listHeight>40,JSON.stringify({width,bounds}));
    assert(bounds.right<=bounds.width+1&&!bounds.overflow,JSON.stringify({width,bounds}));
  }
  await main.webContents.executeJavaScript(`$('pet-map-reset').click();`);
  const imageLoaded=await main.webContents.executeJavaScript(`new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>1000);image.onerror=()=>resolve(false);image.src=$('pet-map-image').getAttribute('href');})`);
  assert(imageLoaded,'Bundled game map must load');
  fs.writeFileSync(path.join(profile,'pets.png'),(await main.webContents.capturePage()).toPNG());
  await main.webContents.executeJavaScript(`$('gather-tab').click();`);
  assert.equal(await main.webContents.executeJavaScript(`$('pets-panel').hidden&&!$('gather-panel').hidden`),true);
  assert.deepEqual(errors,[]);
  assert(BrowserWindow.getAllWindows().every(w=>BrowserWindow.prototype.isVisible.call(w)===false));
  console.log('PASS: pet counts for every region/type, default all, individual checkboxes, mixed/empty selection, search, filter isolation, persisted preferences, pointer scaling, keyboard pan, responsive layout, bundled imagery and tab navigation. No visible windows or desktop input.');
  console.log('Screenshot: '+path.join(profile,'pets.png'));
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
