'use strict';
window.playFieldbookAlert=async volume=>{
  if(!Number.isFinite(volume)||volume<=0)return;
  const context=new AudioContext();
  await context.resume();
  for(const [index,frequency] of [660,880,660].entries()){
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+index*0.24;
    oscillator.type='sine';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(Math.min(0.22,volume/400),start+0.025);gain.gain.exponentialRampToValueAtTime(0.001,start+0.18);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+0.19);
  }
  setTimeout(()=>{void context.close();},1100);
};
