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
  if(event.pointerId!==movingPointer)return;
  if(!(event.buttons&1)){finishOverlayMove();return;}
  window.desktop.overlayMove('move');
});
function finishOverlayMove(){
  if(movingPointer===null)return;
  const pointer=movingPointer;
  movingPointer=null;
  if(moveHeader.hasPointerCapture(pointer))moveHeader.releasePointerCapture(pointer);
  moveHeader.classList.remove('moving');
  window.desktop.overlayMove('end');
}
moveHeader.addEventListener('pointerup',finishOverlayMove);
moveHeader.addEventListener('pointercancel',finishOverlayMove);
moveHeader.addEventListener('lostpointercapture',finishOverlayMove);
window.desktop.onOverlayLock(locked=>{if(locked){finishOverlayMove();finishOverlayResize();}});
const resizeGrip=document.querySelector('.resize-grip');
let resizeStart=null;
resizeGrip.addEventListener('pointerdown',event=>{
  if(event.button!==0||document.body.classList.contains('overlay-locked'))return;
  resizeStart={pointer:event.pointerId,x:event.screenX,y:event.screenY,width:window.outerWidth,height:window.outerHeight};
  resizeGrip.setPointerCapture(event.pointerId);
  event.preventDefault();
});
resizeGrip.addEventListener('pointermove',event=>{
  if(!resizeStart||event.pointerId!==resizeStart.pointer)return;
  if(!(event.buttons&1)){finishOverlayResize();return;}
  window.desktop.overlayResize({width:Math.round(resizeStart.width+event.screenX-resizeStart.x),height:Math.round(resizeStart.height+event.screenY-resizeStart.y)});
});
function finishOverlayResize(){
  if(!resizeStart)return;
  const pointer=resizeStart.pointer;
  resizeStart=null;
  if(resizeGrip.hasPointerCapture(pointer))resizeGrip.releasePointerCapture(pointer);
}
resizeGrip.addEventListener('pointerup',finishOverlayResize);
resizeGrip.addEventListener('pointercancel',finishOverlayResize);
resizeGrip.addEventListener('lostpointercapture',finishOverlayResize);
window.addEventListener('blur',()=>{finishOverlayMove();finishOverlayResize();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishOverlayMove();finishOverlayResize();}});
