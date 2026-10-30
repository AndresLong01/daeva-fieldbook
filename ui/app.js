'use strict';
const resources = fieldAtlas.resources;
const knownSpots = fieldAtlas.spots;
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data = {notes:[],notePins:[],favorites:[],markers:[],mapImages:{},markerSize:1,showTeleports:false,bossTimers:{},abyssClockOffset:540,gatherRegion:'Verteron'};
let storageAvailable = true;
try {
  const saved = localStorage.getItem('daeva-fieldbook-v1');
  if(saved) {
    const parsed = JSON.parse(saved);
    if(!parsed || !Array.isArray(parsed.notes) || !Array.isArray(parsed.favorites) || !parsed.notes.every(n => n && typeof n.id==='string' && typeof n.title==='string' && typeof n.body==='string' && typeof n.tag==='string')) throw new Error('Invalid notebook');
    data = {...data,...parsed};
    if(!Array.isArray(data.notePins))data.notePins=[];
    data.notePins=[...new Set(data.notePins.filter(id=>typeof id==='string'&&data.notes.some(note=>note.id===id)))].slice(0,20);
    if(!Array.isArray(data.markers))data.markers=[];
    data.markers=data.markers.filter(m=>m&&typeof m.id==='string'&&resources.some(r=>r.id===m.resource&&r.regions[m.region])&&Number.isFinite(m.x)&&m.x>=0&&m.x<=1000&&Number.isFinite(m.y)&&m.y>=0&&m.y<=1000);
    if(!data.mapImages||typeof data.mapImages!=='object'||Array.isArray(data.mapImages))data.mapImages={};
    if(!Number.isFinite(data.markerSize)||data.markerSize<0.7||data.markerSize>1.6)data.markerSize=1;
    if(typeof data.showTeleports!=='boolean')data.showTeleports=false;
    if(!data.bossTimers||typeof data.bossTimers!=='object'||Array.isArray(data.bossTimers))data.bossTimers={};
    data.bossTimers=Object.fromEntries(Object.entries(data.bossTimers).filter(([key,value])=>fieldAtlas.bosses.some(b=>`${b.region}:${b.id}`===key)&&value&&Number.isFinite(value.dueAt)&&value.dueAt>0&&Number.isFinite(value.recordedAt)&&['manual','kill'].includes(value.source)));
    if(!Object.hasOwn(fieldAtlas.maps,data.gatherRegion))data.gatherRegion='Verteron';
    if(!Number.isInteger(data.abyssClockOffset)||data.abyssClockOffset < -720||data.abyssClockOffset > 840)data.abyssClockOffset=540;
  }
} catch { storageAvailable = false; }
let category='All', favoritesOnly=false, selectedResource='aria', selectedNote=null, deletedNote=null;
let toastTimeout;
let gatherGoals = [];
let selectedGoalId = null;
let itemVariants = {};
function renderGoal() {
  $('goal-active').hidden=!gatherGoals.length;
  $('goal-clear').hidden=!gatherGoals.length;
  $('goal-active-name').textContent=`${gatherGoals.length} active`;
  $('goal-count').textContent=`${gatherGoals.reduce((sum,item)=>sum+item.current,0)} / ${gatherGoals.reduce((sum,item)=>sum+item.target,0)}`;
  $('goal-active').title=gatherGoals.map(item=>item.name).join(' · ');
  $('goal-list').innerHTML=gatherGoals.length?`<div class="goal-list-heading">ACTIVE GOALS</div>${gatherGoals.map(item=>`<div class="goal-list-row ${item.itemId===selectedGoalId?'selected':''}"><button class="goal-select" data-goal-select="${item.itemId}" title="Select ${escapeHTML(item.name)} goal"><strong>${escapeHTML(item.name)}</strong><span>${item.current} / ${item.target}</span></button><button data-goal-adjust="${item.itemId}" data-amount="-1" aria-label="Remove one ${escapeHTML(item.name)}" ${item.current===0?'disabled':''}>−</button><button data-goal-adjust="${item.itemId}" data-amount="1" aria-label="Add one ${escapeHTML(item.name)}" ${item.current>=item.target?'disabled':''}>+</button><button data-goal-remove="${item.itemId}" aria-label="Remove ${escapeHTML(item.name)} goal">×</button></div>`).join('')}`:'';
}
function renderVariantOptions() {
  const resource=$('goal-resource-select').value;
  const items=itemVariants[resource]||[];
  $('goal-variant-options').innerHTML=items.map(item=>`<label><input type="checkbox" value="${item.id}" ${gatherGoals.some(goal=>goal.itemId===item.id)?'checked':''}> ${escapeHTML(item.name)}</label>`).join('');
  $('goal-set').disabled=!items.length;
}
let mapScale=1, mapX=0, mapY=0, mapDrag=null;
$('map-region').value=data.gatherRegion;
$('marker-size').value=String(data.markerSize);
$('show-teleports').checked=data.showTeleports;
if(!window.desktop) document.body.classList.add('browser-preview');

