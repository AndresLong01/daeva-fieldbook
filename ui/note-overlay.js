'use strict';
function reportMinimumHeight(){
  const scale=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale'))||1;
  const height=34*scale+[...document.querySelectorAll('#note-items article')].reduce((sum,article)=>sum+Math.max(52*scale,article.querySelector('strong').scrollHeight+article.querySelector('p').scrollHeight+15*scale),0);
  window.desktop.overlayContentMin(Math.ceil(height));
}
window.desktop.onNoteOverlaySnapshot(snapshot=>{
  if(!Array.isArray(snapshot))return;
  document.getElementById('note-items').replaceChildren(...snapshot.map(note=>{
    const article=document.createElement('article'),title=document.createElement('strong'),body=document.createElement('p');
    title.textContent=note.title;
    body.textContent=note.body||'No text yet';
    article.append(title,body);
    return article;
  }));
  requestAnimationFrame(reportMinimumHeight);
});
window.addEventListener('resize',reportMinimumHeight);
document.addEventListener('overlay-appearance-changed',()=>requestAnimationFrame(reportMinimumHeight));
