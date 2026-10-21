'use strict';
if(!Object.hasOwn(cubeAtlas.maps,data.cubeRegion))data.cubeRegion='Verteron';
if(!data.cubeAreas||typeof data.cubeAreas!=='object'||Array.isArray(data.cubeAreas))data.cubeAreas={};
for(const [region,map] of Object.entries(cubeAtlas.maps)){
  data.cubeAreas[region]=Array.isArray(data.cubeAreas[region])?[...new Set(data.cubeAreas[region].filter(id=>map.areas.some(area=>area.id===id)))]:map.areas.map(area=>area.id);
}
if(!Number.isFinite(data.cubeMarkerSize)||data.cubeMarkerSize<.7||data.cubeMarkerSize>1.6)data.cubeMarkerSize=data.markerSize;
if(typeof data.cubeTeleports!=='boolean')data.cubeTeleports=data.showTeleports;
$('cube-region').value=data.cubeRegion;
$('cube-marker-size').value=String(data.cubeMarkerSize);
$('cube-show-teleports').checked=data.cubeTeleports;
let cubeScale=1,cubeX=0,cubeY=0,cubeDrag=null,visibleCubeSpots=[];
function updateCubeMapTransform(){
  $('cube-world').setAttribute('transform',`translate(${cubeX} ${cubeY}) scale(${cubeScale})`);
  const size=1.5*data.cubeMarkerSize/Math.pow(cubeScale,1.3);
  for(const marker of [...$('cube-markers').children,...$('cube-teleports').children])marker.setAttribute('transform',`translate(${marker.dataset.x} ${marker.dataset.y}) scale(${size})`);
}
function fitCubeLocations(){
  if(!visibleCubeSpots.length){cubeScale=1;cubeX=0;cubeY=0;}
  else{
    const xs=visibleCubeSpots.map(spot=>spot.x),ys=visibleCubeSpots.map(spot=>spot.y);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    cubeScale=Math.max(.7,Math.min(5,880/(right-left+50),580/(bottom-top+50)));
    cubeX=500-(left+right)/2*cubeScale;cubeY=500-(top+bottom)/2*cubeScale;
  }
  updateCubeMapTransform();
}
function renderCubes(){
  const map=cubeAtlas.maps[data.cubeRegion],query=$('cube-search').value.trim().toLowerCase();
  const areas=map.areas.filter(area=>area.name.toLowerCase().includes(query));
  const selected=new Set(data.cubeAreas[data.cubeRegion]);
  areas.sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id))||a.name.localeCompare(b.name));
  const shown=new Set(areas.filter(area=>selected.has(area.id)).map(area=>area.id));
  visibleCubeSpots=map.spots.filter(spot=>shown.has(spot.area));
  const names=new Map(map.areas.map(area=>[area.id,area.name]));
  const counts=new Map();for(const spot of map.spots)counts.set(spot.area,(counts.get(spot.area)||0)+1);
  $('cube-area-list').innerHTML=areas.map(area=>`<div class="cube-area-row"><label><input type="checkbox" data-cube-area="${escapeHTML(area.id)}" ${selected.has(area.id)?'checked':''}><span>${escapeHTML(area.name)}</span><small>${counts.get(area.id)}</small></label><button type="button" data-cube-only="${escapeHTML(area.id)}" aria-label="Show only ${escapeHTML(area.name)}" title="Show only this subregion">Only</button></div>`).join('');
  $('cube-no-results').hidden=areas.length>0;
  $('cube-selection-summary').textContent=`${shown.size} / ${map.areas.length} subregions shown`;
  $('cube-map-context').textContent=`${data.cubeRegion.toUpperCase()} / ${shown.size===1?names.get([...shown][0]).toUpperCase():shown.size===map.areas.length?'ALL SUBREGIONS':`${shown.size} SUBREGIONS`}`;
  $('cube-map-image').setAttribute('href',fieldAtlas.maps[data.cubeRegion]);
  $('cube-map').setAttribute('aria-label',`${data.cubeRegion}: ${visibleCubeSpots.length} possible hidden cube locations. Arrow keys pan, plus and minus zoom, Home fits locations.`);
  $('cube-markers').innerHTML=visibleCubeSpots.map(spot=>`<g class="cube-marker" data-cube="${escapeHTML(spot.id)}" data-area="${escapeHTML(spot.area)}" data-x="${spot.x}" data-y="${spot.y}"><path d="M0 -7 6 -3.5 6 3.5 0 7 -6 3.5 -6 -3.5Z"/><path d="M-6 -3.5 0 0 6 -3.5M0 0V7"/><title>Hidden Cube · ${escapeHTML(names.get(spot.area))} · possible spawn</title></g>`).join('');
  $('cube-teleports').innerHTML=data.cubeTeleports?fieldAtlas.teleports.filter(spot=>spot.region===data.cubeRegion).map(spot=>`<g class="teleport-marker" data-x="${spot.x}" data-y="${spot.y}"><path d="M0 -8 7 0 0 8 -7 0Z"/><path d="M-2 0H2M0 -2V2"/><title>Teleport statue · ${escapeHTML(spot.name)}</title></g>`).join(''):'';
  $('cube-map-empty').hidden=visibleCubeSpots.length>0;
  $('cube-map-empty').textContent=areas.length?'Select a subregion to show its cube locations.':'No subregions match your search.';
  $('cube-map-hint').textContent=`${visibleCubeSpots.length.toLocaleString()} / ${map.spots.length.toLocaleString()} possible locations · Drag to pan · Scroll to zoom`;
  updateCubeMapTransform();
}
$('cubes-tab').addEventListener('click',()=>switchTab('cubes'));
$('cube-region').addEventListener('change',()=>{data.cubeRegion=$('cube-region').value;$('cube-search').value='';persist();renderCubes();fitCubeLocations();});
$('cube-search').addEventListener('input',()=>{renderCubes();fitCubeLocations();});
$('cube-area-list').addEventListener('change',event=>{
  const id=event.target.dataset.cubeArea;if(!id)return;
  const selected=new Set(data.cubeAreas[data.cubeRegion]);if(event.target.checked)selected.add(id);else selected.delete(id);
  data.cubeAreas[data.cubeRegion]=[...selected];persist();renderCubes();
  $('cube-area-list').querySelector(`[data-cube-area="${CSS.escape(id)}"]`)?.focus();
});
$('cube-area-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-cube-only]');if(!button)return;
  const id=button.dataset.cubeOnly;data.cubeAreas[data.cubeRegion]=[id];persist();renderCubes();fitCubeLocations();
  $('cube-area-list').querySelector(`[data-cube-only="${CSS.escape(id)}"]`)?.focus();
});
$('cube-show-all').addEventListener('click',()=>{data.cubeAreas[data.cubeRegion]=cubeAtlas.maps[data.cubeRegion].areas.map(area=>area.id);$('cube-search').value='';persist();renderCubes();fitCubeLocations();});
$('cube-clear').addEventListener('click',()=>{data.cubeAreas[data.cubeRegion]=[];persist();renderCubes();});
$('cube-show-teleports').addEventListener('change',event=>{data.cubeTeleports=event.target.checked;persist();renderCubes();});
$('cube-marker-size').addEventListener('input',event=>{data.cubeMarkerSize=Number(event.target.value);persist();updateCubeMapTransform();});
$('cube-map-reset').addEventListener('click',fitCubeLocations);
$('cube-map').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('cube-map').getScreenCTM().inverse());
  cubeDrag={x:point.x,y:point.y,startX:cubeX,startY:cubeY};$('cube-map').setPointerCapture(event.pointerId);
});
$('cube-map').addEventListener('pointermove',event=>{
  if(!cubeDrag)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('cube-map').getScreenCTM().inverse());
  cubeX=cubeDrag.startX+point.x-cubeDrag.x;cubeY=cubeDrag.startY+point.y-cubeDrag.y;updateCubeMapTransform();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('cube-map').addEventListener(name,()=>{cubeDrag=null;});
$('cube-map').addEventListener('wheel',event=>{
  event.preventDefault();const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('cube-map').getScreenCTM().inverse());
  const x=(point.x-cubeX)/cubeScale,y=(point.y-cubeY)/cubeScale;
  cubeScale=Math.max(.7,Math.min(5,cubeScale*(event.deltaY<0?1.16:1/1.16)));cubeX=point.x-x*cubeScale;cubeY=point.y-y*cubeScale;
  updateCubeMapTransform();
},{passive:false});
$('cube-map').addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
    event.preventDefault();cubeX+=event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0;cubeY+=event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0;updateCubeMapTransform();
  }else if(['+','=','-'].includes(event.key)){
    event.preventDefault();const x=(500-cubeX)/cubeScale,y=(500-cubeY)/cubeScale;
    cubeScale=Math.max(.7,Math.min(5,cubeScale*(event.key==='-'?1/1.16:1.16)));cubeX=500-x*cubeScale;cubeY=500-y*cubeScale;updateCubeMapTransform();
  }else if(event.key==='Home'){event.preventDefault();fitCubeLocations();}
});
renderCubes();fitCubeLocations();
