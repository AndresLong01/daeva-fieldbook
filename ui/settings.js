'use strict';
let fieldbookSettings={volume:70,alertIntervals:[60],overlayShortcut:'Control+Alt+O',goalShortcut:'Control+Alt+G',goalFontSize:100,timerFontSize:100,noteFontSize:100,overlayOpacity:93,overlaysVisible:true,overlayGameOnly:true};
let settingsRevision=0;
const appearanceControls=[['goal-font-size','goalFontSize'],['timer-font-size','timerFontSize'],['note-font-size','noteFontSize'],['overlay-opacity','overlayOpacity']];
function renderSettings(){
  document.getElementById('overlay-game-only').checked=fieldbookSettings.overlayGameOnly;
  document.getElementById('alert-volume').value=String(fieldbookSettings.volume);
  document.getElementById('volume-value').textContent=`${fieldbookSettings.volume}%`;
  for(const input of document.querySelectorAll('[name="alert-interval"]'))input.checked=fieldbookSettings.alertIntervals.includes(Number(input.value));
  document.getElementById('overlay-shortcut').value=fieldbookSettings.overlayShortcut;
  document.getElementById('goal-shortcut').value=fieldbookSettings.goalShortcut;
  document.getElementById('overlay-visible').textContent=fieldbookSettings.overlaysVisible?'Hide overlays':'Show overlays';
  for(const [id,key] of appearanceControls){document.getElementById(id).value=String(fieldbookSettings[key]);document.getElementById(`${id}-value`).textContent=`${fieldbookSettings[key]}%`;}
}
function loadSettings(){
  const revision=settingsRevision;
  window.desktop.settingsGet().then(value=>{if(revision===settingsRevision){fieldbookSettings=value;renderSettings();}}).catch(()=>{});
}
async function saveSettings(patch,message){
  const revision=++settingsRevision;
  Object.assign(fieldbookSettings,patch);
  try{
    const saved=await window.desktop.settingsSet(patch);
    if(revision===settingsRevision){fieldbookSettings=saved;renderSettings();document.getElementById('settings-status').textContent=message;}
    return true;
  }catch{
    if(revision===settingsRevision){document.getElementById('settings-status').textContent='Could not save settings. Please try again.';loadSettings();}
    return false;
  }
}
if(window.desktop?.settingsGet){
  loadSettings();
  window.desktop.onOverlayVisibility(visible=>{fieldbookSettings.overlaysVisible=visible;renderSettings();});
  window.desktop.onAlertPlay(volume=>{void window.playFieldbookAlert(volume).catch(()=>{});});
}
document.getElementById('settings-tab').addEventListener('click',()=>{if(window.desktop?.settingsGet)loadSettings();});
for(const input of document.querySelectorAll('[name="alert-interval"]'))input.addEventListener('change',()=>{
  const alertIntervals=[...document.querySelectorAll('[name="alert-interval"]:checked')].map(checkbox=>Number(checkbox.value));
  void saveSettings({alertIntervals},alertIntervals.length?'Alert times saved.':'Automatic timer alerts silenced.');
});
for(const [id,key] of [['alert-volume','volume'],...appearanceControls]){
  const input=document.getElementById(id);
  input.addEventListener('input',()=>{
    const value=Number(input.value);
    document.getElementById(id==='alert-volume'?'volume-value':id+'-value').textContent=value+'%';
    void saveSettings({[key]:value},key==='volume'?'Volume saved.':'Overlay appearance saved.');
  });
}

document.getElementById('overlay-visible').addEventListener('click',async()=>{
  settingsRevision++;
  try{fieldbookSettings.overlaysVisible=await window.desktop.overlayVisibilitySet(!fieldbookSettings.overlaysVisible);renderSettings();}
  catch{document.getElementById('settings-status').textContent='Could not change overlay visibility.';}
});
document.getElementById('overlay-game-only').addEventListener('change',event=>{
  void saveSettings({overlayGameOnly:event.target.checked},event.target.checked?'Overlays show only while AION 2 is focused.':'Overlays also show outside the game.');
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
    if(await saveSettings({[id==='overlay-shortcut'?'overlayShortcut':'goalShortcut']:accelerator},'Shortcut saved.'))input.blur();
    else document.getElementById('settings-status').textContent='Could not save shortcut. It may already be in use.';
  });
}
renderSettings();
