'use strict';
const lockButton=document.querySelector('.overlay-lock-button');
function showLockState(locked){
  document.body.classList.toggle('overlay-locked',locked);
  lockButton.setAttribute('aria-pressed',String(locked));
  lockButton.setAttribute('aria-label',locked?'Unlock overlay and allow moving':'Lock overlay position and enable click-through');
  lockButton.title=locked?'Unlock overlay':'Lock position · click through';
  lockButton.innerHTML=`<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0${locked?'v2':''}"/></svg>`;
}
window.desktop.onOverlayLock(showLockState);
window.desktop.overlayLockGet().then(showLockState);
lockButton.addEventListener('click',async()=>{try{showLockState(await window.desktop.overlayLockToggle());}catch{lockButton.title='Could not change overlay lock';}});
