const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const stage=process.argv.find(arg=>arg.startsWith('--stage='))?.split('=')[1];
const output=path.resolve(__dirname,'../qa-settings-persistence');
const profile=path.join(output,'profile');
app.setPath('userData',profile);
app.getVersion=()=>stage==='save'?'1.0.4':'1.0.5';
let failSave=false;
const nativeFs=require('node:fs'),originalRename=nativeFs.renameSync;
nativeFs.renameSync=(from,to)=>{if(failSave&&to===path.join(profile,'app-settings.json'))throw Error('Simulated write failure');return originalRename(from,to);};
const expected={volume:36,goalFontSize:125,timerFontSize:145,noteFontSize:115,overlayOpacity:57,overlayGameOnly:false,overlaysVisible:false,overlayShortcut:'Control+Alt+Shift+F10',goalShortcut:'Control+Alt+Shift+F11',colors:{background:'#232831',text:'#ece4dd',accent:'#b4505f',border:'#57636d'}};
require('./main.cjs');
async function waitFor(check){
  for(let i=0;i<100;i++){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('Timed out waiting for settings');
}
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Daeva Fieldbook'&&!w.webContents.isLoading()));
  await waitFor(()=>main.webContents.executeJavaScript(`typeof fieldbookSettings==='object'&&document.documentElement.style.getPropertyValue('--theme-accent')!==''`));
  if(stage==='save'){
    await main.webContents.executeJavaScript(`window.desktop.settingsSet({overlayShortcut:'Control+Alt+Shift+F10',goalShortcut:'Control+Alt+Shift+F11',overlayGameOnly:false})`);
    await main.webContents.executeJavaScript(`window.desktop.themeSet(${JSON.stringify(expected.colors)})`);
    await main.webContents.executeJavaScript(`window.desktop.timerSeparateSet(true)`);
    await main.webContents.executeJavaScript(`window.desktop.timerPinsSet(['event:shugo'])`);
    const overlay=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()));
    await overlay.webContents.executeJavaScript(`if(!alertPins.includes('event:shugo'))window.desktop.timerAlertToggle('event:shugo')`);
    overlay.setBounds({x:100,y:100,width:400,height:200});
    await overlay.webContents.executeJavaScript(`window.desktop.overlayLockGet().then(locked=>locked||window.desktop.overlayLockToggle())`);
    await main.webContents.executeJavaScript(`window.desktop.overlayVisibilitySet(false)`);
    await main.webContents.executeJavaScript(`data.showTeleports=true;data.markerSize=1.4;data.gatherRegion='Altgard';data.cubeRegion='Altgard';persist();`);
    await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click();for(const [id,value] of [['alert-volume',36],['goal-font-size',125],['timer-font-size',145],['note-font-size',115],['overlay-opacity',57]]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input'));}`);
    // Close before blur/change or renderer acknowledgement: restart must retain every edit.
    main.close();return;
  }
  if(stage==='verify'){
    const settings=await main.webContents.executeJavaScript(`window.desktop.settingsGet()`);
    assert.deepEqual(settings,expected);
    assert.deepEqual(await main.webContents.executeJavaScript(`fieldbookSettings`),expected);
    for(const [id,key] of [['alert-volume','volume'],['goal-font-size','goalFontSize'],['timer-font-size','timerFontSize'],['note-font-size','noteFontSize'],['overlay-opacity','overlayOpacity']])assert.equal(await main.webContents.executeJavaScript(`document.getElementById('${id}').value`),String(expected[key]));
    assert.equal(await main.webContents.executeJavaScript(`window.desktop.timerSeparateGet()`),true);
    assert.deepEqual(await main.webContents.executeJavaScript(`window.desktop.timerPinsGet()`),['event:shugo']);
    const overlay=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('timer-overlay.html')&&!w.webContents.isLoading()));
    assert.equal(overlay.isVisible(),false);assert.equal(overlay.isMovable(),false);
    assert.deepEqual(overlay.getBounds(),{x:100,y:100,width:400,height:200});
    assert.deepEqual(await overlay.webContents.executeJavaScript(`window.desktop.overlayAppearanceGet()`),{fontSize:145,opacity:57});
    assert.deepEqual(await overlay.webContents.executeJavaScript(`alertPins`),['event:shugo']);
    assert.deepEqual(await main.webContents.executeJavaScript(`({teleports:data.showTeleports,size:data.markerSize,gather:data.gatherRegion,cubes:data.cubeRegion})`),{teleports:true,size:1.4,gather:'Altgard',cubes:'Altgard'});
  }else if(stage==='rapid'){
    await main.webContents.executeJavaScript(`for(let i=0;i<20;i++){for(const [id,value] of [['overlay-opacity',40+i],['alert-volume',20+i],['timer-font-size',100+i*5%75]]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input'));}const color=document.getElementById('color-accent');color.value='#'+(0x223300+i).toString(16);color.dispatchEvent(new Event('input'));}document.getElementById('settings-tab').click();`);
    await waitFor(()=>main.webContents.executeJavaScript(`fieldbookSettings.overlayOpacity===59&&fieldbookSettings.volume===39&&fieldbookSettings.timerFontSize===120`));
    const settings=await main.webContents.executeJavaScript(`window.desktop.settingsGet()`);
    assert.equal(settings.overlayOpacity,59);assert.equal(settings.volume,39);assert.equal(settings.timerFontSize,120);assert.equal(settings.colors.accent,'#223313');assert.equal(settings.goalFontSize,125);assert.equal(settings.noteFontSize,115);assert.equal(settings.overlaysVisible,false);
    assert.equal(await main.webContents.executeJavaScript(`document.getElementById('overlay-opacity').value`),'59');
  }else if(stage==='failure'){
    const before=await fs.readFile(path.join(profile,'app-settings.json'),'utf8');
    const settings=await main.webContents.executeJavaScript(`window.desktop.settingsGet()`);
    failSave=true;
    assert.equal(await main.webContents.executeJavaScript(`window.desktop.settingsSet({overlayOpacity:10,overlayShortcut:'Control+Alt+Shift+F9'}).then(()=>false,()=>true)`),true);
    assert.equal(await fs.readFile(path.join(profile,'app-settings.json'),'utf8'),before);
    assert.deepEqual(await main.webContents.executeJavaScript(`window.desktop.settingsGet()`),settings);
    failSave=false;
  }else throw Error('Unknown stage');
  await fs.writeFile(path.join(output,stage+'.json'),JSON.stringify({passed:true,stage,version:app.getVersion()},null,2));
  console.log('PASS '+stage);main.close();
}).catch(error=>{console.error(error);app.exit(1);});
