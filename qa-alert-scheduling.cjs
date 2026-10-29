const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(`${__dirname}/main.cjs`,'utf8').split('    registerShortcuts(appSettings);')[1].split("    ipcMain.handle('update-get'")[0];
const dueAt=2000000000000;
for(let mask=0;mask<16;mask++){
  const intervals=[300,180,60,30].filter((seconds,index)=>mask&(1<<index));
  const played=[];
  const overlay={isDestroyed:()=>false,webContents:{send:(...args)=>played.push(args)}};
  const state={appSettings:{alertIntervals:intervals,volume:43},timerSnapshot:[{key:'event:shugo',dueAt}],alertPins:['event:shugo'],alerted:new Map(),separateEvents:true,eventOverlay:overlay,timerOverlay:null,Date:{now:()=>state.now},setInterval:callback=>{state.tick=callback;}};
  vm.runInNewContext(source,state);
  let expected=0;
  for(const seconds of [301,300,299,181,180,179,61,60,59,31,30,29,0,-1]){
    state.now=dueAt-seconds*1000;
    if(intervals.includes(seconds))expected++;
    state.tick();state.tick();
    assert.equal(played.length,expected,`mask ${mask}, ${seconds}s: each selected threshold fires exactly once`);
  }
  assert(played.every(args=>args[0]==='alert-play'&&args[1]===43));
  // The next occurrence of the same event gets a fresh set of alerts.
  state.timerSnapshot[0].dueAt+=3600000;
  for(const seconds of [300,180,60,30]){
    state.now=state.timerSnapshot[0].dueAt-seconds*1000;
    if(intervals.includes(seconds))expected++;
    state.tick();state.tick();
    assert.equal(played.length,expected);
  }
  // Late startup emits one sound, without a burst of missed intervals.
  state.alerted.clear();state.now=state.timerSnapshot[0].dueAt-25000;
  state.tick();state.tick();
  assert.equal(played.length,expected+(intervals.length?1:0));
  // Disabled per-timer alerts remain silent regardless of global selections.
  state.alertPins=[];state.alerted.clear();state.tick();
  assert.equal(played.length,expected+(intervals.length?1:0));
}
for(const key of ['boss:Verteron:gartua','abyss:siege','event:battlefield']){
  const played=[];
  const timerOverlay={isDestroyed:()=>false,webContents:{send:()=>played.push('boss')}};
  const eventOverlay={isDestroyed:()=>false,webContents:{send:()=>played.push('event')}};
  const state={appSettings:{alertIntervals:[300,180,60,30],volume:70},timerSnapshot:[{key,dueAt}],alertPins:[key],alerted:new Map(),separateEvents:true,timerOverlay,eventOverlay,Date:{now:()=>state.now},setInterval:callback=>{state.tick=callback;}};
  vm.runInNewContext(source,state);
  state.now=dueAt-300000;state.tick();
  state.timerSnapshot[0].dueAt+=1000;state.now+=2000;state.tick();
  assert.deepEqual(played,[key.startsWith('boss:')?'boss':'event'],'Feed jitter must not replay an interval; routing must respect overlay separation');
  state.appSettings.alertIntervals=[];state.now=dueAt-29000;state.tick();
  assert.equal(played.length,1,'Clearing all intervals takes effect immediately');
}
console.log('PASS: all 16 interval combinations, four thresholds, deduplication, next occurrence, late startup, per-timer disabling, volume, overlay routing, and feed jitter.');
