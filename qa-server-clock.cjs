const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const clock=fs.readFileSync(`${__dirname}/ui/server-clock.js`,'utf8');
const abyss=fs.readFileSync(`${__dirname}/ui/abyss-schedule.js`,'utf8');
const timers=fs.readFileSync(`${__dirname}/ui/timers.js`,'utf8').split('function renderPinButtons')[0];
for(const [offset,mode] of [[540,'server'],[-420,'server'],[-480,'server'],[345,'fixed']]){
  const context=vm.createContext({data:{abyssClockOffset:offset}});
  vm.runInContext(clock+'\n'+abyss,context);
  assert.equal(context.data.abyssClockMode,mode,'Migrate old clock '+offset);
  assert.equal(context.data.abyssClockOffset,offset,'Retain saved custom offset');
}
const context=vm.createContext({data:{abyssClockOffset:-420,abyssClockMode:'server'},fieldAtlas:{bosses:[{id:'gartua',region:'Verteron',name:'Eternal Gartua'}]}});
vm.runInContext(clock+'\n'+abyss+'\n'+timers,context);
for(const [id,now,expected] of [
  ['siege','2026-10-31T05:00:00Z','2026-11-01T04:00:00Z'],
  ['siege','2026-11-01T05:00:00Z','2026-11-03T05:00:00Z'],
  ['nahma','2026-11-01T05:00:00Z','2026-11-02T05:00:00Z'],
  ['argo','2026-11-01T05:00:00Z','2026-11-03T05:30:00Z'],
  ['watcher','2026-11-01T07:59:59Z','2026-11-01T08:00:00Z'],
  ['watcher','2026-11-01T08:30:00Z','2026-11-01T12:00:00Z'],
  ['watcher','2026-11-01T09:30:00Z','2026-11-01T12:00:00Z'],
  ['nahma','2027-03-14T06:00:00Z','2027-03-15T04:00:00Z'],
  ['watcher','2027-03-14T08:59:59Z','2027-03-14T09:00:00Z'],
  ['watcher','2027-03-14T09:30:00Z','2027-03-14T11:00:00Z']
]){
  assert.equal(vm.runInContext(`nextAbyssStart(abyssEvents.find(e=>e.id==='${id}'),${Date.parse(now)})`,context),Date.parse(expected),id+' '+now);
}
for(const [now,kind,next,end] of [
  ['2026-10-31T17:10:00Z','countdown','2026-10-31T18:00:00Z',null],
  ['2026-11-01T06:00:00Z','open','2026-11-01T10:00:00Z','2026-11-01T06:10:00Z'],
  ['2026-11-01T08:30:00Z','countdown','2026-11-01T10:00:00Z',null],
  ['2026-11-01T09:30:00Z','countdown','2026-11-01T10:00:00Z',null],
  ['2026-11-01T10:00:00Z','open','2026-11-01T13:00:00Z','2026-11-01T10:10:00Z'],
  ['2026-11-01T18:00:00Z','countdown','2026-11-01T19:00:00Z',null],
  ['2027-03-14T09:59:59Z','countdown','2027-03-14T10:00:00Z',null],
  ['2027-03-14T10:00:00Z','open','2027-03-14T12:00:00Z','2027-03-14T10:10:00Z'],
  ['2027-03-14T10:10:00Z','countdown','2027-03-14T12:00:00Z',null]
]){
  const status=vm.runInContext(`scheduledEventStatus(scheduledEvents.find(e=>e.id==='rift'),${Date.parse(now)})`,context);
  assert.equal(status.kind,kind,now);assert.equal(status.dueAt,Date.parse(next),now);assert.equal(status.endAt,end?Date.parse(end):0,now);
}
for(const now of ['2026-11-01T08:59:30Z','2026-11-01T09:59:30Z','2027-03-14T09:59:30Z']){
  const next=Math.ceil(Date.parse(now)/3600000)*3600000;
  assert.equal(vm.runInContext(`scheduledEventStatus(scheduledEvents[0],${Date.parse(now)}).dueAt`,context),next,'Hourly event across DST');
}
// Explicitly selected fixed clocks must remain fixed across seasonal changes.
context.data.abyssClockMode='fixed';context.data.abyssClockOffset=540;
assert.equal(vm.runInContext(`nextAbyssStart(abyssEvents.find(e=>e.id==='siege'),Date.parse('2026-10-29T11:59:00Z'))`,context),Date.parse('2026-10-29T12:00:00Z'));
console.log('PASS: NA West schedule migration, fall/spring transitions, future-date offsets, repeated/missing hours, Rift opening windows, hourly timers, and explicit fixed clocks. Host timezone: '+Intl.DateTimeFormat().resolvedOptions().timeZone);
