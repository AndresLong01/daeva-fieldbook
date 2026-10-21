'use strict';
function renderUpdateState(state){
  document.querySelector('.version').textContent=`VERSION / ${state.version}`;
  const button=document.getElementById('download-update');
  const busy=['downloading','ready','installing'].includes(state.status);
  button.hidden=!state.availableVersion;
  button.disabled=busy||state.status==='checking';
  button.textContent=state.status==='downloading'?`↓ ${state.percent}%`:['ready','installing'].includes(state.status)?'Restarting…':state.status==='error'?'Retry update':'↓ Download update';
  button.title=state.availableVersion?`Download v${state.availableVersion} and restart to install`:'Download an update';
  document.getElementById('installed-version').textContent=`v${state.version}`;
  document.getElementById('update-status').textContent=state.message||'Updates are checked automatically.';
  document.getElementById('check-updates').disabled=busy||state.status==='checking';
}
if(window.desktop?.updateGet){
  window.desktop.onUpdateState(renderUpdateState);
  window.desktop.updateGet().then(renderUpdateState).catch(()=>{});
  document.getElementById('check-updates').addEventListener('click',async()=>{
    try{renderUpdateState(await window.desktop.updateCheck());}
    catch{document.getElementById('update-status').textContent='Could not check for updates. Try again.';}
  });
  document.getElementById('download-update').addEventListener('click',async()=>{
    document.getElementById('download-update').disabled=true;
    try{renderUpdateState(await window.desktop.updateDownload());}
    catch{document.getElementById('download-update').disabled=false;document.getElementById('update-status').textContent='Could not start the update. Try again.';}
  });
}
