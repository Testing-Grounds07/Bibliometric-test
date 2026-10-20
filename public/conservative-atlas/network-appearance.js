(() => {
 'use strict';
 function edgeIntensity(weight, maximum) {
  const value = Number.isFinite(weight) ? Math.max(0, weight) : 0;
  const ceiling = Number.isFinite(maximum) ? Math.max(value, maximum) : value;
  return ceiling > 0 ? .12 + .8 * Math.log1p(value) / Math.log1p(ceiling) : .12;
 }
 function curveControl(start, end, key) {
  const deltaX = end.x - start.x, deltaY = end.y - start.y, length = Math.hypot(deltaX, deltaY);
  let hash = 0; for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const bend = Math.min(55, length * .14) * (hash % 2 ? 1 : -1);
  return {x: (start.x + end.x) / 2 - deltaY / (length || 1) * bend, y: (start.y + end.y) / 2 + deltaX / (length || 1) * bend};
 }
 function curvePath(start, end, key) {
  const control = curveControl(start, end, key);
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
 }
 function curvePoint(start, end, key, position) {
  const control = curveControl(start, end, key), inverse = 1 - position;
  return {x: inverse ** 2 * start.x + 2 * inverse * position * control.x + position ** 2 * end.x, y: inverse ** 2 * start.y + 2 * inverse * position * control.y + position ** 2 * end.y};
 }
 window.atlasNetworkAppearance = {edgeIntensity, curvePath, curvePoint};
})();
