// The spinning globe: alert routes from North Palm Beach to traders worldwide.
// d3-geo draws the sphere on a canvas; drag to spin, it keeps turning on its own.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { feature } from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';

const canvas = document.getElementById('globe');
const ctx = canvas.getContext('2d');
const RM = matchMedia('(prefers-reduced-motion: reduce)');

const HOME = [-80.06, 26.83]; // North Palm Beach, FL
const CITIES = [
  ['New York', -74.0, 40.7], ['Toronto', -79.4, 43.7], ['Mexico City', -99.1, 19.4],
  ['São Paulo', -46.6, -23.5], ['London', -0.13, 51.5], ['Frankfurt', 8.68, 50.1],
  ['Zurich', 8.54, 47.4], ['Madrid', -3.7, 40.4], ['Dubai', 55.3, 25.2],
  ['Johannesburg', 28.0, -26.2], ['Mumbai', 72.9, 19.1], ['Singapore', 103.8, 1.35],
  ['Hong Kong', 114.2, 22.3], ['Tokyo', 139.7, 35.7], ['Seoul', 127.0, 37.6], ['Sydney', 151.2, -33.9]
];

const C = { sea: '#181826', rim: 'rgba(230,200,143,.55)', land: '#343448', landEdge: 'rgba(230,200,143,.35)',
  grat: 'rgba(165,162,180,.09)', arc: 'rgba(230,200,143,', home: '#e6c88f', city: '#f8f9fa' };

let land = null, size = 0, dpr = 1;
const projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
const path = d3.geoPath(projection, ctx);
const graticule = d3.geoGraticule10();
let rot = [80, -18, 0];             // start looking at the Americas and Atlantic
const arcs = CITIES.map((c, i) => ({ name: c[0], to: [c[1], c[2]], interp: d3.geoInterpolate(HOME, [c[1], c[2]]), phase: i / CITIES.length }));

function resize() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(2, devicePixelRatio || 1);
  size = Math.max(200, Math.round(r.width));
  canvas.width = size * dpr; canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  projection.translate([size / 2, size / 2]).scale(size / 2 - 6);
}

function visible(lonlat) {
  const [l, p] = projection.rotate();
  return d3.geoDistance(lonlat, [-l, -p]) < Math.PI / 2 - 0.02;
}

function draw(t) {
  projection.rotate(rot);
  ctx.clearRect(0, 0, size, size);
  // sea + soft inner shading
  ctx.beginPath(); path({ type: 'Sphere' });
  const g = ctx.createRadialGradient(size * 0.38, size * 0.32, size * 0.05, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#2a2a3e'); g.addColorStop(1, C.sea);
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); path(graticule); ctx.strokeStyle = C.grat; ctx.lineWidth = 0.7; ctx.stroke();
  if (land) {
    ctx.beginPath(); path(land); ctx.fillStyle = C.land; ctx.fill();
    ctx.strokeStyle = C.landEdge; ctx.lineWidth = 0.6; ctx.stroke();
  }
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = C.rim; ctx.lineWidth = 1.2; ctx.stroke();

  // routes: each one draws out from home, holds, then fades, on its own phase
  const period = 6;
  arcs.forEach(a => {
    const local = RM.matches ? 0.6 : ((t / 1000 / period + a.phase) % 1);
    const grow = Math.min(1, local / 0.45);
    const fade = local > 0.8 ? 1 - (local - 0.8) / 0.2 : 1;
    const steps = 40, n = Math.max(2, Math.round(steps * grow));
    const coords = []; for (let i = 0; i <= n; i++) coords.push(a.interp(i / steps));
    ctx.beginPath(); path({ type: 'LineString', coordinates: coords });
    ctx.strokeStyle = C.arc + (0.75 * fade).toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.stroke();
    // the travelling signal at the head of the route
    if (grow < 1 && visible(coords[coords.length - 1])) {
      const [x, y] = projection(coords[coords.length - 1]);
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fillStyle = '#fff1cf'; ctx.fill();
    }
    // city dot, with a ring that blooms when the signal lands
    if (visible(a.to)) {
      const [x, y] = projection(a.to);
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = C.city; ctx.fill();
      if (grow >= 1 && fade > 0) {
        const bloom = Math.min(1, (local - 0.45) / 0.35);
        ctx.beginPath(); ctx.arc(x, y, 3 + bloom * 10, 0, Math.PI * 2);
        ctx.strokeStyle = C.arc + (0.6 * (1 - bloom) * fade).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
  });
  // home base
  if (visible(HOME)) {
    const [x, y] = projection(HOME);
    const pulse = RM.matches ? 0.5 : (t / 1600) % 1;
    ctx.beginPath(); ctx.arc(x, y, 4 + pulse * 14, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(230,200,143,${(0.7 * (1 - pulse)).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fillStyle = C.home; ctx.fill();
  }
}

// auto-rotation that rests off-screen, plus drag to spin
let raf = null, last = 0, onScreen = false, dragging = false, vel = 0.006;
function loop(t) {
  const dt = Math.min(64, t - (last || t)); last = t;
  if (!dragging) { rot[0] += vel * dt; vel += (0.006 - vel) * 0.02; }
  draw(t);
  raf = onScreen && !RM.matches && !document.hidden ? requestAnimationFrame(loop) : null;
  if (!raf) last = 0;
}
function start() { if (!raf && onScreen && !RM.matches) raf = requestAnimationFrame(loop); else if (RM.matches) draw(0); }

let px = 0, py = 0, lastMove = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; lastMove = performance.now(); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const k = 180 / size, now = performance.now();
  const dx = (e.clientX - px) * k, dy = (e.clientY - py) * k;
  rot[0] += dx; rot[1] = Math.max(-60, Math.min(60, rot[1] - dy));
  vel = dx / Math.max(8, now - lastMove);
  px = e.clientX; py = e.clientY; lastMove = now;
  if (!raf) draw(performance.now());
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

new IntersectionObserver(es => { onScreen = es[0].isIntersecting; start(); }).observe(canvas);
document.addEventListener('visibilitychange', start);
RM.addEventListener('change', () => { if (RM.matches && raf) { cancelAnimationFrame(raf); raf = null; } draw(0); start(); });
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); draw(performance.now()); }, 150); });

resize(); draw(0);
fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
  .then(r => r.json())
  .then(topo => { land = feature(topo, topo.objects.land); draw(performance.now()); })
  .catch(() => { /* the sphere, routes and cities still draw without the coastline */ });
