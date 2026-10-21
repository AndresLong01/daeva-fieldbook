'use strict';
function applyAppearance(appearance){
  if(!appearance||!Number.isInteger(appearance.fontSize)||!Number.isInteger(appearance.opacity))return;
  document.documentElement.style.setProperty('--font-scale',String(appearance.fontSize/100));
  document.documentElement.style.setProperty('--overlay-opacity',`${appearance.opacity}%`);
  document.dispatchEvent(new Event('overlay-appearance-changed'));
}
window.desktop.onOverlayAppearance(applyAppearance);
window.desktop.overlayAppearanceGet().then(applyAppearance);
