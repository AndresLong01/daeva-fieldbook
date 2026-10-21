'use strict';
let fieldbookSettings={volume:70,overlayShortcut:'Control+Alt+O',goalShortcut:'Control+Alt+G',goalFontSize:100,timerFontSize:100,noteFontSize:100,overlayOpacity:93,overlaysVisible:true,overlayGameOnly:true};
const appearanceControls=[['goal-font-size','goalFontSize'],['timer-font-size','timerFontSize'],['note-font-size','noteFontSize'],['overlay-opacity','overlayOpacity']];
function renderSettings(){
  document.getElementById('overlay-game-only').checked=fieldbookSettings.overlayGameOnly;
  document.getElementById('alert-volume').value=String(fieldbookSettings.volume);
  document.getElementById('volume-value').textContent=`${fieldbookSettings.volume}%`;
  document.getElementById('overlay-shortcut').value=fieldbookSettings.overlayShortcut;
  document.getElementById('goal-shortcut').value=fieldbookSettings.goalShortcut;
  document.getElementById('overlay-visible').textContent=fieldbookSettings.overlaysVisible?'Hide overlays':'Show overlays';
  for(const [id,key] of appearanceControls){document.getElementById(id).value=String(fieldbookSettings[key]);document.getElementById(`${id}-value`).textContent=`${fieldbookSettings[key]}%`;}
}
if(window.desktop?.settingsGet){
  window.desktop.settingsGet().then(value=>{fieldbookSettings=value;renderSettings();}).catch(()=>{});
  window.desktop.onOverlayVisibility(visible=>{fieldbookSettings.overlaysVisible=visible;renderSettings();});
  window.desktop.onAlertPlay(volume=>{void window.playFieldbookAlert(volume).catch(()=>{});});
}
document.getElementById('settings-tab').addEventListener('click',()=>{if(window.desktop?.settingsGet)window.desktop.settingsGet().then(value=>{fieldbookSettings=value;renderSettings();}).catch(()=>{});});
document.getElementById('alert-volume').addEventListener('input',event=>{fieldbookSettings.volume=Number(event.target.value);document.getElementById('volume-value').textContent=`${fieldbookSettings.volume}%`;});
document.getElementById('alert-volume').addEventListener('change',async()=>{
  try{fieldbookSettings=await window.desktop.settingsSet(fieldbookSettings);document.getElementById('settings-status').textContent='Volume saved.';}
  catch{document.getElementById('settings-status').textContent='Could not save volume.';}
});
for(const [id,key] of appearanceControls){
  const input=document.getElementById(id);
  input.addEventListener('input',()=>{fieldbookSettings[key]=Number(input.value);document.getElementById(`${id}-value`).textContent=`${fieldbookSettings[key]}%`;});
  input.addEventListener('change',async()=>{
    try{fieldbookSettings=await window.desktop.settingsSet(fieldbookSettings);document.getElementById('settings-status').textContent='Overlay appearance saved.';renderSettings();}
    catch{document.getElementById('settings-status').textContent='Could not save overlay appearance.';}
  });
}
document.getElementById('overlay-visible').addEventListener('click',async()=>{
  try{fieldbookSettings.overlaysVisible=await window.desktop.overlayVisibilitySet(!fieldbookSettings.overlaysVisible);renderSettings();}
  catch{document.getElementById('settings-status').textContent='Could not change overlay visibility.';}
});
document.getElementById('overlay-game-only').addEventListener('change',async event=>{
  try{fieldbookSettings=await window.desktop.settingsSet({...fieldbookSettings,overlayGameOnly:event.target.checked});renderSettings();document.getElementById('settings-status').textContent=fieldbookSettings.overlayGameOnly?'Overlays show only while AION 2 is focused.':'Overlays also show outside the game.';}
  catch{renderSettings();document.getElementById('settings-status').textContent='Could not save overlay focus preference.';}
});
document.getElementById('unlock-overlays').addEventListener('click',async()=>{
  try{await window.desktop.overlayLockClear();document.getElementById('settings-status').textContent='All overlay positions unlocked.';}
  catch{document.getElementById('settings-status').textContent='Could not unlock overlays.';}
});
document.getElementById('test-alert').addEventListener('click',()=>{if(window.desktop?.alertTest)void window.desktop.alertTest();});
for(const id of ['overlay-shortcut','goal-shortcut']){
  const input=document.getElementById(id);
  input.addEventListener('focus',()=>{input.value='Press shortcut…';});
  input.addEventListener('blur',renderSettings);
  input.addEventListener('keydown',async event=>{
    event.preventDefault();
    if(event.key==='Escape'){input.blur();return;}
    const key=event.code.startsWith('Key')?event.code.slice(3):event.code.startsWith('Digit')?event.code.slice(5):/^F(?:[1-9]|1[0-2])$/.test(event.key)?event.key:null;
    if(!key||!(event.ctrlKey||event.altKey))return;
    const accelerator=[event.ctrlKey?'Control':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,key].filter(Boolean).join('+');
    try{fieldbookSettings=await window.desktop.settingsSet({...fieldbookSettings,[id==='overlay-shortcut'?'overlayShortcut':'goalShortcut']:accelerator});document.getElementById('settings-status').textContent='Shortcut saved.';renderSettings();input.blur();}
    catch{document.getElementById('settings-status').textContent='Shortcut unavailable or already in use.';renderSettings();}
  });
}
renderSettings();
