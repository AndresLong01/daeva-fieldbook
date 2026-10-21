const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../qa-cubes');
app.setPath('userData',path.join(output,'profile'));
require('./main.cjs');
async function waitFor(check){
  for(let i=0;i<100;i++){const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('Timed out waiting for cube map');
}
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(window=>window.getTitle()==='Daeva Fieldbook'&&!window.webContents.isLoading()));
  const errors=[];main.webContents.on('console-message',(_event,level,message)=>{if(level>=2&&!/ERR_INTERNET_DISCONNECTED/.test(message)){errors.push(message);console.error(message);}});
  main.setContentSize(1280,800);
  main.show();main.focus();main.webContents.focus();
  await main.webContents.executeJavaScript(`document.getElementById('cubes-tab').click();document.getElementById('cube-region').value='Verteron';document.getElementById('cube-region').dispatchEvent(new Event('change'));document.getElementById('cube-show-all').click()`);
  assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('main:not([hidden])').length`),1);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('cubes-tab').getAttribute('aria-current')`),'page');
  for(const [region,total] of [['Verteron',1440],['Altgard',1371]]){
    await main.webContents.executeJavaScript(`document.getElementById('cube-region').value=${JSON.stringify(region)};document.getElementById('cube-region').dispatchEvent(new Event('change'));document.getElementById('cube-show-all').click()`);
    assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('#cube-markers [data-cube]').length`),total);
    const counts=await main.webContents.executeJavaScript(`({sum:[...document.querySelectorAll('.cube-area-row small')].reduce((sum,node)=>sum+Number(node.textContent),0),ids:new Set(cubeAtlas.maps[data.cubeRegion].spots.map(point=>point.id)).size,valid:cubeAtlas.maps[data.cubeRegion].spots.every(point=>point.x>=0&&point.x<=1000&&point.y>=0&&point.y<=1000&&cubeAtlas.maps[data.cubeRegion].areas.some(area=>area.id===point.area))})`);
    assert.equal(counts.sum,total);assert.equal(counts.ids,total);assert(counts.valid);
    const area=await main.webContents.executeJavaScript(`cubeAtlas.maps[data.cubeRegion].areas.find(area=>area.id!=='unassigned')`);
    await main.webContents.executeJavaScript(`document.querySelector('[data-cube-only="${area.id}"]').click()`);
    assert.equal(await main.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#cube-markers [data-cube]')).every(marker=>marker.dataset.area==='${area.id}')&&document.querySelectorAll('#cube-markers [data-cube]').length>0`),true);
    await main.webContents.executeJavaScript(`document.getElementById('cube-clear').click()`);
    assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('#cube-markers [data-cube]').length`),0);
    assert.equal(await main.webContents.executeJavaScript(`document.getElementById('cube-map-empty').hidden`),false);
    await main.webContents.executeJavaScript(`{const box=document.querySelector('[data-cube-area="${area.id}"]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))}`);
    assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('#cube-markers [data-cube]').length>0`),true);
    await main.webContents.executeJavaScript(`document.getElementById('cube-show-all').click();document.getElementById('cube-search').value='no-such-subregion';document.getElementById('cube-search').dispatchEvent(new Event('input'))`);
    assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('#cube-markers [data-cube]').length===0&&!document.getElementById('cube-no-results').hidden`),true);
    await main.webContents.executeJavaScript(`document.getElementById('cube-show-all').click()`);
  }
  await main.webContents.executeJavaScript(`document.getElementById('cube-search').value='Moslan';document.getElementById('cube-search').dispatchEvent(new Event('input'))`);
  assert.equal(await main.webContents.executeJavaScript(`visibleCubeSpots.length>0&&document.getElementById('cube-area-list').textContent.includes('Moslan')`),true);
  await main.webContents.executeJavaScript(`document.querySelector('[data-cube-only]').click();document.getElementById('cube-search').value='';document.getElementById('cube-search').dispatchEvent(new Event('input'));document.getElementById('cube-show-teleports').checked=true;document.getElementById('cube-show-teleports').dispatchEvent(new Event('change'))`);
  assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('#cube-teleports .teleport-marker').length`),61);
  await main.webContents.executeJavaScript(`document.getElementById('cube-show-all').click()`);
  const before=await main.webContents.executeJavaScript(`({scale:cubeScale,size:document.querySelector('#cube-markers g').transform.baseVal.getItem(1).matrix.a})`);
  await main.webContents.executeJavaScript(`document.getElementById('cube-map').dispatchEvent(new KeyboardEvent('keydown',{key:'+'}))`);
  const after=await main.webContents.executeJavaScript(`({scale:cubeScale,size:document.querySelector('#cube-markers g').transform.baseVal.getItem(1).matrix.a})`);
  assert(after.scale>before.scale);assert(after.scale*after.size<before.scale*before.size,'Pointers must shrink visually as zoom increases');
  const center=await main.webContents.executeJavaScript(`(()=>{const rect=document.getElementById('cube-map').getBoundingClientRect();return{x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};})()`);
  const dragStart=await main.webContents.executeJavaScript('cubeX');
  main.webContents.sendInputEvent({type:'mouseDown',x:center.x,y:center.y,button:'left',clickCount:1});
  main.webContents.sendInputEvent({type:'mouseMove',x:center.x+50,y:center.y+20,button:'left'});
  main.webContents.sendInputEvent({type:'mouseUp',x:center.x+50,y:center.y+20,button:'left',clickCount:1});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert((await main.webContents.executeJavaScript('cubeX'))>dragStart,'Dragging pans the map');
  const wheelStart=await main.webContents.executeJavaScript('cubeScale');
  main.webContents.sendInputEvent({type:'mouseWheel',x:center.x,y:center.y,deltaX:0,deltaY:80,canScroll:true,hasPreciseScrollingDeltas:true});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert((await main.webContents.executeJavaScript('cubeScale'))>wheelStart,'Mouse wheel zooms the map');
  await main.webContents.executeJavaScript(`document.getElementById('cube-map').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'}));document.getElementById('cube-map').dispatchEvent(new KeyboardEvent('keydown',{key:'Home'}))`);
  await main.webContents.executeJavaScript(`document.getElementById('cube-search').value='Moslan';document.getElementById('cube-search').dispatchEvent(new Event('input'));document.querySelector('[data-cube-only]').click();document.getElementById('cube-marker-size').value='1.3';document.getElementById('cube-marker-size').dispatchEvent(new Event('input'))`);
  const selected=await main.webContents.executeJavaScript(`JSON.stringify(data.cubeAreas.Altgard)`);
  const gatherRegion=await main.webContents.executeJavaScript(`document.getElementById('map-region').value`);
  const reloaded=new Promise(resolve=>main.webContents.once('did-finish-load',resolve));main.webContents.reload();await reloaded;
  await main.webContents.executeJavaScript(`document.getElementById('cubes-tab').click()`);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('cube-region').value`),'Altgard');
  assert.equal(await main.webContents.executeJavaScript(`JSON.stringify(data.cubeAreas.Altgard)`),selected);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('cube-marker-size').value`),'1.3');
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('cube-show-teleports').checked`),true);
  assert.equal(await main.webContents.executeJavaScript(`document.getElementById('map-region').value`),gatherRegion);
  for(const [width,height] of [[1280,800],[1920,1080],[520,700]]){
    main.setContentSize(width,height);await new Promise(resolve=>setTimeout(resolve,180));
    const sizes=await main.webContents.executeJavaScript(`({page:document.documentElement.scrollWidth,viewport:innerWidth,map:document.getElementById('cube-map-stage').getBoundingClientRect().toJSON(),catalog:document.querySelector('.cube-catalog').getBoundingClientRect().toJSON()})`);
    assert(sizes.page<=sizes.viewport,'No page horizontal overflow');assert(sizes.map.height>200);if(width>650)assert(sizes.map.x>=sizes.catalog.right);
    await fs.writeFile(path.join(output,`cubes-${width}.png`),(await main.webContents.capturePage()).toPNG());
  }
  main.setContentSize(1280,800);
  await main.webContents.executeJavaScript(`document.getElementById('cube-show-all').click();document.getElementById('cube-region').value='Verteron';document.getElementById('cube-region').dispatchEvent(new Event('change'));document.getElementById('cube-show-all').click()`);
  await new Promise(resolve=>setTimeout(resolve,200));
  await fs.writeFile(path.join(output,'cubes-verteron.png'),(await main.webContents.capturePage()).toPNG());
  for(const name of ['gather','timers','abyss','notes','settings','cubes']){
    await main.webContents.executeJavaScript(`document.getElementById('${name}-tab').click()`);
    assert.equal(await main.webContents.executeJavaScript(`document.querySelectorAll('main:not([hidden])').length===1&&!document.getElementById('${name}-panel').hidden`),true);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,cubes:{Verteron:1440,Altgard:1371},filtering:true,persistence:true,zoomScaling:true,teleports:true,responsiveWidths:[1280,1920,520],allTabs:true},null,2));
  console.log('PASS: cube data, filtering, persisted selections, map controls, responsive layout, and tab navigation.');app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
