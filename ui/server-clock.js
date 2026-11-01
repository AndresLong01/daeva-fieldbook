'use strict';
// NA West schedules use Pacific wall time, not the PC's zone or a saved UTC offset.
const serverClock=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'});
function serverWallTime(instant){
  const parts=Object.fromEntries(serverClock.formatToParts(instant).map(part=>[part.type,part.value]));
  return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
}
function serverTimeToInstant(wallTime){
  // Examine both sides of a DST transition. Repeated times use the first
  // occurrence; a missing spring-forward time moves forward across the gap.
  const offsets=new Set([-36,0,36].map(hours=>{const probe=wallTime+hours*3600000;return serverWallTime(probe)-probe;}));
  const candidates=[...offsets].map(offset=>wallTime-offset).sort((a,b)=>a-b);
  return candidates.find(instant=>serverWallTime(instant)===wallTime)??candidates.find(instant=>serverWallTime(instant)>wallTime);
}
