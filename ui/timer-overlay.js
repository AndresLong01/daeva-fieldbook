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
  const list=document.getElementById('timer-items');
  const rows=new Map([...list.children].map(row=>[row.dataset.key,row]));
  pinnedSnapshot.forEach((item,index)=>{
    let row=rows.get(item.key);
    if(!row){
      row=document.createElement('div');row.className='timer-item';row.dataset.key=item.key;
      const bell=document.createElement('button');bell.className='alert-button';bell.type='button';bell.dataset.alertKey=item.key;bell.textContent='!';
      row.append(bell,document.createElement('span'),document.createElement('strong'));
    }
    rows.delete(item.key);
    const [bell,name,status]=row.children,enabled=alertPins.includes(item.key);
    if(name.textContent!==item.name)name.textContent=item.name;
    const label=`${enabled?'Disable':'Enable'} alerts for ${item.name}`;
    if(bell.getAttribute('aria-label')!==label){bell.setAttribute('aria-pressed',String(enabled));bell.setAttribute('aria-label',label);bell.title=enabled?'Alerts enabled · choose times in Settings':'Enable alerts · choose times in Settings';}
    let text,kind='';
    if(item.endAt>now){text=`OPEN ${countdownText(Math.ceil((item.endAt-now)/1000))}`;kind='open';}
    else if(item.dueAt>now)text=`${item.label.startsWith('≈')?'≈ ':''}${countdownText(Math.ceil((item.dueAt-now)/1000))}`;
    else if(item.dueAt>0){text='Due · verify';kind='due';}
    else{text=item.label;kind=item.label.includes('up')?'up':'';}
    if(status.textContent!==text)status.textContent=text;
    if(status.className!==kind)status.className=kind;
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
  });
  for(const row of rows.values())row.remove();
}
window.desktop.onTimerOverlaySnapshot(snapshot=>{if(Array.isArray(snapshot)){pinnedSnapshot=snapshot;render();}});
window.desktop.onTimerAlertPins(pins=>{if(Array.isArray(pins)){alertPins=pins;render();}});
window.desktop.onAlertPlay(volume=>{void window.playFieldbookAlert(volume).catch(()=>{});});
document.getElementById('timer-items').addEventListener('click',async event=>{
  const button=event.target.closest('[data-alert-key]');if(!button)return;
  try{alertPins=await window.desktop.timerAlertToggle(button.dataset.alertKey);render();}catch{button.title='Could not change alert';}
});
setInterval(render,1000);
