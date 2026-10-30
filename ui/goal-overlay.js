'use strict';
function render(goals){
  if(!Array.isArray(goals))return;
  const list=document.getElementById('goal-items');
  const rows=new Map([...list.children].map(row=>[Number(row.dataset.itemId),row]));
  goals.forEach((goal,index)=>{
    let row=rows.get(goal.itemId);
    if(!row){
      row=document.createElement('div');row.className='goal-row';row.dataset.itemId=goal.itemId;
      const line=document.createElement('div'),track=document.createElement('div'),complete=document.createElement('div');
      line.className='goal-line';line.append(document.createElement('strong'),document.createElement('span'));
      track.className='track';track.append(document.createElement('div'));
      complete.className='goal-complete';complete.setAttribute('role','status');
      row.append(line,track,complete);
    }
    rows.delete(goal.itemId);
    const [line,track,complete]=row.children;
    line.children[0].textContent=goal.name;line.children[1].textContent=`${goal.current} / ${goal.target}`;
    track.firstElementChild.style.width=`${Math.round(100*goal.current/goal.target)}%`;
    const completed=goal.current>=goal.target;
    const newlyCompleted=completed&&!row.classList.contains('completed');
    if(row.classList.contains('completed')!==completed){
      row.classList.toggle('completed',completed);
      complete.textContent=completed?'Complete!':'';
      complete.setAttribute('aria-label',completed?`${goal.name}: Complete!`:'');
    }
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
    // Start against the current timeline instead of waiting for the next frame;
    // an unfocused overlay can otherwise start its fade after the removal timer.
    if(newlyCompleted)for(const animation of row.getAnimations({subtree:true}))animation.startTime=document.timeline.currentTime;
  });
  for(const row of rows.values())row.remove();
}
window.desktop.onGoal(render);
window.desktop.goalGet().then(render);
