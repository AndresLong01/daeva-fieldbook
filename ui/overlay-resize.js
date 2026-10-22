'use strict';
const moveHeader=document.querySelector('header');
let movingPointer=null;
moveHeader.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button')||document.body.classList.contains('overlay-locked'))return;
  movingPointer=event.pointerId;
  moveHeader.setPointerCapture(event.pointerId);
  moveHeader.classList.add('moving');
  window.desktop.overlayMove('start');
  event.preventDefault();
});
moveHeader.addEventListener('pointermove',event=>{
  if(event.pointerId===movingPointer)window.desktop.overlayMove('move');
});
function finishOverlayMove(){
  if(movingPointer===null)return;
  movingPointer=null;
  moveHeader.classList.remove('moving');
  window.desktop.overlayMove('end');
}
moveHeader.addEventListener('pointerup',finishOverlayMove);
moveHeader.addEventListener('pointercancel',finishOverlayMove);
moveHeader.addEventListener('lostpointercapture',finishOverlayMove);
window.desktop.onOverlayLock(locked=>{if(locked)finishOverlayMove();});
const resizeGrip=document.querySelector('.resize-grip');
let resizeStart=null;
resizeGrip.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  resizeStart={x:event.screenX,y:event.screenY,width:window.outerWidth,height:window.outerHeight};
  resizeGrip.setPointerCapture(event.pointerId);
  event.preventDefault();
});
resizeGrip.addEventListener('pointermove',event=>{
  if(!resizeStart)return;
  window.desktop.overlayResize({width:Math.round(resizeStart.width+event.screenX-resizeStart.x),height:Math.round(resizeStart.height+event.screenY-resizeStart.y)});
});
resizeGrip.addEventListener('pointerup',()=>{resizeStart=null;});
resizeGrip.addEventListener('pointercancel',()=>{resizeStart=null;});
