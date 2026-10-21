'use strict';

// Client schedule values are server-clock times. UTC+9 is the initial Global
// reading; the player can calibrate that clock against Siel's in-game clock.
const abyssEvents = [
  {id:'siege',name:'Artifact Siege',zone:'Chaotic Lower Reshanta',days:[1,4,6],hour:21,minute:0,schedule:'Mon, Thu, Sat · 21:00 server time'},
  {id:'watcher',name:'Watcher Kaira',zone:'Chaotic Lower Reshanta',cycleHours:3,hour:1,minute:0,schedule:'Every 3 hours from 01:00 server time'},
  {id:'nahma',name:'Guardian Lord Nahma',zone:'Chaotic Lower Reshanta',days:[0,5],hour:21,minute:0,schedule:'Sun, Fri · 21:00 server time'},
  {id:'argo',name:'Executor Argo',zone:'Chaotic Lower Reshanta',days:[1,4,6],hour:21,minute:30,schedule:'Mon, Thu, Sat · 21:30 server time'},
  {id:'kaira',name:'Executor Kaira',zone:'Chaotic Lower Reshanta',days:[1,4,6],hour:21,minute:30,schedule:'Mon, Thu, Sat · 21:30 server time'},
  {id:'tamasa',name:'Executor Tamasa',zone:'Chaotic Lower Reshanta',days:[1,4,6],hour:21,minute:30,schedule:'Mon, Thu, Sat · 21:30 server time'}
];

function nextAbyssStart(event, now=Date.now()) {
  const serverNow=now+data.abyssClockOffset*60000;
  const today=new Date(serverNow);
  const midnight=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
  for(let day=0;day<=7;day++){
    const date=midnight+day*86400000;
    if(event.days&&!event.days.includes(new Date(date).getUTCDay()))continue;
    for(let hour=event.hour;hour<24;hour+=event.cycleHours||24){
      const candidate=date+(hour*60+event.minute)*60000;
      if(candidate>=serverNow)return candidate-data.abyssClockOffset*60000;
    }
  }
  throw new Error('No scheduled Abyss start found');
}
