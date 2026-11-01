'use strict';
const bosses=fieldAtlas.bosses;
const bossKey=boss=>`${boss.region}:${boss.id}`;
const scheduledEvents=[
  {id:'shugo',name:'Shugo Festival',cycle:3600000,phase:0,duration:180000},
  {id:'invasion',name:'Dimensional Invasion',cycle:3600000,phase:1800000,duration:180000},
  {id:'rift',name:'Spacetime Rift',hours:[2,5,8,11,14,17,20,23],duration:600000},
  // Reported regional schedule, not a live server feed. Checked 2026-10-21:
  // https://atlaschill.es/aion2/battlefield
  {id:'battlefield',name:'Battlefield',windows:[[11,14],[20,22]]}
];
let timerPins=[];
let selectedBossKey=bossKey(bosses.find(b=>b.name==='Eternal Gartua')||bosses[0]);
let timerScale=1,timerX=0,timerY=-80,timerDrag=null;
let liveFeed=null,liveFeedError=false,feedFetchPending=false;

function countdownText(seconds) {
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
  return hours?`${hours}h ${String(minutes).padStart(2,'0')}m`:minutes?`${minutes}m ${String(seconds%60).padStart(2,'0')}s`:`${seconds}s`;
}
function scheduledEventStatus(event,now=Date.now()) {
  if(event.windows||event.hours){
    const local=new Date(serverWallTime(now));
    const midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
    let dueAt=Infinity,endAt=0;
    for(let day=-1;day<3;day++)for(const [startHour,endHour] of event.windows||event.hours.map(hour=>[hour,null])){
      const start=serverTimeToInstant(midnight+day*86400000+startHour*3600000);
      const end=endHour===null?start+event.duration:serverTimeToInstant(midnight+day*86400000+endHour*3600000);
      if(start<=now&&now<end)endAt=end;
      if(start>now)dueAt=Math.min(dueAt,start);
    }
    if(endAt)return {label:`OPEN ${countdownText(Math.ceil((endAt-now)/1000))}`,kind:'open',dueAt,endAt};
    return {label:countdownText(Math.ceil((dueAt-now)/1000)),kind:'countdown',dueAt,endAt:0};
  }
  const started=Math.floor((now-event.phase)/event.cycle)*event.cycle+event.phase;
  const endAt=started+event.duration;
  const dueAt=started+event.cycle;
  if(now<endAt)return {label:`OPEN ${countdownText(Math.ceil((endAt-now)/1000))}`,kind:'open',dueAt,endAt};
  return {label:countdownText(Math.ceil((dueAt-now)/1000)),kind:'countdown',dueAt,endAt:0};
}
function renderPinButtons() {
  for(const button of document.querySelectorAll('[data-pin]')){
    const pinned=timerPins.includes(button.dataset.pin);
    button.setAttribute('aria-pressed',String(pinned));
    button.title=pinned?'Remove from game overlay':'Pin to game overlay';
    button.setAttribute('aria-label',`${pinned?'Unpin':'Pin'} ${button.closest('.boss-entry')?.querySelector('.boss-row-name')?.textContent||button.closest('.abyss-entry')?.querySelector('.abyss-row strong')?.textContent||scheduledEvents.find(event=>`event:${event.id}`===button.dataset.pin)?.name||'timer'} ${pinned?'from':'to'} game overlay`);
  }
}
async function toggleTimerPin(key) {
  if(!window.desktop?.timerPinsSet){notify('Pinning needs the installed desktop app.');return;}
  const previous=timerPins;
  timerPins=previous.includes(key)?previous.filter(pin=>pin!==key):[...previous,key];
  renderPinButtons();
  try{timerPins=await window.desktop.timerPinsSet(timerPins);renderPinButtons();updateTimerCountdowns();}
  catch{timerPins=previous;renderPinButtons();notify('Could not update pinned timers.');}
}

