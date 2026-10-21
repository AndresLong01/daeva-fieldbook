'use strict';
const defaultThemeColors = Object.freeze({background:'#15191d',text:'#e8e7df',accent:'#b8d99b',border:'#465056'});
let themeColors = {...defaultThemeColors};
let pendingThemeSaves = 0;
let themeSaveRevision = 0;
function applyThemeColors(colors){
  if(!colors || !Object.keys(defaultThemeColors).every(key=>/^#[0-9a-f]{6}$/i.test(colors[key])))return;
  themeColors={...colors};
  for(const [key,value] of Object.entries(themeColors))document.documentElement.style.setProperty(`--theme-${key}`,value);
  const [r,g,b]=themeColors.background.slice(1).match(/../g).map(value=>parseInt(value,16));
  document.documentElement.style.colorScheme=(r*.299+g*.587+b*.114)>150?'light':'dark';
  // Pick a readable foreground for solid accent buttons independently of the page text.
  const accentChannels=themeColors.accent.slice(1).match(/../g).map(value=>{const channel=parseInt(value,16)/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;});
  const luminance=accentChannels[0]*.2126+accentChannels[1]*.7152+accentChannels[2]*.0722;
  document.documentElement.style.setProperty('--on-accent',luminance>.179?'#101418':'#ffffff');
  for(const key of Object.keys(defaultThemeColors)){
    const picker=document.getElementById(`color-${key}`),hex=document.getElementById(`hex-${key}`);
    if(picker)picker.value=themeColors[key];
    if(hex&&document.activeElement!==hex){hex.value=themeColors[key];hex.removeAttribute('aria-invalid');}
  }
}
if(window.desktop?.settingsGet){
  window.desktop.onThemeColors(colors=>{if(!pendingThemeSaves)applyThemeColors(colors);});
  window.desktop.settingsGet().then(settings=>{if(!themeSaveRevision)applyThemeColors(settings.colors);}).catch(()=>{});
}
if(document.getElementById('reset-colors')){
  function updateThemeColors(colors){
    applyThemeColors(colors);
    document.getElementById('theme-status').textContent='Saving colors…';
    const revision=++themeSaveRevision;
    pendingThemeSaves++;
    // Send every valid edit immediately, even if the user closes before blur/change.
    window.desktop.themeSet(colors).then(saved=>{
      if(revision===themeSaveRevision){applyThemeColors(saved);document.getElementById('theme-status').textContent='Colors saved. Applied to the app and all overlays.';}
    }).catch(()=>{if(revision===themeSaveRevision)document.getElementById('theme-status').textContent='Could not save colors. Try again.';}).finally(()=>{pendingThemeSaves--;});
  }
  for(const key of Object.keys(defaultThemeColors)){
    const picker=document.getElementById(`color-${key}`),hex=document.getElementById(`hex-${key}`);
    picker.addEventListener('input',()=>updateThemeColors({...themeColors,[key]:picker.value}));
    picker.addEventListener('change',()=>updateThemeColors({...themeColors,[key]:picker.value}));
    hex.addEventListener('input',()=>{
      const valid=/^#[0-9a-f]{6}$/i.test(hex.value);
      hex.setAttribute('aria-invalid',String(!valid));
      if(valid)updateThemeColors({...themeColors,[key]:hex.value});
    });
    hex.addEventListener('change',()=>{
      if(/^#[0-9a-f]{6}$/i.test(hex.value)){updateThemeColors({...themeColors,[key]:hex.value});}
      else{document.getElementById('theme-status').textContent='Enter a six-digit hex color, such as #b8d99b.';}
    });
    hex.addEventListener('keydown',event=>{if(event.key==='Enter')hex.blur();});
  }
  document.getElementById('reset-colors').addEventListener('click',()=>{
    for(const key of Object.keys(defaultThemeColors))document.getElementById(`hex-${key}`).removeAttribute('aria-invalid');
    updateThemeColors({...defaultThemeColors});
  });
}
