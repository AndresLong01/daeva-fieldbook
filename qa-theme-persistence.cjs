const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const stage=process.argv.find(value=>value.startsWith('--stage='))?.split('=')[1];
const profile=path.resolve(__dirname,'../qa-theme-persistence/profile');
const palette={background:'#212832',text:'#f0e6d2',accent:'#cc6688',border:'#677889'};
const defaults={background:'#15191d',text:'#e8e7df',accent:'#b8d99b',border:'#465056'};
let failSave=false;
const nativeFs=require('node:fs');
const rename=nativeFs.renameSync;
nativeFs.renameSync=(from,to)=>{if(failSave&&to===path.join(profile,'app-settings.json'))throw Error('Simulated disk failure');return rename(from,to);};
app.setPath('userData',profile);
require('./main.cjs');
async function waitFor(check){
  for(let i=0;i<100;i++){const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('Timed out waiting for settings');
}
app.whenReady().then(async()=>{
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(window=>window.getTitle()==='Daeva Fieldbook'&&!window.webContents.isLoading()));
  await waitFor(()=>main.webContents.executeJavaScript(`document.documentElement.style.getPropertyValue('--theme-accent')!==''`));
  if(stage==='save'){
    await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click();for(const [key,value] of Object.entries(${JSON.stringify(palette)})){const input=document.getElementById('color-'+key);input.value=value;input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('change'));}`);
    await waitFor(async()=>JSON.stringify((await main.webContents.executeJavaScript('window.desktop.settingsGet()')).colors)===JSON.stringify(palette));
  }else if(stage==='verify-saved'){
    const actual=await main.webContents.executeJavaScript(`({colors:themeColors,settings:fieldbookSettings,css:getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()})`);
    assert.deepEqual(actual.colors,palette);assert.equal(actual.css,palette.accent);
  }else if(stage==='input'){
    await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click();const input=document.getElementById('hex-accent');input.focus();input.value='#55aacc';input.dispatchEvent(new Event('input'));`);
    main.close();return;
  }else if(stage==='verify-input'){
    assert.deepEqual((await main.webContents.executeJavaScript('window.desktop.settingsGet()')).colors,{...palette,accent:'#55aacc'});
    assert.equal(await main.webContents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()`),'#55aacc');
  }else if(stage==='rapid'){
    await main.webContents.executeJavaScript(`(async()=>{
      document.getElementById('settings-tab').click();
      const current=await window.desktop.settingsGet();
      const saves=[];
      for(let i=0;i<30;i++){
        const input=document.getElementById('color-accent');input.value='#'+(0x223300+i).toString(16);input.dispatchEvent(new Event('input'));
        saves.push(window.desktop.settingsSet({...current,volume:40+i,overlayOpacity:50+i}));
      }
      const input=document.getElementById('color-border');input.value='#987654';input.dispatchEvent(new Event('input'));
      await Promise.all(saves);
    })()`);
    main.close();return;
  }else if(stage==='verify-rapid'){
    const settings=await main.webContents.executeJavaScript('window.desktop.settingsGet()');
    assert.deepEqual(settings.colors,{...palette,accent:'#22331d',border:'#987654'});
    assert.equal(settings.volume,69);assert.equal(settings.overlayOpacity,79);
    assert.equal(await main.webContents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()`),'#22331d');
  }else if(stage==='failure'){
    const before=await fs.readFile(path.join(profile,'app-settings.json'),'utf8');
    const original=await main.webContents.executeJavaScript('window.desktop.settingsGet()');
    failSave=true;
    assert.equal(await main.webContents.executeJavaScript(`window.desktop.themeSet(${JSON.stringify(defaults)}).then(()=>false,()=>true)`),true);
    assert.equal(await fs.readFile(path.join(profile,'app-settings.json'),'utf8'),before);
    assert.deepEqual(await main.webContents.executeJavaScript('window.desktop.settingsGet()'),original);
    failSave=false;
  }else if(stage==='reset'){
    await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click();document.getElementById('reset-colors').click()`);
    main.close();return;
  }else if(stage==='verify-reset'){
    assert.deepEqual((await main.webContents.executeJavaScript('window.desktop.settingsGet()')).colors,defaults);
    assert.equal(await main.webContents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()`),defaults.accent);
    await main.webContents.executeJavaScript(`document.getElementById('settings-tab').click();const input=document.getElementById('hex-accent');input.focus();input.value='#12';input.dispatchEvent(new Event('input'))`);
    assert.deepEqual((await main.webContents.executeJavaScript('window.desktop.settingsGet()')).colors,defaults);
  }else{throw Error('Unknown QA stage');}
  const saved=JSON.parse(await fs.readFile(path.join(profile,'app-settings.json'),'utf8'));
  assert(saved.colors);
  console.log(`PASS ${stage}`);main.close();
}).catch(error=>{console.error(error);app.exit(1);});
