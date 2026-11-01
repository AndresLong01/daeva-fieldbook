const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({fieldAtlas:{bosses:[{id:'gartua',region:'Verteron',name:'Eternal Gartua'}]}});
vm.runInContext(fs.readFileSync(`${__dirname}/ui/server-clock.js`,'utf8'),context);
vm.runInContext(fs.readFileSync(`${__dirname}/ui/timers.js`,'utf8').split('function renderPinButtons')[0],context);
for(const [instant,kind,next,end] of [
  ['2026-10-21T17:59:00Z','countdown','2026-10-21T18:00:00Z',null],
  ['2026-10-21T18:00:00Z','open','2026-10-22T03:00:00Z','2026-10-21T21:00:00Z'],
  ['2026-10-21T20:59:59Z','open','2026-10-22T03:00:00Z','2026-10-21T21:00:00Z'],
  ['2026-10-21T21:00:00Z','countdown','2026-10-22T03:00:00Z',null],
  ['2026-10-22T03:00:00Z','open','2026-10-22T18:00:00Z','2026-10-22T05:00:00Z'],
  ['2026-10-22T05:00:00Z','countdown','2026-10-22T18:00:00Z',null],
  ['2026-10-22T07:00:00Z','countdown','2026-10-22T18:00:00Z',null],
  ['2026-11-01T05:00:00Z','countdown','2026-11-01T19:00:00Z',null],
  ['2026-11-01T19:00:00Z','open','2026-11-02T04:00:00Z','2026-11-01T22:00:00Z'],
  ['2027-03-14T06:00:00Z','countdown','2027-03-14T18:00:00Z',null],
  ['2026-12-31T20:00:00Z','open','2027-01-01T04:00:00Z','2026-12-31T22:00:00Z']
]){
  const status=vm.runInContext(`scheduledEventStatus(scheduledEvents.find(event=>event.id==='battlefield'),${Date.parse(instant)})`,context);
  assert.equal(status.kind,kind,instant);
  assert.equal(status.dueAt,Date.parse(next),instant);
  assert.equal(status.endAt,end?Date.parse(end):0,instant);
  assert(Number.isFinite(status.dueAt));
}
for(const [id,instant,kind,next] of [
  ['shugo','2026-10-21T18:00:00Z','open','2026-10-21T19:00:00Z'],
  ['invasion','2026-10-21T18:30:00Z','open','2026-10-21T19:30:00Z'],
  ['rift','2026-10-21T18:10:00Z','countdown','2026-10-21T21:00:00Z']
]){
  const status=vm.runInContext(`scheduledEventStatus(scheduledEvents.find(event=>event.id==='${id}'),${Date.parse(instant)})`,context);
  assert.equal(status.kind,kind);
  assert.equal(status.dueAt,Date.parse(next));
}
console.log('PASS: Battlefield openings, closing boundaries, overnight rollover, Pacific DST changes, year rollover, and existing event schedules.');