function bossStatus(boss) {
  const report=liveFeed&&Date.now()-liveFeed.checkedAt<180000?liveFeed.entries[boss.feedId]:null;
  if(report){
    const clockOffset=liveFeed.checkedAt-liveFeed.serverNow*1000;
    const reportedAt=report.reportAt*1000+clockOffset;
    if(report.status==='up')return {label:report.estimated?'≈ Reported up':'Reported up',kind:'up',source:'live',reportedAt,since:report.since*1000+clockOffset,estimated:report.estimated};
    if(report.nextSpawn>0){
      const dueAt=report.nextSpawn*1000+clockOffset;
      if(dueAt<=Date.now())return {label:report.estimated?'≈ Due · verify':'Due · verify',kind:'due',source:'live',dueAt,reportedAt,estimated:report.estimated};
      const seconds=Math.ceil((dueAt-Date.now())/1000);
      return {label:`${report.estimated?'≈ ':''}${countdownText(seconds)}`,kind:'countdown',source:'live',dueAt,reportedAt,estimated:report.estimated};
    }
    return {label:'Reported dead',kind:'dead',source:'live',reportedAt,estimated:false};
  }
  return {label:'No report',kind:'unknown',source:'none'};
}
function renderBossList() {
  const region=$('boss-region').value,query=$('boss-search').value.trim().toLowerCase();
  const shown=bosses.filter(b=>b.region===region&&b.name.toLowerCase().includes(query)).map(boss=>{
    const status=bossStatus(boss);
    return {boss,status,name:boss.name,dueAt:status.dueAt,active:status.kind==='up'||status.kind==='due'};
  }).sort(compareTimerStarts);
  $('boss-results-count').textContent=`${shown.length} boss${shown.length===1?'':'es'} · ${region}`;
  const list=$('boss-list'),rows=new Map([...list.querySelectorAll('.boss-entry')].map(row=>[row.querySelector('[data-boss-key]').dataset.bossKey,row]));
  list.querySelector('.boss-empty')?.remove();
  shown.forEach(({boss:b,status},index)=>{
    const key=bossKey(b);
    const pinKey=`boss:${key}`,pinned=timerPins.includes(pinKey);
    let row=rows.get(key);
    if(!row){
      row=document.createElement('div');row.className='boss-entry';
      row.innerHTML=`<button class="boss-row" data-boss-key="${escapeHTML(key)}"><span class="boss-row-name">${escapeHTML(b.name)}</span><span class="boss-row-timer" data-timer-key="${escapeHTML(key)}"></span></button><button class="timer-pin" data-pin="${escapeHTML(pinKey)}"><span class="pin-glyph" aria-hidden="true"></span></button>`;
    }
    rows.delete(key);
    const [select,pin]=row.children,countdown=select.querySelector('[data-timer-key]');
    select.classList.toggle('selected',key===selectedBossKey);select.setAttribute('aria-pressed',String(key===selectedBossKey));
    countdown.textContent=status.label;countdown.className=`boss-row-timer ${status.kind}`;
    pin.setAttribute('aria-pressed',String(pinned));pin.setAttribute('aria-label',`${pinned?'Unpin':'Pin'} ${b.name} ${pinned?'from':'to'} game overlay`);pin.title=pinned?'Remove from game overlay':'Pin to game overlay';
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
  });
  for(const row of rows.values())row.remove();
  if(!shown.length)list.innerHTML='<p class="boss-empty">No matching bosses.</p>';
}
function renderTimerDetail() {
  const boss=bosses.find(b=>bossKey(b)===selectedBossKey);
  if(!boss)return;
  $('timer-map-boss-name').textContent=boss.name;
}
function updateTimerMapTransform() {
  $('timer-world').setAttribute('transform',`translate(${timerX} ${timerY}) scale(${timerScale})`);
  const size=1.5/Math.pow(timerScale,1.3);
  for(const marker of $('timer-map-markers').children)marker.setAttribute('transform',`translate(${marker.dataset.x} ${marker.dataset.y}) scale(${size})`);
}
function renderTimerMap() {
  const region=$('boss-region').value;
  $('timer-map-image').setAttribute('href',fieldAtlas.maps[region]);
  $('timer-map-label').textContent=region.toUpperCase();
  $('timer-map-region').textContent=region.toUpperCase();
  $('timer-map-markers').innerHTML=bosses.filter(b=>b.region===region).flatMap(b=>b.points.map(p=>`<g class="boss-map-marker ${bossKey(b)===selectedBossKey?'selected':''} ${bossStatus(b).kind==='up'?'up':''}" data-boss-key="${escapeHTML(bossKey(b))}" data-x="${p.x}" data-y="${p.y}"><circle r="8"/><circle r="3"/><title>${escapeHTML(b.name)} · ${escapeHTML(bossStatus(b).label)}</title></g>`)).join('');
  updateTimerMapTransform();
}
function updateTimerCountdowns() {
  const now=Date.now();
  for(const event of scheduledEvents){
    const status=scheduledEventStatus(event,now),display=$(`event-${event.id}`);
    display.textContent=status.label;
    display.classList.toggle('open',status.kind==='open');
  }
  renderBossList();
  renderTimerDetail();
  $('timer-count').textContent=bosses.filter(b=>b.region===$('boss-region').value&&bossStatus(b).kind==='up').length;
  if(!window.desktop?.bossFeed)$('timer-feed-status').textContent='Offline preview · no current reports';
  else if(!liveFeed)$('timer-feed-status').textContent=liveFeedError?'Siel feed unavailable':'Checking Siel boss reports…';
  else if(Date.now()-liveFeed.checkedAt>=180000)$('timer-feed-status').textContent='Siel feed stale · refresh to retry';
  else $('timer-feed-status').textContent=`Siel reports · checked ${Math.floor((Date.now()-liveFeed.checkedAt)/60000)}m ago${liveFeedError?' · retrying':''}`;
  if(window.desktop?.timerOverlaySnapshot&&timerPins.length){
    const snapshot=timerPins.map(key=>{
      if(key.startsWith('event:')){
        const event=scheduledEvents.find(item=>`event:${item.id}`===key);
        if(!event)return null;
        const status=scheduledEventStatus(event,now);
        return {key,name:event.name,label:status.label,dueAt:status.dueAt,endAt:status.endAt};
      }
      if(key.startsWith('abyss:')){
        const event=abyssEvents.find(item=>`abyss:${item.id}`===key);
        if(!event)return null;
        const dueAt=nextAbyssStart(event,now);
        return {key,name:event.name,label:countdownText(Math.max(0,Math.ceil((dueAt-now)/1000))),dueAt,endAt:0};
      }
      const boss=bosses.find(item=>`boss:${bossKey(item)}`===key);
      if(!boss)return null;
      const status=bossStatus(boss);
      return {key,name:boss.name,label:status.label,dueAt:status.dueAt||0,endAt:0};
    }).filter(Boolean);
    window.desktop.timerOverlaySnapshot(snapshot);
  }
}
async function refreshBossFeed() {
  if(!window.desktop?.bossFeed||feedFetchPending)return;
  feedFetchPending=true;
  $('timer-refresh').disabled=true;
  try{
    const feed=await window.desktop.bossFeed();
    if(feed?.server!=='naw-siel'||!feed.entries||!Number.isFinite(feed.serverNow)||!Number.isFinite(feed.checkedAt))throw new Error('Invalid feed');
    liveFeed=feed;liveFeedError=false;
    renderBossList();renderTimerMap();updateTimerCountdowns();
  }catch{
    liveFeedError=true;updateTimerCountdowns();
  }finally{
    feedFetchPending=false;$('timer-refresh').disabled=false;
  }
}
function selectBoss(key,centerMap=false) {
  const boss=bosses.find(b=>bossKey(b)===key);
  if(!boss)return;
  selectedBossKey=key;
  if(boss.region!==$('boss-region').value)$('boss-region').value=boss.region;
  if(centerMap&&boss.points.length){timerScale=1.7;timerX=500-boss.points[0].x*timerScale;timerY=500-boss.points[0].y*timerScale;}
  renderBossList();renderTimerDetail();renderTimerMap();
}

