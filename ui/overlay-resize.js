'use strict';
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
