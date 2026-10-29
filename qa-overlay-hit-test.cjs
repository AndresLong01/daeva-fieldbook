const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(`${__dirname}/main.cjs`,'utf8');
const start=source.indexOf('  function syncOverlayMouse(');
const end=source.indexOf('  function watchOverlayActivity(',start);
assert(start>=0&&end>start);
let cursor={x:0,y:0},zoom=1,nativeIgnored=false;
const window={isDestroyed:()=>false,getContentBounds:()=>({x:-900,y:180}),webContents:{getZoomFactor:()=>zoom},setIgnoreMouseEvents:(value,options)=>{nativeIgnored=value;assert.equal(options.forward,true);}};
const context=vm.createContext({overlayLocks:{timer:true},overlayLockButtons:new WeakMap(),overlayMouseIgnored:new WeakMap(),screen:{getCursorScreenPoint:()=>cursor},window});
vm.runInContext(source.slice(start,end),context);
vm.runInContext(`syncOverlayMouse(window,'timer')`,context);
assert.equal(nativeIgnored,false,'Missing unlock bounds must not trap the overlay in click-through');
context.overlayLockButtons.set(window,{x:215,y:9,width:18,height:18});
for(zoom of [0.8,1,1.25,1.75]){
  cursor={x:-900+224*zoom,y:180+18*zoom};
  vm.runInContext(`syncOverlayMouse(window,'timer')`,context);
  assert.equal(nativeIgnored,false,`Unlock control must remain clickable at ${zoom}x zoom on a negative-coordinate display`);
  cursor={x:-800,y:300};
  vm.runInContext(`syncOverlayMouse(window,'timer')`,context);
  assert.equal(nativeIgnored,true);
}
context.overlayLocks.timer=false;
vm.runInContext(`syncOverlayMouse(window,'timer')`,context);
assert.equal(nativeIgnored,false);
nativeIgnored=true; // Simulate native state diverging from the cached value.
vm.runInContext(`syncOverlayMouse(window,'timer',true)`,context);
assert.equal(nativeIgnored,false,'Show/resize/hover recovery must reapply native input, even when cached as interactive');
console.log('PASS: zoom-aware unlock hit area, content origin, missing bounds recovery, forwarded movement, and stale native input reset.');
