'use strict';
let selectedAbyssId='siege',abyssScale=1,abyssX=0,abyssY=-80,abyssDrag=null;

function renderAbyss() {
  const now=Date.now(),offset=data.abyssClockOffset,fixed=data.abyssClockMode==='fixed';
  const serverDate=new Date(fixed?now+offset*60000:serverWallTime(now));
  $('abyss-server-clock').textContent=serverDate.toISOString().slice(11,19);
  const sign=offset<0?'-':'+';
  $('abyss-clock-zone').textContent=fixed?`UTC${sign}${Math.floor(Math.abs(offset)/60)}${Math.abs(offset)%60?':'+String(Math.abs(offset)%60).padStart(2,'0'):''} fixed`:`${serverClock.formatToParts(now).find(part=>part.type==='timeZoneName').value} · automatic`;
  $('abyss-clock-mode').value=data.abyssClockMode;
  $('abyss-clock-input').disabled=!fixed;
  $('abyss-clock-sync').disabled=!fixed;
  const rows=abyssEvents.map(event=>({event,name:event.name,dueAt:nextAbyssStart(event,now)})).sort(compareTimerStarts);
  $('abyss-list').innerHTML=rows.map(({event,dueAt})=>{
    const left=Math.max(0,Math.ceil((dueAt-now)/1000));
    const countdown=left>=86400?`${Math.floor(left/86400)}d ${Math.floor(left%86400/3600)}h`:left>=3600?`${Math.floor(left/3600)}h ${String(Math.floor(left%3600/60)).padStart(2,'0')}m`:left>=60?`${Math.floor(left/60)}m ${String(left%60).padStart(2,'0')}s`:`${left}s`;
    return `<div class="abyss-entry"><button class="abyss-row ${event.id===selectedAbyssId?'selected':''}" data-abyss-id="${event.id}" aria-pressed="${event.id===selectedAbyssId}"><span><strong>${escapeHTML(event.name)}</strong><small>${escapeHTML(event.schedule)}</small></span><b>${countdown}</b></button><button class="timer-pin" data-pin="abyss:${event.id}" aria-label="${timerPins.includes(`abyss:${event.id}`)?'Unpin':'Pin'} ${escapeHTML(event.name)}" aria-pressed="${timerPins.includes(`abyss:${event.id}`)}" title="${timerPins.includes(`abyss:${event.id}`)?'Remove from':'Pin to'} game overlay"><span class="pin-glyph" aria-hidden="true"></span></button></div>`;
  }).join('');
  const selected=abyssEvents.find(event=>event.id===selectedAbyssId);
  const dueAt=nextAbyssStart(selected,now),remaining=Math.max(0,Math.ceil((dueAt-now)/1000));
  $('abyss-selected-name').textContent=selected.name;
  $('abyss-selected-countdown').textContent=remaining>=86400?`In ${Math.floor(remaining/86400)}d ${Math.floor(remaining%86400/3600)}h`:remaining>=3600?`In ${Math.floor(remaining/3600)}h ${Math.floor(remaining%3600/60)}m`:remaining>=60?`In ${Math.floor(remaining/60)}m ${remaining%60}s`:`In ${remaining}s`;
  $('abyss-selected-schedule').textContent=selected.schedule;
  $('abyss-selected-local').textContent=`Your time: ${new Date(dueAt).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;
  $('abyss-selected-zone').textContent=`${selected.zone} · Scheduled start, not a live status`;
  $('abyss-map-title').textContent=selected.name;
}

function updateAbyssMapTransform() {
  $('abyss-world').setAttribute('transform',`translate(${abyssX} ${abyssY}) scale(${abyssScale})`);
  const size=1.5/Math.pow(abyssScale,1.3);
  for(const marker of $('abyss-map-markers').children)marker.setAttribute('transform',`translate(${marker.dataset.x} ${marker.dataset.y}) scale(${size})`);
}

function renderAbyssMap() {
  $('abyss-map-markers').innerHTML=abyssEvents.flatMap(event=>abyssLocations[event.id].map(point=>
    `<g class="abyss-marker ${event.id===selectedAbyssId?'selected':''}" data-abyss-id="${event.id}" data-x="${point.x}" data-y="${point.y}"><circle r="8"/><circle r="3"/><title>${escapeHTML(event.name)} · ${escapeHTML(point.name)}</title></g>`
  )).join('');
  updateAbyssMapTransform();
}

$('abyss-list').addEventListener('click',event=>{
  const pin=event.target.closest('[data-pin]');
  if(pin){void toggleTimerPin(pin.dataset.pin);return;}
  const row=event.target.closest('[data-abyss-id]');
  if(!row)return;
  selectedAbyssId=row.dataset.abyssId;
  const point=abyssLocations[selectedAbyssId][0];
  abyssScale=1.7;abyssX=500-point.x*abyssScale;abyssY=500-point.y*abyssScale;
  renderAbyss();renderAbyssMap();
});
$('abyss-map-markers').addEventListener('click',event=>{
  const marker=event.target.closest('[data-abyss-id]');
  if(!marker)return;
  selectedAbyssId=marker.dataset.abyssId;
  renderAbyss();renderAbyssMap();
});
$('abyss-clock-mode').addEventListener('change',()=>{
  data.abyssClockMode=$('abyss-clock-mode').value;
  persist();renderAbyss();updateTimerCountdowns();
});
$('abyss-clock-sync').addEventListener('click',()=>{
  if(data.abyssClockMode!=='fixed')return;
  const match=/^(\d\d):(\d\d)$/.exec($('abyss-clock-input').value);
  if(!match){notify('Enter the current in-game server time.');return;}
  const now=new Date();
  let offset=Number(match[1])*60+Number(match[2])-now.getUTCHours()*60-now.getUTCMinutes();
  if(offset < -720)offset+=1440;
  if(offset > 840)offset-=1440;
  data.abyssClockOffset=offset;
  persist();renderAbyss();updateTimerCountdowns();notify('Abyss clock synced. Fixed offsets do not follow daylight saving changes.');
});
$('abyss-map-reset').addEventListener('click',()=>{abyssScale=1;abyssX=0;abyssY=-80;updateAbyssMapTransform();});
$('abyss-map').addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('[data-abyss-id]'))return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('abyss-map').getScreenCTM().inverse());
  abyssDrag={x:point.x,y:point.y,startX:abyssX,startY:abyssY};
  $('abyss-map').setPointerCapture(event.pointerId);
});
$('abyss-map').addEventListener('pointermove',event=>{
  if(!abyssDrag)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('abyss-map').getScreenCTM().inverse());
  abyssX=abyssDrag.startX+point.x-abyssDrag.x;abyssY=abyssDrag.startY+point.y-abyssDrag.y;
  updateAbyssMapTransform();
});
$('abyss-map').addEventListener('pointerup',()=>{abyssDrag=null;});
$('abyss-map').addEventListener('pointercancel',()=>{abyssDrag=null;});
$('abyss-map').addEventListener('wheel',event=>{
  event.preventDefault();
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('abyss-map').getScreenCTM().inverse());
  const worldX=(point.x-abyssX)/abyssScale,worldY=(point.y-abyssY)/abyssScale;
  abyssScale=Math.max(1,Math.min(5,abyssScale*(event.deltaY<0?1.16:1/1.16)));
  abyssX=point.x-worldX*abyssScale;abyssY=point.y-worldY*abyssScale;
  updateAbyssMapTransform();
},{passive:false});

renderAbyss();renderAbyssMap();
setInterval(renderAbyss,1000);