function notify(message,undo=false) {
  clearTimeout(toastTimeout); $('toast-message').textContent=message; $('undo-delete').hidden=!undo; $('toast').hidden=false;
  toastTimeout=setTimeout(()=>{$('toast').hidden=true;if(undo)deletedNote=null;},undo?6500:3500);
}
function persist() {
  try {
    if(!storageAvailable) throw new Error('Unreadable existing notebook');
    localStorage.setItem('daeva-fieldbook-v1',JSON.stringify(data));
    return true;
  } catch {
    notify('Could not save locally. Please check available storage.');
    return false;
  }
}
function switchTab(tab) {
  for(const name of ['gather','cubes','timers','abyss','notes','settings']) { $(name+'-panel').hidden=tab!==name;const btn=$(name+'-tab');btn.classList.toggle('active',tab===name); if(tab===name)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current'); }
}
function updateMapTransform() {
  $('map-world').setAttribute('transform',`translate(${mapX} ${mapY}) scale(${mapScale})`);
  const markerLayer=$('map-markers');
  const markerSizing=`${mapScale}:${data.markerSize}`;
  if(markerLayer.dataset.zoom!==markerSizing) {
    // Keep each spot anchored while making its visible pointer smaller as the map zooms in.
    const symbolScale=1.5*data.markerSize/Math.pow(mapScale,1.3);
    for(const marker of markerLayer.children) marker.setAttribute('transform',`translate(${marker.dataset.x} ${marker.dataset.y}) scale(${symbolScale})`);
    markerLayer.dataset.zoom=markerSizing;
  }
}
function renderMap() {
  const region=$('map-region').value;
  const resource=resources.find(r=>r.id===selectedResource);
  const markers=data.markers.filter(m=>m.resource===selectedResource&&m.region===region);
  const reference=knownSpots.filter(m=>m.resource===selectedResource&&m.region===region);
  const teleports=data.showTeleports?fieldAtlas.teleports.filter(m=>m.region===region):[];
  $('map-resource-name').textContent=resource?`${resource.name} Locations`:'Gathering Locations';
  $('map-resource-context').textContent=`${region.toUpperCase()} / ${resource?resource.category.toUpperCase():'GATHERABLES'}`;
  $('map-canvas-label').textContent=region.toUpperCase();
  $('map-empty').hidden=markers.length+reference.length>0;
  $('map-empty').textContent=resource?'No known locations for this resource in this region.':'No gatherables match these filters.';
  $('map-markers').innerHTML=reference.map(m=>`<g class="map-marker known-marker" data-x="${m.x}" data-y="${m.y}" transform="translate(${m.x} ${m.y})"><circle r="7"/><circle r="2"/><title>${escapeHTML(resource.name)} · possible spawn location</title></g>`).join('')+markers.map(m=>`<g class="map-marker" data-marker="${escapeHTML(m.id)}" data-x="${m.x}" data-y="${m.y}" transform="translate(${m.x} ${m.y})"><circle r="9"/><circle r="3"/><title>${escapeHTML(resource.name)} · your saved spot. Right-click to remove.</title></g>`).join('')+teleports.map(m=>`<g class="map-marker teleport-marker" data-x="${m.x}" data-y="${m.y}" transform="translate(${m.x} ${m.y})"><path d="M0 -8 7 0 0 8 -7 0Z"/><path d="M-2 0H2M0 -2V2"/><title>Teleport statue · ${escapeHTML(m.name)}</title></g>`).join('');
  $('map-markers').dataset.zoom='';
  updateMapTransform();
  const image=fieldAtlas.maps[region];
  $('map-image').hidden=false;
  $('map-image').setAttribute('href',image);
  $('map-hint').textContent=`${reference.length} possible spawns · ${markers.length} saved by you${data.showTeleports?' · '+teleports.length+' teleport statues':''} · Drag to pan · Scroll to zoom`;
}
function renderResources() {
  const query=$('search').value.trim().toLowerCase(),region=$('map-region').value;
  const regional=resources.filter(r=>Object.hasOwn(r.regions,region));
  const shown=regional.filter(r=>(category==='All'||r.category===category)&&(!favoritesOnly||data.favorites.includes(r.id))&&`${r.name} ${r.category}`.toLowerCase().includes(query));
  shown.sort((a,b)=>a.name.localeCompare(b.name));
  if(!shown.some(r=>r.id===selectedResource))selectedResource=shown[0]?.id||null;
  for(const button of $('resource-filters').querySelectorAll('[data-category]')){
    const active=!favoritesOnly&&button.dataset.category===category;
    button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
  $('favorites-filter').classList.toggle('active',favoritesOnly);$('favorites-filter').setAttribute('aria-selected',String(favoritesOnly));$('favorites-filter').tabIndex=favoritesOnly?0:-1;
  $('all-resource-count').textContent=regional.length;
  $('gather-count').textContent=regional.length;
  $('results-count').textContent=`${shown.length} resource${shown.length===1?'':'s'}${favoritesOnly?' · favorites':''}`;
  $('no-results').hidden=shown.length>0;
  $('resource-list').innerHTML=shown.map(r=>`<div class="resource-row ${r.id===selectedResource?'selected':''}"><button class="resource-main" data-resource="${r.id}" aria-pressed="${r.id===selectedResource}"><span><span class="resource-name">${r.name}</span><span class="resource-region">${r.category}</span></span><span class="row-count">${knownSpots.filter(m=>m.resource===r.id&&m.region===region).length}<small>KNOWN</small></span></button><button class="star" data-favorite="${r.id}" aria-label="Favorite ${r.name}" aria-pressed="${data.favorites.includes(r.id)}">${data.favorites.includes(r.id)?'★':'☆'}</button></div>`).join('');
  renderGoal();renderMap();
}
function renderNotes() {
  $('note-count').textContent=data.notes.length;
  const query=$('note-search').value.toLowerCase().trim();
  const shown=data.notes.filter(n=>`${n.title} ${n.body} ${n.tag}`.toLowerCase().includes(query)).sort((a,b)=>(b.updated||0)-(a.updated||0));
  $('note-list').innerHTML=shown.length?shown.map(n=>`<button class="note-item ${n.id===selectedNote?'active':''}" data-note="${escapeHTML(n.id)}" aria-pressed="${n.id===selectedNote}"><strong>${escapeHTML(n.title||'Untitled note')}</strong><p>${escapeHTML(n.body.replace(/\s+/g,' ').slice(0,90)||'Your next discovery starts here…')}</p><small>${escapeHTML(n.tag)}${n.resource?' · '+escapeHTML(resources.find(r=>r.id===n.resource)?.name||'Resource'):''}</small></button>`).join(''):`<p class="notes-empty">${query?'No matching notes.':'No Notes Saved'}</p>`;
  $('pin-selected-note').disabled=!selectedNote;
  $('pin-selected-note').setAttribute('aria-pressed',String(data.notePins.includes(selectedNote)));
  $('pin-selected-note').setAttribute('aria-label',`${data.notePins.includes(selectedNote)?'Unpin':'Pin'} note ${data.notePins.includes(selectedNote)?'from':'to'} game overlay`);
  $('pin-selected-note').title=data.notePins.includes(selectedNote)?'Unpin note':'Pin note';
  if(window.desktop?.noteOverlaySnapshot)window.desktop.noteOverlaySnapshot(data.notePins.map(id=>data.notes.find(note=>note.id===id)).filter(Boolean).map(note=>({id:note.id,title:note.title||'Untitled note',body:note.body})));
}
function openNote(id) {
  selectedNote=id; const note=data.notes.find(n=>n.id===id);
  $('editor-empty').hidden=Boolean(note);$('editor-fields').hidden=!note;
  if(note) {
    $('note-title').value=note.title; $('note-body').value=note.body; $('note-tag').value=note.tag;
    const resource=resources.find(r=>r.id===note.resource);
    $('linked-resource').innerHTML=resource?`<button data-linked-resource="${resource.id}">↗ ${resource.name}</button>`:'';
    $('word-count').textContent=`${note.body.trim()?note.body.trim().split(/\s+/).length:0} words`;
  }
  renderNotes();
}
function createNote(resourceId=null) {
  const resource=resources.find(r=>r.id===resourceId);
  const note={id:crypto.randomUUID(),title:resource?`${resource.name} — field notes`:'',body:'',tag:resource?'Gathering':'General',resource:resource?.id||null,updated:Date.now()};
  data.notes.unshift(note);$('note-search').value='';persist();switchTab('notes');openNote(note.id);$(resource?'note-body':'note-title').focus();
}

$('gather-tab').addEventListener('click',()=>switchTab('gather'));
if (window.desktop) {
  window.desktop.goalVariantsGet().then(variants=>{itemVariants=variants;renderVariantOptions();renderGoal();}).catch(()=>{});
  window.desktop.onGoal(goals=>{gatherGoals=goals;selectedGoalId=gatherGoals.some(item=>item.itemId===selectedGoalId)?selectedGoalId:gatherGoals[0]?.itemId||null;renderGoal();});
  window.desktop.goalGet().then(goals=>{gatherGoals=goals;selectedGoalId=gatherGoals[0]?.itemId||null;renderGoal();}).catch(()=>{});
  window.desktop.onGoalCaptureStatus(status=>{$('goal-mode').textContent=status;});
  window.desktop.goalCaptureStatus().then(status=>{$('goal-mode').textContent=status;}).catch(()=>{});
}
$('goal-resource-select').innerHTML=[...resources].sort((a,b)=>a.name.localeCompare(b.name)).map(resource=>`<option value="${resource.id}">${escapeHTML(resource.name)}</option>`).join('');
$('goal-resource-select').addEventListener('change',renderVariantOptions);
$('open-goal').addEventListener('click',()=>{
  $('goal-resource-select').value=selectedResource||resources[0].id;
  renderVariantOptions();
  $('goal-target').value=String(gatherGoals.find(goal=>goal.resource===$('goal-resource-select').value)?.target||40);
  $('goal-dialog').showModal();
  $('goal-target').focus();
  $('goal-target').select();
});
$('goal-close').addEventListener('click',()=>$('goal-dialog').close());
$('goal-set').addEventListener('click',async()=>{
  const resource=resources.find(r=>r.id===$('goal-resource-select').value);
  const items=[...$('goal-variant-options').querySelectorAll('input:checked')].map(input=>Number(input.value));
  const target=Number($('goal-target').value);
  if(!resource||!Number.isInteger(target)||target<1||target>99999){notify('Enter a whole-number goal from 1 to 99,999.');return;}
  if(!items.length){notify('Select at least one item type to count.');return;}
  if(!window.desktop){notify('The in-game overlay requires the installed desktop app.');return;}
  try{gatherGoals=await window.desktop.goalSet({resource:resource.id,target,items});selectedGoalId=items[0];await window.desktop.goalSelect(selectedGoalId);renderGoal();renderVariantOptions();notify(`${items.length} ${resource.name} goal${items.length===1?'':'s'} added.`);}catch{notify('Could not add the goals.');}
});
$('goal-target').addEventListener('keydown',event=>{if(event.key==='Enter'){$('goal-set').click();event.preventDefault();}});
async function clearGoal(){try{gatherGoals=await window.desktop.goalSet(null);selectedGoalId=null;renderGoal();$('goal-dialog').close();notify('All gathering goals cleared.');}catch{notify('Could not clear the goals.');}}
$('goal-clear').addEventListener('click',clearGoal);
$('goal-clear-all').addEventListener('click',clearGoal);
$('goal-list').addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||!window.desktop)return;
  if(button.dataset.goalSelect){selectedGoalId=Number(button.dataset.goalSelect);await window.desktop.goalSelect(selectedGoalId);renderGoal();}
  if(button.dataset.goalAdjust){try{gatherGoals=await window.desktop.goalAdjust(Number(button.dataset.goalAdjust),Number(button.dataset.amount));renderGoal();}catch{notify('Could not update the goal.');}}
  if(button.dataset.goalRemove){try{gatherGoals=await window.desktop.goalRemove(Number(button.dataset.goalRemove));selectedGoalId=gatherGoals[0]?.itemId||null;renderGoal();renderVariantOptions();}catch{notify('Could not remove the goal.');}}
});
$('timers-tab').addEventListener('click',()=>switchTab('timers'));
$('abyss-tab').addEventListener('click',()=>switchTab('abyss'));
$('notes-tab').addEventListener('click',()=>switchTab('notes'));
$('settings-tab').addEventListener('click',()=>switchTab('settings'));
$('search').addEventListener('input',renderResources);
$('resource-filters').addEventListener('click',event=>{
  const button=event.target.closest('[role=tab]');if(!button)return;
  favoritesOnly=button.id==='favorites-filter';category=button.dataset.category||'All';renderResources();
});
$('resource-filters').addEventListener('keydown',event=>{
  const tabs=[...$('resource-filters').querySelectorAll('[role=tab]')];
  const index=tabs.indexOf(document.activeElement);if(index<0)return;
  let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
  event.preventDefault();tabs[next].click();tabs[next].focus();
});
$('clear-filters').addEventListener('click',()=>{
  $('search').value='';category='All';favoritesOnly=false;
  renderResources();$('search').focus();
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button'); if(!button)return;
  if(button.hasAttribute('data-resource')){selectedResource=button.dataset.resource;renderResources();}
  if(button.hasAttribute('data-favorite')){const id=button.dataset.favorite;data.favorites=data.favorites.includes(id)?data.favorites.filter(x=>x!==id):[...data.favorites,id];persist();renderResources();}
  if(button.hasAttribute('data-note-resource'))createNote(button.dataset.noteResource);
  if(button.hasAttribute('data-note'))openNote(button.dataset.note);
  if(button.hasAttribute('data-linked-resource')) {
    selectedResource=button.dataset.linkedResource;$('search').value='';category='All';favoritesOnly=false;
    const linked=resources.find(r=>r.id===selectedResource);
    if(linked&&!Object.hasOwn(linked.regions,$('map-region').value)){$('map-region').value=Object.keys(linked.regions)[0];data.gatherRegion=$('map-region').value;persist();mapScale=1;mapX=0;mapY=0;}
    renderResources();switchTab('gather');
  }
});
for(const id of ['new-note','first-note'])$(id).addEventListener('click',()=>createNote());
$('pin-selected-note').addEventListener('click',()=>{if(!selectedNote)return;data.notePins=data.notePins.includes(selectedNote)?data.notePins.filter(id=>id!==selectedNote):[...data.notePins,selectedNote].slice(0,20);persist();renderNotes();});
$('note-search').addEventListener('input',renderNotes);
for(const id of ['note-title','note-body','note-tag'])$(id).addEventListener('input',()=>{
  const note=data.notes.find(n=>n.id===selectedNote);if(!note)return;
  note.title=$('note-title').value;note.body=$('note-body').value;note.tag=$('note-tag').value;note.updated=Date.now();
  $('word-count').textContent=`${note.body.trim()?note.body.trim().split(/\s+/).length:0} words`;persist();renderNotes();
});
$('delete-note').addEventListener('click',()=>$('delete-dialog').showModal());
$('cancel-delete').addEventListener('click',()=>$('delete-dialog').close());
$('confirm-delete').addEventListener('click',()=>{
  const index=data.notes.findIndex(n=>n.id===selectedNote);if(index<0)return;
  deletedNote=data.notes.splice(index,1)[0];deletedNote.wasPinned=data.notePins.includes(deletedNote.id);data.notePins=data.notePins.filter(id=>id!==deletedNote.id);persist();openNote(data.notes[0]?.id||null);$('delete-dialog').close();notify('Note deleted.',true);
});
$('undo-delete').addEventListener('click',()=>{if(!deletedNote)return;data.notes.unshift(deletedNote);if(deletedNote.wasPinned)data.notePins.push(deletedNote.id);delete deletedNote.wasPinned;persist();openNote(deletedNote.id);deletedNote=null;clearTimeout(toastTimeout);$('toast').hidden=true;});
$('dismiss-toast').addEventListener('click',()=>{clearTimeout(toastTimeout);deletedNote=null;$('toast').hidden=true;});
$('map-region').addEventListener('change',()=>{data.gatherRegion=$('map-region').value;persist();mapScale=1;mapX=0;mapY=0;renderResources();});
$('map-reset').addEventListener('click',()=>{mapScale=1;mapX=0;mapY=0;updateMapTransform();});
$('marker-size').addEventListener('input',event=>{data.markerSize=Number(event.target.value);updateMapTransform();});
$('marker-size').addEventListener('change',persist);
$('show-teleports').addEventListener('change',event=>{data.showTeleports=event.target.checked;persist();renderMap();});
$('local-map').addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('[data-marker]'))return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('local-map').getScreenCTM().inverse());
  mapDrag={x:event.clientX,y:event.clientY,baseX:point.x,baseY:point.y,startX:mapX,startY:mapY,moved:false};
  $('local-map').setPointerCapture(event.pointerId);
});
$('local-map').addEventListener('pointermove',event=>{
  if(!mapDrag)return;
  const dx=event.clientX-mapDrag.x,dy=event.clientY-mapDrag.y;
  if(Math.abs(dx)+Math.abs(dy)>4)mapDrag.moved=true;
  if(mapDrag.moved){
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('local-map').getScreenCTM().inverse());
    mapX=mapDrag.startX+point.x-mapDrag.baseX;mapY=mapDrag.startY+point.y-mapDrag.baseY;
    updateMapTransform();
  }
});
$('local-map').addEventListener('pointerup',event=>{
  mapDrag=null;
});
$('local-map').addEventListener('wheel',event=>{
  event.preventDefault();
  const base=new DOMPoint(event.clientX,event.clientY).matrixTransform($('local-map').getScreenCTM().inverse());
  const worldX=(base.x-mapX)/mapScale,worldY=(base.y-mapY)/mapScale;
  mapScale=Math.max(1,Math.min(5,mapScale*(event.deltaY<0?1.16:1/1.16)));
  mapX=base.x-worldX*mapScale;mapY=base.y-worldY*mapScale;
  updateMapTransform();
},{passive:false});
$('map-markers').addEventListener('contextmenu',event=>{
  const marker=event.target.closest('[data-marker]');if(!marker)return;
  event.preventDefault();
  if(!confirm('Remove this saved gathering spot?'))return;
  data.markers=data.markers.filter(m=>m.id!==marker.dataset.marker);
  persist();renderResources();notify('Spot removed.');
});
$('export-spots').addEventListener('click',()=>{
  const contents=JSON.stringify({format:'daeva-fieldbook-spots',version:1,markers:data.markers},null,2);
  const url=URL.createObjectURL(new Blob([contents],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='Daeva-field-spots.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('import-spots-button').addEventListener('click',()=>$('import-spots-input').click());
$('import-spots-input').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>2000000)throw new Error('File too large');
    const imported=JSON.parse(await file.text());
    if(imported.format!=='daeva-fieldbook-spots'||imported.version!==1||!Array.isArray(imported.markers)||imported.markers.length>10000||!imported.markers.every(m=>typeof m.id==='string'&&m.id.length<100&&resources.some(r=>r.id===m.resource&&r.regions[m.region])&&Number.isFinite(m.x)&&m.x>=0&&m.x<=1000&&Number.isFinite(m.y)&&m.y>=0&&m.y<=1000))throw new Error('Invalid spots file');
    const ids=new Set(data.markers.map(m=>m.id));let added=0;
    for(const marker of imported.markers)if(!ids.has(marker.id)){data.markers.push({id:marker.id,resource:marker.resource,region:marker.region,x:marker.x,y:marker.y,source:'imported',createdAt:marker.createdAt||Date.now()});ids.add(marker.id);added++;}
    persist();renderResources();notify(`${added} spot${added===1?'':'s'} imported.`);
  }catch{notify('Could not import spots. Choose a Fieldbook spots JSON file.');}
  event.target.value='';
});
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();switchTab('gather');$('search').focus();$('search').select();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='n'){event.preventDefault();createNote();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();persist();}
});
renderResources();openNote(data.notes[0]?.id||null);
