'use strict';
if(!Object.hasOwn(petAtlas.maps,data.petRegion))data.petRegion='Verteron';
if(!petAtlas.categories.includes(data.petCategory))data.petCategory='All';
if(!data.petSelections||typeof data.petSelections!=='object'||Array.isArray(data.petSelections))data.petSelections={};
for(const [region,map] of Object.entries(petAtlas.maps)){
  data.petSelections[region]=Array.isArray(data.petSelections[region])?[...new Set(data.petSelections[region].filter(id=>map.pets.some(pet=>pet.id===id)))]:map.pets.map(pet=>pet.id);
}
if(!Number.isFinite(data.petMarkerSize)||data.petMarkerSize<.7||data.petMarkerSize>1.6)data.petMarkerSize=data.markerSize;
if(typeof data.petTeleports!=='boolean')data.petTeleports=data.showTeleports;
$('pet-region').value=data.petRegion;
$('pet-category').value=data.petCategory;
$('pet-marker-size').value=String(data.petMarkerSize);
$('pet-show-teleports').checked=data.petTeleports;
let petScale=1,petX=0,petY=0,petDrag=null,visiblePetSpots=[],filteredPets=[];
function updatePetMapTransform(){
  $('pet-world').setAttribute('transform',`translate(${petX} ${petY}) scale(${petScale})`);
  const size=1.5*data.petMarkerSize/Math.pow(petScale,1.3);
  for(const marker of [...$('pet-markers').children,...$('pet-teleports').children])marker.setAttribute('transform',`translate(${marker.dataset.x} ${marker.dataset.y}) scale(${size})`);
}
function fitPetLocations(){
  if(!visiblePetSpots.length){petScale=1;petX=0;petY=0;}
  else{
    const xs=visiblePetSpots.map(spot=>spot.x),ys=visiblePetSpots.map(spot=>spot.y);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    petScale=Math.max(.7,Math.min(5,880/(right-left+50),580/(bottom-top+50)));
    petX=500-(left+right)/2*petScale;petY=500-(top+bottom)/2*petScale;
  }
  updatePetMapTransform();
}
function renderPets(){
  const map=petAtlas.maps[data.petRegion],query=$('pet-search').value.trim().toLowerCase();
  filteredPets=map.pets.filter(pet=>(data.petCategory==='All'||pet.category===data.petCategory)&&pet.name.toLowerCase().includes(query));
  const selected=new Set(data.petSelections[data.petRegion]);
  const shown=new Set(filteredPets.filter(pet=>selected.has(pet.id)).map(pet=>pet.id));
  visiblePetSpots=map.spots.filter(spot=>shown.has(spot.pet));
  const pets=new Map(map.pets.map(pet=>[pet.id,pet]));
  const counts=new Map();for(const spot of map.spots)counts.set(spot.pet,(counts.get(spot.pet)||0)+1);
  $('pet-list').innerHTML=filteredPets.map(pet=>`<label class="pet-row"><input type="checkbox" data-pet="${escapeHTML(pet.id)}" ${selected.has(pet.id)?'checked':''}><span>${escapeHTML(pet.name)}<small>${escapeHTML(pet.category)}</small></span><b title="${counts.get(pet.id)} known locations">${counts.get(pet.id)}</b></label>`).join('');
  $('pet-show-all').checked=filteredPets.length>0&&shown.size===filteredPets.length;
  $('pet-show-all').indeterminate=shown.size>0&&shown.size<filteredPets.length;
  $('pet-show-all').disabled=filteredPets.length===0;
  $('pet-show-all').title='Show or hide every pet matching the current type and search';
  $('pet-filter-count').textContent=`${filteredPets.length} pets`;
  $('pet-no-results').hidden=filteredPets.length>0;
  $('pet-selection-summary').textContent=`${shown.size} / ${filteredPets.length} pets shown · ${visiblePetSpots.length} locations`;
  $('pet-map-context').textContent=`${data.petRegion.toUpperCase()} / ${data.petCategory==='All'?'ALL PETS':data.petCategory.toUpperCase()}`;
  $('pet-map-title').textContent=shown.size===1?`${pets.get([...shown][0]).name} Locations`:'Pet Locations';
  $('pet-map-image').setAttribute('href',fieldAtlas.maps[data.petRegion]);
  $('pet-map').setAttribute('aria-label',`${data.petRegion}: ${visiblePetSpots.length} known pet locations. Arrow keys pan, plus and minus zoom, Home fits locations.`);
  $('pet-markers').innerHTML=visiblePetSpots.map(spot=>`<g class="pet-marker" data-pet="${escapeHTML(spot.pet)}" data-x="${spot.x}" data-y="${spot.y}"><circle r="5"/><title>${escapeHTML(pets.get(spot.pet).name)} · ${escapeHTML(pets.get(spot.pet).category)}</title></g>`).join('');
  $('pet-teleports').innerHTML=data.petTeleports?fieldAtlas.teleports.filter(spot=>spot.region===data.petRegion).map(spot=>`<g class="teleport-marker" data-x="${spot.x}" data-y="${spot.y}"><path d="M0 -8 7 0 0 8 -7 0Z"/><path d="M-2 0H2M0 -2V2"/><title>Teleport statue · ${escapeHTML(spot.name)}</title></g>`).join(''):'';
  $('pet-map-empty').hidden=visiblePetSpots.length>0;
  $('pet-map-empty').textContent=filteredPets.length?'Select pets or check Show all to display locations.':'No pets match your filters.';
  $('pet-map-hint').textContent=`${visiblePetSpots.length} / ${map.spots.length} known locations · Drag to pan · Scroll to zoom`;
  updatePetMapTransform();
}
$('pets-tab').addEventListener('click',()=>switchTab('pets'));
$('pet-region').addEventListener('change',()=>{data.petRegion=$('pet-region').value;$('pet-search').value='';persist();renderPets();fitPetLocations();});
$('pet-category').addEventListener('change',()=>{data.petCategory=$('pet-category').value;persist();renderPets();fitPetLocations();});
$('pet-search').addEventListener('input',()=>{renderPets();fitPetLocations();});
$('pet-list').addEventListener('change',event=>{
  const id=event.target.dataset.pet;if(!id)return;
  const selected=new Set(data.petSelections[data.petRegion]);if(event.target.checked)selected.add(id);else selected.delete(id);
  data.petSelections[data.petRegion]=[...selected];persist();renderPets();
  $('pet-list').querySelector(`[data-pet="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
});
$('pet-show-all').addEventListener('change',event=>{
  const selected=new Set(data.petSelections[data.petRegion]);
  for(const pet of filteredPets){if(event.target.checked)selected.add(pet.id);else selected.delete(pet.id);}
  data.petSelections[data.petRegion]=[...selected];persist();renderPets();
});
$('pet-show-teleports').addEventListener('change',event=>{data.petTeleports=event.target.checked;persist();renderPets();});
$('pet-marker-size').addEventListener('input',event=>{data.petMarkerSize=Number(event.target.value);persist();updatePetMapTransform();});
$('pet-map-reset').addEventListener('click',fitPetLocations);
$('pet-map').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('pet-map').getScreenCTM().inverse());
  petDrag={x:point.x,y:point.y,startX:petX,startY:petY};$('pet-map').setPointerCapture(event.pointerId);
});
$('pet-map').addEventListener('pointermove',event=>{
  if(!petDrag)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('pet-map').getScreenCTM().inverse());
  petX=petDrag.startX+point.x-petDrag.x;petY=petDrag.startY+point.y-petDrag.y;updatePetMapTransform();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('pet-map').addEventListener(name,()=>{petDrag=null;});
$('pet-map').addEventListener('wheel',event=>{
  event.preventDefault();const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('pet-map').getScreenCTM().inverse());
  const x=(point.x-petX)/petScale,y=(point.y-petY)/petScale;
  petScale=Math.max(.7,Math.min(5,petScale*(event.deltaY<0?1.16:1/1.16)));petX=point.x-x*petScale;petY=point.y-y*petScale;
  updatePetMapTransform();
},{passive:false});
$('pet-map').addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
    event.preventDefault();petX+=event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0;petY+=event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0;updatePetMapTransform();
  }else if(['+','=','-'].includes(event.key)){
    event.preventDefault();const x=(500-petX)/petScale,y=(500-petY)/petScale;
    petScale=Math.max(.7,Math.min(5,petScale*(event.key==='-'?1/1.16:1.16)));petX=500-x*petScale;petY=500-y*petScale;updatePetMapTransform();
  }else if(event.key==='Home'){event.preventDefault();fitPetLocations();}
});
renderPets();fitPetLocations();
