'use strict';
function render(goals){
  if(!Array.isArray(goals))return;
  document.getElementById('goal-items').replaceChildren(...goals.map(goal=>{
    const row=document.createElement('div'),line=document.createElement('div'),name=document.createElement('strong'),count=document.createElement('span'),track=document.createElement('div'),progress=document.createElement('div');
    row.className='goal-row';line.className='goal-line';name.textContent=goal.name;count.textContent=`${goal.current} / ${goal.target}`;track.className='track';progress.style.width=`${Math.round(100*goal.current/goal.target)}%`;
    line.append(name,count);track.append(progress);row.append(line,track);return row;
  }));
}
window.desktop.onGoal(render);
window.desktop.goalGet().then(render);