$('boss-region').addEventListener('change',()=>{
  const first=bosses.find(b=>b.region===$('boss-region').value);
  if(first)selectedBossKey=bossKey(first);
  timerScale=1;timerX=0;timerY=-80;
  renderBossList();renderTimerDetail();renderTimerMap();updateTimerCountdowns();
});
$('boss-search').addEventListener('input',renderBossList);
$('timer-refresh').addEventListener('click',refreshBossFeed);
$('boss-list').addEventListener('click',event=>{
  const pin=event.target.closest('[data-pin]');
  if(pin){void toggleTimerPin(pin.dataset.pin);return;}
  const row=event.target.closest('[data-boss-key]');
  if(row)selectBoss(row.dataset.bossKey,true);
});
$('top-events').addEventListener('click',event=>{
  const pin=event.target.closest('[data-pin]');
  if(pin)void toggleTimerPin(pin.dataset.pin);
});
$('clear-timer-pins').addEventListener('click',async()=>{
  if(!window.desktop?.timerPinsSet){notify('Timer overlays need the installed desktop app.');return;}
  const previous=timerPins;timerPins=[];renderBossList();renderPinButtons();
  try{timerPins=await window.desktop.timerPinsSet([]);renderBossList();renderPinButtons();notify('All overlaid timers cleared.');}
  catch{timerPins=previous;renderBossList();renderPinButtons();notify('Could not clear timer pins.');}
});
$('separate-event-overlay').addEventListener('change',async event=>{
  if(!window.desktop?.timerSeparateSet){event.target.checked=false;notify('Separate overlays need the installed desktop app.');return;}
  try{event.target.checked=await window.desktop.timerSeparateSet(event.target.checked);}
  catch{event.target.checked=!event.target.checked;notify('Could not change timer overlays.');}
});
$('timer-map-markers').addEventListener('click',event=>{
  const marker=event.target.closest('[data-boss-key]');
  if(marker)selectBoss(marker.dataset.bossKey,false);
});
$('timer-map-reset').addEventListener('click',()=>{timerScale=1;timerX=0;timerY=-80;updateTimerMapTransform();});
$('timer-map').addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('[data-boss-key]'))return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('timer-map').getScreenCTM().inverse());
  timerDrag={x:point.x,y:point.y,startX:timerX,startY:timerY};
  $('timer-map').setPointerCapture(event.pointerId);
});
$('timer-map').addEventListener('pointermove',event=>{
  if(!timerDrag)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('timer-map').getScreenCTM().inverse());
  timerX=timerDrag.startX+point.x-timerDrag.x;timerY=timerDrag.startY+point.y-timerDrag.y;
  updateTimerMapTransform();
});
$('timer-map').addEventListener('pointerup',()=>{timerDrag=null;});
$('timer-map').addEventListener('pointercancel',()=>{timerDrag=null;});
$('timer-map').addEventListener('wheel',event=>{
  event.preventDefault();
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('timer-map').getScreenCTM().inverse());
  const worldX=(point.x-timerX)/timerScale,worldY=(point.y-timerY)/timerScale;
  timerScale=Math.max(1,Math.min(5,timerScale*(event.deltaY<0?1.16:1/1.16)));
  timerX=point.x-worldX*timerScale;timerY=point.y-worldY*timerScale;
  updateTimerMapTransform();
},{passive:false});

renderBossList();renderTimerDetail();renderTimerMap();updateTimerCountdowns();
if(window.desktop?.timerPinsGet)window.desktop.timerPinsGet().then(pins=>{if(Array.isArray(pins)){timerPins=pins;renderBossList();renderPinButtons();updateTimerCountdowns();}}).catch(()=>{});
if(window.desktop?.timerSeparateGet)window.desktop.timerSeparateGet().then(value=>{$('separate-event-overlay').checked=value===true;}).catch(()=>{});
setInterval(updateTimerCountdowns,1000);
refreshBossFeed();
setInterval(refreshBossFeed,60000);
