'use strict';
// Active/due timers first, then the earliest known start; unknown times last.
function compareTimerStarts(a,b){
  const at=a.active?0:Number.isFinite(a.dueAt)&&a.dueAt>0?a.dueAt:Infinity;
  const bt=b.active?0:Number.isFinite(b.dueAt)&&b.dueAt>0?b.dueAt:Infinity;
  return at-bt||a.name.localeCompare(b.name);
}
