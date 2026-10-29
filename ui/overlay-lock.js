'use strict';
const lockButton=document.querySelector('.overlay-lock-button');
let lockChangePending=false;
function reportLockButtonBounds(){
  const rect=lockButton.getBoundingClientRect();
  window.desktop.overlayLockButtonBounds({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
}
new ResizeObserver(reportLockButtonBounds).observe(document.querySelector('header'));
new ResizeObserver(reportLockButtonBounds).observe(lockButton);
window.addEventListener('resize',reportLockButtonBounds);
lockButton.addEventListener('pointerenter',()=>{reportLockButtonBounds();window.desktop.overlayInputRefresh();});
document.querySelector('header').addEventListener('pointerenter',()=>window.desktop.overlayInputRefresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){reportLockButtonBounds();window.desktop.overlayInputRefresh();}});
document.addEventListener('overlay-appearance-changed',()=>requestAnimationFrame(reportLockButtonBounds));
function showLockState(locked){
  document.body.classList.toggle('overlay-locked',locked);
  lockButton.setAttribute('aria-pressed',String(locked));
  lockButton.setAttribute('aria-label',locked?'Unlock overlay and allow moving':'Lock overlay position and enable click-through');
  lockButton.title=locked?'Unlock overlay':'Lock position · click through';
  lockButton.innerHTML=`<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0${locked?'v2':''}"/></svg>`;
  reportLockButtonBounds();
}
window.desktop.onOverlayLock(showLockState);
window.desktop.overlayLockGet().then(showLockState);
lockButton.addEventListener('click',async()=>{
  if(lockChangePending)return;
  lockChangePending=true;
  try{showLockState(await window.desktop.overlayLockToggle());}
  catch{lockButton.title='Could not change overlay lock';}
  finally{lockChangePending=false;}
});
