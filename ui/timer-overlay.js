'use strict';
let pinnedSnapshot=[];
let alertPins=[];
document.getElementById('timer-heading').textContent=new URLSearchParams(location.search).get('kind')==='event'?'EVENT TIMERS':new URLSearchParams(location.search).get('kind')==='boss'?'BOSS TIMERS':'PINNED TIMERS';
function countdownText(seconds){
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
  return hours?`${hours}h ${String(minutes).padStart(2,'0')}m`:minutes?`${minutes}m ${String(seconds%60).padStart(2,'0')}s`:`${seconds}s`;
}
function render(){
  const now=Date.now();
  document.getElementById('timer-items').replaceChildren(...pinnedSnapshot.map(item=>{
    const row=document.createElement('div'),bell=document.createElement('button'),name=document.createElement('span'),status=document.createElement('strong');
    row.className='timer-item';name.textContent=item.name;
    bell.className='alert-button';bell.type='button';bell.dataset.alertKey=item.key;bell.textContent='!';bell.setAttribute('aria-pressed',String(alertPins.includes(item.key)));bell.setAttribute('aria-label',`${alertPins.includes(item.key)?'Disable':'Enable'} one-minute alert for ${item.name}`);bell.title=alertPins.includes(item.key)?'One-minute alert on':'Enable one-minute alert';
    if(item.endAt>now){status.textContent=`OPEN ${countdownText(Math.ceil((item.endAt-now)/1000))}`;status.className='open';}
    else if(item.dueAt>now){status.textContent=`${item.label.startsWith('≈')?'≈ ':''}${countdownText(Math.ceil((item.dueAt-now)/1000))}`;}
    else if(item.dueAt>0){status.textContent='Due · verify';status.className='due';}
    else{status.textContent=item.label;status.className=item.label.includes('up')?'up':'';}
    row.append(bell,name,status);return row;
  }));
}
window.desktop.onTimerOverlaySnapshot(snapshot=>{if(Array.isArray(snapshot)){pinnedSnapshot=snapshot;render();}});
window.desktop.onTimerAlertPins(pins=>{if(Array.isArray(pins)){alertPins=pins;render();}});
window.desktop.onAlertPlay(volume=>{void window.playFieldbookAlert(volume).catch(()=>{});});
document.getElementById('timer-items').addEventListener('click',async event=>{
  const button=event.target.closest('[data-alert-key]');if(!button)return;
  try{alertPins=await window.desktop.timerAlertToggle(button.dataset.alertKey);render();}catch{button.title='Could not change alert';}
});
setInterval(render,1000);
