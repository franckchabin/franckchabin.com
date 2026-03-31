/* ================================================================
   IMAGE TRAIL — hero animation
   Modes DESKTOP : imgTrail
   Modes MOBILE  : Spirale · Rond · Trajet · MouseSim · Random
   ================================================================ */
const hero = document.getElementById('hero');
const trailImgs = Array.from(document.querySelectorAll('.hero-trail-img'));
if (!hero || trailImgs.length === 0) throw new Error('Hero elements not found');

function waitForGSAP(cb: (g: any) => void) {
  if ((window as any).gsap) { cb((window as any).gsap); return; }
  const id = setInterval(() => { if ((window as any).gsap) { clearInterval(id); cb((window as any).gsap); } }, 50);
}

/* ── TAILLE DE RÉFÉRENCE — relue à chaque measure() depuis --img-ref-size ── */
let imgRef = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--img-ref-size')) || 150;

/* ── CONFIG ── */
const CFG: Record<string, any> = {
  // animMode : auto-détecté (touch → mousesim, desktop → imgtrail)
  animMode: window.matchMedia('(hover:none)').matches ? 'mousesim' : 'imgtrail',
  centerOnPhoto: true,

  // imgTrail (desktop)
  d_threshold: 30, d_lerp: 0.36, d_slideDuration: 0.1,
  d_fadeDelay: 0.3, d_fadeDuration: 0.9, d_fadeOpacity: 0.2, d_blur: 30,

  // Spirale
  t_interval: 172, t_radiusMin: 15, t_radiusMax: 96,
  t_speedStart: 0.25, t_speedEnd: 0.3, t_densityMax: 1,
  t_fadeDelay: 0.6, t_fadeDuration: 1.2, t_fadeOpacity: 0, t_blur: 0,
  t_turns: 3, t_showPath: 0,

  // Rond
  r_interval: 100, r_radius: 30, r_speed: 0.06, r_count: 1,
  r_fadeDelay: 0.4, r_fadeDuration: 1.0, r_fadeOpacity: 0, r_blur: 0,

  // Trajet profil → texte
  p_paths: 3, p_interval: 180, p_stepSize: 0.018,
  p_curve: 60, p_spread: 55,
  p_fadeDelay: 0.4, p_fadeDuration: 1.1, p_fadeOpacity: 0, p_blur: 0,

  // Mouse simulation — mouvement
  m_speed: 0.017,
  m_amplX: 41, m_amplY: 23, m_freqX: 2.35, m_freqY: 1.1,
  m_offsetX: 0, m_offsetY: 32,
  m_smoothing: 0.10, m_gravity: 0,
  // Mouse simulation — apparition
  m_threshold: 30, m_interval: 60,
  m_slideDuration: 0.1,
  // Mouse simulation — disparition
  m_fadeDelay: 0.3, m_fadeDuration: 0.9, m_fadeOpacity: 0.2, m_blur: 30,
  // Mouse simulation — affichage
  m_showCursor: 1, m_showAmpl: 0,

  // Random (mobile)
  x_interval: 300, x_density: 2, x_dispersion: 80,
  x_minDist: 60, x_zone: 40,
  x_imgSizeMin: 60, x_imgSizeMax: 60,
  x_scaleVar: 0,
  x_opacity: 1.0, x_fadeDelay: 0.5, x_fadeDuration: 1.4, x_fadeOpacity: 0,
  x_blur: 0, x_randomness: 60, x_gravity: 0,
};

/* ── INDICATEUR TAILLE IMAGE ── */
let updateImgRefIndicator: () => void = () => {};

/* ── MESURES ── */
const photo = hero.querySelector('.hero-photo-wrapper') as HTMLElement;
let cx = 0, cy = 0, minR = 0, maxR = 0;
function measure() {
  imgRef = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--img-ref-size')) || 150;
  const hr = hero.getBoundingClientRect();
  const vmin = Math.min(hr.width, hr.height);
  if (CFG.centerOnPhoto && photo) {
    const pr = photo.getBoundingClientRect();
    cx = pr.left - hr.left + pr.width / 2;
    cy = pr.top  - hr.top  + pr.height / 2;
  } else { cx = hr.width / 2; cy = hr.height / 2; }
  minR = vmin * CFG.t_radiusMin / 100;
  maxR = vmin * CFG.t_radiusMax / 100;
  updateImgRefIndicator();
}
measure();
window.addEventListener('resize', () => { measure(); updatePathCanvas(); }, { passive: true });

/* ── WRAP ── */
function wrapPos(x: number, y: number) {
  const hr = hero.getBoundingClientRect();
  return { x: ((x % hr.width) + hr.width) % hr.width, y: ((y % hr.height) + hr.height) % hr.height };
}

/* ── STOP ── */
let touchTimer: number | null = null;
let simFrameId: number | null = null;
let deskRunning = false, deskBound = false;
let cursorEl: HTMLElement | null = null;
let amplGuides: HTMLElement | null = null;

function stopAll() {
  if (touchTimer)  { clearInterval(touchTimer);        touchTimer  = null; }
  if (simFrameId)  { cancelAnimationFrame(simFrameId); simFrameId  = null; }
  deskRunning = false;
  const g = (window as any).gsap;
  if (g) trailImgs.forEach(img => { g.killTweensOf(img); g.set(img, { opacity: 0, scale: 0 }); });
  if (cursorEl) { cursorEl.remove(); cursorEl = null; }
  if (amplGuides) { amplGuides.remove(); amplGuides = null; }
}

/* ── PATH CANVAS (Spirale) ── */
let pathCanvas: HTMLCanvasElement | null = null;
function updatePathCanvas() {
  if (!pathCanvas) return;
  const hr = hero.getBoundingClientRect();
  pathCanvas.width = hr.width; pathCanvas.height = hr.height;
  const ctx = pathCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, pathCanvas.width, pathCanvas.height);
  if (!CFG.t_showPath) return;
  ctx.strokeStyle = 'rgba(255,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([4,4]);
  ctx.beginPath();
  const total = Math.PI * 2 * CFG.t_turns;
  const steps = Math.ceil(total / 0.05);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * total, p = a / total;
    const r = minR + (maxR - minR) * p;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}
function ensurePathCanvas() {
  if (!pathCanvas) {
    pathCanvas = document.createElement('canvas');
    pathCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1';
    hero.querySelector('.hero-trail')!.appendChild(pathCanvas);
  }
}

/* ── CURSEUR SOURIS FICTIF ── */
function makeCursor() {
  if (cursorEl) return;
  const d = document.createElement('div');
  d.id = 'sim-cursor';
  d.innerHTML = `<svg width="22" height="32" viewBox="0 0 22 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 1L1 24L6.5 18.5L10.5 28L13.5 27L9.5 17H17L1 1Z" fill="white" stroke="#333" stroke-width="1.2"/>
  </svg>`;
  d.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:99999;transform:translate(-3px,-3px)';
  hero.querySelector('.hero-trail')!.appendChild(d);
  cursorEl = d;
}
function moveCursor(x: number, y: number) {
  if (!cursorEl || !CFG.m_showCursor) return;
  (window as any).gsap?.set(cursorEl, { x, y, zIndex: 99999 });
}

/* ── MODE : imgTRAIL ── */
function startDesktop(gsap: any) {
  let mouse = {x:0,y:0}, last = {x:0,y:0}, sm = {x:0,y:0};
  let idx = 0, z = 1;
  const lerp = (a:number,b:number,n:number) => (1-n)*a+n*b;
  const dist  = (a:{x:number,y:number},b:{x:number,y:number}) => Math.hypot(b.x-a.x,b.y-a.y);
  if (!deskBound) {
    hero.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect(); mouse.x = e.clientX-r.left; mouse.y = e.clientY-r.top;
    });
    hero.addEventListener('mouseenter', () => { deskRunning=true; sm={...mouse}; last={...mouse}; loop(); });
    hero.addEventListener('mouseleave', () => { deskRunning=false; });
    const hc = hero.querySelector('.hero-content');
    if (hc) {
      hc.addEventListener('mouseenter', () => { deskRunning=false; });
      hc.addEventListener('mouseleave', () => { deskRunning=true; last={...mouse}; loop(); });
    }
    deskBound = true;
  }
  function loop() {
    if (!deskRunning) return;
    sm.x = lerp(sm.x, mouse.x, CFG.d_lerp); sm.y = lerp(sm.y, mouse.y, CFG.d_lerp);
    if (dist(mouse, last) > CFG.d_threshold) { show(); last={...mouse}; }
    requestAnimationFrame(loop);
  }
  function show() {
    const img = trailImgs[idx] as HTMLImageElement;
    const w = img.offsetWidth||150, h = img.offsetHeight||150;
    gsap.killTweensOf(img);
    const ub = CFG.d_blur > 0;
    gsap.timeline()
      .set(img, { opacity:1, scale:1, x:sm.x-w/2, y:sm.y-h/2, zIndex:++z, ...(ub?{filter:'blur(0px)'}:{filter:'none'}) })
      .to(img, { duration:CFG.d_slideDuration, ease:'expo.out', x:mouse.x-w/2, y:mouse.y-h/2 }, 0)
      .to(img, { duration:CFG.d_fadeDuration, ease:'power3.out', scale:0, opacity:CFG.d_fadeOpacity, ...(ub?{filter:`blur(${CFG.d_blur}px)`}:{}) }, CFG.d_fadeDelay);
    idx = (idx+1) % trailImgs.length;
  }
}

/* ── MODE : SPIRALE ── */
function startSpirale(gsap: any) {
  let idx = 0, z = 1, angle = 0;
  measure(); ensurePathCanvas(); updatePathCanvas();
  function tick() {
    const total = Math.PI * 2 * CFG.t_turns;
    const p = (angle % total) / total;
    const r = minR + (maxR - minR) * p;
    const raw = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    const { x, y } = wrapPos(raw.x, raw.y);
    const img = trailImgs[idx] as HTMLImageElement;
    const s = imgRef;
    gsap.killTweensOf(img); gsap.set(img, { width:s, height:s });
    const ub = CFG.t_blur > 0;
    gsap.timeline()
      .set(img, { opacity:1, scale:1, x:x-s/2, y:y-s/2, zIndex:++z, rotation:0, ...(ub?{filter:'blur(0px)'}:{filter:'none'}) })
      .to(img, { duration:CFG.t_fadeDuration, ease:'power3.out', scale:0, opacity:CFG.t_fadeOpacity, ...(ub?{filter:`blur(${CFG.t_blur}px)`}:{}) }, CFG.t_fadeDelay);
    idx = (idx+1) % trailImgs.length;
    const ratio = (maxR - minR) > 0 ? (r - minR) / (maxR - minR) : 0;
    angle += CFG.t_speedStart + (CFG.t_speedEnd - CFG.t_speedStart) * ratio;
  }
  touchTimer = setInterval(() => {
    const total = Math.PI * 2 * CFG.t_turns;
    const p = (angle % total) / total;
    const count = Math.max(1, Math.round(1 + (CFG.t_densityMax - 1) * p));
    for (let i = 0; i < count; i++) tick();
  }, CFG.t_interval) as unknown as number;
}

/* ── MODE : ROND ── */
function startRond(gsap: any) {
  let idx = 0, z = 1, angle = 0;
  measure();
  touchTimer = setInterval(() => {
    const hr = hero.getBoundingClientRect();
    const r = Math.min(hr.width, hr.height) * CFG.r_radius / 100;
    const count = Math.max(1, Math.round(CFG.r_count));
    for (let i = 0; i < count; i++) {
      const a = angle + (i * Math.PI * 2 / count);
      const { x, y } = wrapPos(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      const img = trailImgs[idx] as HTMLImageElement;
      const s = imgRef;
      gsap.killTweensOf(img); gsap.set(img, { width:s, height:s });
      const ub = CFG.r_blur > 0;
      gsap.timeline()
        .set(img, { opacity:1, scale:1, x:x-s/2, y:y-s/2, zIndex:++z, rotation:0, ...(ub?{filter:'blur(0px)'}:{filter:'none'}) })
        .to(img, { duration:CFG.r_fadeDuration, ease:'power3.out', scale:0, opacity:CFG.r_fadeOpacity, ...(ub?{filter:`blur(${CFG.r_blur}px)`}:{}) }, CFG.r_fadeDelay);
      idx = (idx+1) % trailImgs.length;
    }
    angle += CFG.r_speed;
  }, CFG.r_interval) as unknown as number;
}

/* ── MODE : TRAJET ── */
function startTrajet(gsap: any) {
  let idx = 0, z = 1, globalT = 0;
  touchTimer = setInterval(() => {
    const hr  = hero.getBoundingClientRect();
    const photoEl = hero.querySelector('.hero-photo-wrapper') as HTMLElement;
    const textEl  = hero.querySelector('.hero-text') as HTMLElement;
    if (!photoEl || !textEl) return;
    const pr = photoEl.getBoundingClientRect();
    const tr = textEl.getBoundingClientRect();
    const sx = pr.left - hr.left + pr.width / 2, sy = pr.top - hr.top + pr.height / 2;
    const ex = tr.left - hr.left + tr.width  / 2, ey = tr.top - hr.top  + tr.height / 4;
    const n = Math.min(Math.max(1, Math.round(CFG.p_paths)), 7);
    for (let pp = 0; pp < n; pp++) {
      const progress = (globalT + pp / n) % 1;
      const lat = (pp - (n-1)/2) * CFG.p_spread;
      const c1x = sx + lat*0.3 + CFG.p_curve, c1y = sy + (ey-sy)*0.28;
      const c2x = ex + lat*0.7,               c2y = sy + (ey-sy)*0.72;
      const u = 1 - progress, t = progress;
      const x = u*u*u*sx + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*ex + lat*Math.sin(progress*Math.PI);
      const y = u*u*u*sy + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*ey;
      const img = trailImgs[idx] as HTMLImageElement;
      const s = imgRef;
      gsap.killTweensOf(img); gsap.set(img, { width:s, height:s });
      const ub = CFG.p_blur > 0;
      gsap.timeline()
        .set(img, { opacity:1, scale:1, x:x-s/2, y:y-s/2, zIndex:++z, rotation:0, ...(ub?{filter:'blur(0px)'}:{filter:'none'}) })
        .to(img, { duration:CFG.p_fadeDuration, ease:'power3.out', scale:0.5, opacity:CFG.p_fadeOpacity, ...(ub?{filter:`blur(${CFG.p_blur}px)`}:{}) }, CFG.p_fadeDelay);
      idx = (idx+1) % trailImgs.length;
    }
    globalT = (globalT + CFG.p_stepSize) % 1;
  }, CFG.p_interval) as unknown as number;
}

/* ── MODE : MOUSE SIMULATION ── */
function makeAmplGuides() {
  if (amplGuides) amplGuides.remove();
  amplGuides = document.createElement('div');
  amplGuides.id = 'sim-ampl-guides';
  amplGuides.innerHTML = `
    <div class="ampl-line ampl-x-left"></div>
    <div class="ampl-line ampl-x-right"></div>
    <div class="ampl-line ampl-y-top"></div>
    <div class="ampl-line ampl-y-bottom"></div>
    <div class="ampl-line ampl-center-v"></div>
    <div class="ampl-line ampl-center-h"></div>`;
  amplGuides.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1';
  const lineBase = 'position:absolute;pointer-events:none;';
  amplGuides.querySelectorAll('.ampl-line').forEach(l => (l as HTMLElement).style.cssText = lineBase);
  hero.querySelector('.hero-trail')!.appendChild(amplGuides);
}
function updateAmplGuides() {
  if (!amplGuides || !CFG.m_showAmpl) { if (amplGuides) amplGuides.style.display = 'none'; return; }
  amplGuides.style.display = '';
  const hr = hero.getBoundingClientRect();
  const cxOff = cx + hr.width  * CFG.m_offsetX / 100;
  const cyOff = cy + hr.height * CFG.m_offsetY / 100;
  const rangeX = hr.width  * CFG.m_amplX / 100 + hr.width  * CFG.m_amplX / 300;
  const rangeY = hr.height * CFG.m_amplY / 100 + hr.height * CFG.m_amplY / 300;
  const set = (cls: string, css: string) => {
    const el = amplGuides!.querySelector(cls) as HTMLElement;
    if (el) el.style.cssText = 'position:absolute;pointer-events:none;' + css;
  };
  set('.ampl-x-left',   `left:${cxOff - rangeX}px;top:0;bottom:0;width:1px;border-left:1px dashed rgba(255,80,80,0.6)`);
  set('.ampl-x-right',  `left:${cxOff + rangeX}px;top:0;bottom:0;width:1px;border-left:1px dashed rgba(255,80,80,0.6)`);
  set('.ampl-y-top',    `top:${cyOff - rangeY}px;left:0;right:0;height:1px;border-top:1px dashed rgba(80,140,255,0.6)`);
  set('.ampl-y-bottom', `top:${cyOff + rangeY}px;left:0;right:0;height:1px;border-top:1px dashed rgba(80,140,255,0.6)`);
  set('.ampl-center-v', `left:${cxOff}px;top:0;bottom:0;width:1px;background:rgba(255,80,80,0.25)`);
  set('.ampl-center-h', `top:${cyOff}px;left:0;right:0;height:1px;background:rgba(80,140,255,0.25)`);
}

function startMouseSim(gsap: any) {
  if (CFG.m_showCursor) makeCursor();
  if (CFG.m_showAmpl) { makeAmplGuides(); updateAmplGuides(); }
  let idx = 0, z = 1, t = 0;
  let smX = cx, smY = cy, lastX = cx, lastY = cy, lastSpawn = 0;
  function frame(ts: number) {
    const hr = hero.getBoundingClientRect();
    t += CFG.m_speed;
    const cxOff = cx + hr.width  * CFG.m_offsetX / 100;
    const cyOff = cy + hr.height * CFG.m_offsetY / 100;
    let tx = cxOff + Math.sin(t * CFG.m_freqX) * hr.width  * CFG.m_amplX / 100
                   + Math.sin(t * CFG.m_freqX * 2.3 + 1.1) * hr.width  * CFG.m_amplX / 300;
    let ty = cyOff + Math.sin(t * CFG.m_freqY + Math.PI/3) * hr.height * CFG.m_amplY / 100
                   + Math.sin(t * CFG.m_freqY * 1.7 + 2.4) * hr.height * CFG.m_amplY / 300;
    if (CFG.m_gravity > 0) {
      const g = CFG.m_gravity / 100;
      tx = tx + (cxOff - tx) * g;
      ty = ty + (cyOff - ty) * g;
    }
    smX += (tx - smX) * CFG.m_smoothing;
    smY += (ty - smY) * CFG.m_smoothing;
    moveCursor(smX, smY);
    if (ts - lastSpawn > CFG.m_interval && Math.hypot(smX-lastX, smY-lastY) > CFG.m_threshold) {
      const img = trailImgs[idx] as HTMLImageElement;
      const s = imgRef;
      gsap.killTweensOf(img); gsap.set(img, { width:s, height:s });
      const ub = CFG.m_blur > 0;
      gsap.timeline()
        .set(img, { opacity:1, scale:1, x:smX-s/2, y:smY-s/2, zIndex:++z, ...(ub?{filter:'blur(0px)'}:{filter:'none'}) })
        .to(img, { duration:CFG.m_slideDuration, ease:'expo.out', x:tx-s/2, y:ty-s/2 }, 0)
        .to(img, { duration:CFG.m_fadeDuration, ease:'power3.out', scale:0, opacity:CFG.m_fadeOpacity, ...(ub?{filter:`blur(${CFG.m_blur}px)`}:{}) }, CFG.m_fadeDelay);
      idx = (idx+1) % trailImgs.length;
      lastX = smX; lastY = smY; lastSpawn = ts;
    }
    simFrameId = requestAnimationFrame(frame);
  }
  simFrameId = requestAnimationFrame(frame);
}

/* ── MODE : RANDOM ── */
function startRandom(gsap: any) {
  let idx = 0, z = 1;
  const lastPositions: Array<{x:number,y:number}> = [];

  function rand(min: number, max: number) { return min + Math.random() * (max - min); }
  function tooClose(x: number, y: number): boolean {
    return lastPositions.some(p => Math.hypot(p.x - x, p.y - y) < CFG.x_minDist);
  }

  function spawnOne() {
    const hr = hero.getBoundingClientRect();
    // Zone d'apparition : pourcentage de la hero
    const zoneW = hr.width  * CFG.x_zone / 100;
    const zoneH = hr.height * CFG.x_zone / 100;
    const offX  = (hr.width  - zoneW) / 2;
    const offY  = (hr.height - zoneH) / 2;

    // Position de base dans la zone
    const baseX = offX + Math.random() * zoneW;
    const baseY = offY + Math.random() * zoneH;

    // Dispersion aléatoire pondérée par x_randomness
    const disp = CFG.x_dispersion * (CFG.x_randomness / 100);
    let x = baseX + rand(-disp, disp);
    let y = baseY + rand(-disp, disp);

    // Gravité légère vers le centre
    x += (cx - x) * CFG.x_gravity * 0.01;
    y += (cy - y) * CFG.x_gravity * 0.01;

    x = Math.max(0, Math.min(hr.width,  x));
    y = Math.max(0, Math.min(hr.height, y));

    if (tooClose(x, y)) return;

    // Exclure la zone du texte hero
    const textEl = hero.querySelector('.hero-text') as HTMLElement;
    if (textEl) {
      const tr = textEl.getBoundingClientRect();
      const tx0 = tr.left - hr.left, ty0 = tr.top - hr.top;
      const pad = 20;
      if (x > tx0 - pad && x < tx0 + tr.width + pad && y > ty0 - pad && y < ty0 + tr.height + pad) return;
    }

    const sBase = rand(CFG.x_imgSizeMin, CFG.x_imgSizeMax);
    const scaleV = 1 + rand(-CFG.x_scaleVar, CFG.x_scaleVar);
    const s = sBase * scaleV;

    const img = trailImgs[idx] as HTMLImageElement;
    gsap.killTweensOf(img);
    gsap.set(img, { width:s, height:s });
    const ub = CFG.x_blur > 0;
    gsap.timeline()
      .set(img, { opacity: CFG.x_opacity, scale:1, x:x-s/2, y:y-s/2, zIndex:++z,
        ...(ub?{filter:'blur(0px)'}:{filter:'none'}) })
      .to(img, { duration:CFG.x_fadeDuration, ease:'power2.out',
        scale: 0,
        opacity: CFG.x_fadeOpacity,
        ...(ub?{filter:`blur(${CFG.x_blur}px)`}:{}) }, CFG.x_fadeDelay);
    idx = (idx+1) % trailImgs.length;

    lastPositions.push({ x, y });
    if (lastPositions.length > 12) lastPositions.shift();
  }

  touchTimer = setInterval(() => {
    const count = Math.max(1, Math.round(CFG.x_density));
    for (let i = 0; i < count; i++) spawnOne();
  }, CFG.x_interval) as unknown as number;
}

/* ── CONFIG PRODUCTION (sauvegardée via Apply) ── */
const PROD_KEY = 'trail-prod';
function loadProdConfig() {
  const isTouch = window.matchMedia('(hover:none)').matches;
  try {
    const saved = JSON.parse(localStorage.getItem(PROD_KEY + (isTouch ? '-touch' : '-desk')) || 'null');
    if (saved) Object.keys(saved).forEach(k => { if (k in CFG) CFG[k] = saved[k]; });
  } catch {}
}
loadProdConfig();

/* ── LAUNCH ── */
function launch() {
  waitForGSAP(gsap => {
    stopAll(); measure();
    switch (CFG.animMode) {
      case 'imgtrail': startDesktop(gsap); break;
      case 'spirale':  startSpirale(gsap); break;
      case 'rond':     startRond(gsap);    break;
      case 'trajet':   startTrajet(gsap);  break;
      case 'mousesim': startMouseSim(gsap);break;
      case 'random':   startRandom(gsap);  break;
    }
  });
}
launch();
function relaunch() { launch(); }

/* Exposer pour piloter depuis le parent (iframe) */
(window as any).__TRAIL_CFG = CFG;
(window as any).__TRAIL_RELAUNCH = relaunch;
(window as any).__TRAIL_MEASURE = measure;

/* ================================================================
   DEBUG PANEL
   Layout : panel pousse la page vers le haut (pas d'overlay)
   Rangée 1 : [Desktop] imgTrail  |  [Mobile] Spirale Rond Trajet MouseSim Random  |  [Viewport] presets
   Rangée 2 : [Section active]
   ================================================================ */

/* (viewport presets supprimés — remplacés par slider largeur) */

function sl(key: string, label: string, min: number, max: number, step: number) {
  return `<div class="d-sl"><span class="d-lbl">${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${CFG[key]}"><span class="d-val" data-v="${key}">${CFG[key]}</span></div>`;
}
function presets(prefix: string, slots = [1,2,3]) {
  return `<div class="d-presets" data-prefix="${prefix}">
    <div class="d-ps-col"><div class="d-ps-col-label">↓ Sauvegarder</div>
      <div class="d-ps-row">${slots.map(n=>`<button class="d-ps-save" data-save="${prefix}${n}">Slot ${n}</button>`).join('')}</div></div>
    <div class="d-ps-col"><div class="d-ps-col-label">▶ Charger</div>
      <div class="d-ps-row">${slots.map(n=>`<button class="d-ps-load" data-load="${prefix}${n}">Slot ${n}</button>`).join('')}</div></div>
  </div>`;
}

function buildDebug() {
  const PANEL_W = 320;
  const el = document.createElement('div');
  el.id = 'dbg';
  el.innerHTML = `<style>
#dbg{font:11px/1.4 -apple-system,sans-serif}
#dbg *{box-sizing:border-box}
/* Overlay : caché par défaut, iframe gauche + panel droite */
#dbg .d-overlay{position:fixed;inset:0;z-index:10000;display:none}
#dbg .d-overlay.open{display:flex}
#dbg .d-preview{flex:1;background:#111;display:flex;align-items:flex-start;justify-content:center;overflow:hidden}
#dbg .d-preview iframe{border:none;height:100%;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.5);transition:width .15s ease}
/* Panel */
#dbg .d-bar{width:${PANEL_W}px;flex-shrink:0;background:rgba(8,8,8,0.96);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#fff;padding:10px 12px 6px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;border-left:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column}
#dbg .d-bar-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:6px}
/* Header */
#dbg .d-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0}
#dbg .d-close{background:rgba(180,30,30,0.8);color:#fff;border:none;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
/* Modes */
#dbg .d-modes{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.07)}
#dbg .d-modes-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
#dbg .d-cat{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.3);min-width:48px;flex-shrink:0}
/* Slider largeur */
#dbg .d-vp-row{display:flex;align-items:center;gap:5px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.07)}
/* Sections */
#dbg .d-sect{display:none}
#dbg .d-sect.on{display:block}
#dbg .d-sect-title{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.32);margin-bottom:6px;margin-top:2px}
/* Sliders */
#dbg .d-sl{display:flex;align-items:center;gap:6px;white-space:nowrap}
#dbg .d-lbl{min-width:100px;color:rgba(255,255,255,.6);font-size:10px}
#dbg .d-val{min-width:30px;text-align:right;font-weight:600;font-size:10px;font-variant-numeric:tabular-nums}
#dbg input[type=range]{flex:1;min-width:40px;accent-color:#fff;height:14px}
/* Boutons */
#dbg .d-b{padding:3px 8px;border:1px solid rgba(255,255,255,.25);border-radius:12px;cursor:pointer;color:rgba(255,255,255,.55);font-size:10px;background:transparent;transition:all .15s;white-space:nowrap}
#dbg .d-b.on{background:#fff;color:#000;border-color:#fff}
#dbg .d-b:hover{border-color:rgba(255,255,255,.65)}
/* Toggle row (on/off pairs) */
#dbg .d-toggle-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
#dbg .d-toggle-group{display:flex;align-items:center;gap:4px}
#dbg .d-toggle-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.35);min-width:36px}
/* Blocs thématiques */
#dbg .d-axis-block{border-left:2px solid rgba(255,255,255,.12);padding:3px 0 3px 8px;margin-bottom:5px;display:flex;flex-direction:column;gap:2px}
#dbg .d-axis-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.28);margin-bottom:3px}
#dbg .d-axis-x{border-color:rgba(255,80,80,.5)}
#dbg .d-axis-x .d-axis-label{color:rgba(255,130,130,.65)}
#dbg .d-axis-y{border-color:rgba(80,140,255,.5)}
#dbg .d-axis-y .d-axis-label{color:rgba(130,170,255,.65)}
#dbg .d-axis-fade{border-color:rgba(200,80,255,.4)}
#dbg .d-axis-fade .d-axis-label{color:rgba(200,130,255,.6)}
#dbg .d-axis-appear{border-color:rgba(255,190,60,.4)}
#dbg .d-axis-appear .d-axis-label{color:rgba(255,200,100,.6)}
#dbg .d-axis-geo{border-color:rgba(80,210,140,.4)}
#dbg .d-axis-geo .d-axis-label{color:rgba(100,220,160,.6)}
/* Presets */
#dbg .d-presets{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px;border-top:1px solid rgba(255,255,255,.08);padding-top:5px}
#dbg .d-ps-col{display:flex;flex-direction:column;gap:3px}
#dbg .d-ps-col-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.22);margin-bottom:1px}
#dbg .d-ps-row{display:flex;gap:3px}
#dbg .d-ps-save{flex:1;padding:3px;background:transparent;border:1px dashed rgba(255,255,255,.18);border-radius:6px;color:rgba(255,255,255,.28);cursor:pointer;font-size:9px;transition:all .15s}
#dbg .d-ps-save:hover{border-color:rgba(255,255,255,.5);color:rgba(255,255,255,.65)}
#dbg .d-ps-load{flex:1;padding:3px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.28);border-radius:6px;color:#fff;cursor:pointer;font-size:9px;font-weight:600;transition:all .15s}
#dbg .d-ps-load:hover{background:rgba(255,255,255,.2)}
#dbg .d-ps-load.filled{background:rgba(255,255,255,.12);border-color:#fff}
/* Bouton action inline */
#dbg .d-action-btn{display:block;width:100%;text-align:center;margin:5px 0 2px;padding:5px 10px;border-radius:8px;font-size:10px}
/* Curseur simulé */
#sim-cursor{position:absolute;top:0;left:0;pointer-events:none;z-index:99999;transform:translate(-3px,-3px);will-change:transform}
/* ── Apply Desktop / Touch — toujours en bas du panel ── */
#dbg .d-apply-zone{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 0 4px;border-top:2px solid rgba(255,255,255,.18);margin-top:auto;flex-shrink:0}
#dbg .d-apply{padding:10px 6px;border:1px solid rgba(255,255,255,.35);border-radius:10px;cursor:pointer;background:rgba(255,255,255,.07);color:#fff;font:600 11px/1.3 -apple-system,sans-serif;text-align:center;transition:all .2s;display:flex;flex-direction:column;gap:3px;align-items:center}
#dbg .d-apply:hover{background:rgba(255,255,255,.18);border-color:#fff}
#dbg .d-apply-hint{font-size:9px;font-weight:400;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.06em}
#dbg #d-apply-desk:hover{background:rgba(80,140,255,.18);border-color:rgba(100,160,255,.8)}
#dbg #d-apply-touch:hover{background:rgba(80,210,140,.18);border-color:rgba(100,220,160,.8)}
#dbg .d-apply.saved{animation:d-flash .4s ease}
@keyframes d-flash{0%,100%{opacity:1}50%{opacity:.4}}
/* Indicateur taille image */
#dbg .d-img-ref{display:flex;align-items:center;gap:6px;padding:3px 0}
#dbg .d-img-ref-lbl{min-width:100px;color:rgba(255,255,255,.6);font-size:10px}
#dbg .d-img-ref-val{font-size:10px;font-weight:700;color:rgba(255,200,100,.9);font-variant-numeric:tabular-nums;letter-spacing:.03em}
</style>
<div class="d-overlay">
  <div class="d-preview"></div>
  <div class="d-bar">
    <div class="d-header">
      <span style="font-weight:700;font-size:12px;letter-spacing:.05em">Trail Debug</span>
      <button class="d-close" title="Fermer">✕</button>
    </div>

    <!-- Modes -->
    <div class="d-modes">
      <div class="d-modes-row">
        <span class="d-cat">Desktop</span>
        <button class="d-b d-mode on" data-anim="imgtrail">imgTrail</button>
      </div>
      <div class="d-modes-row">
        <span class="d-cat">Touch</span>
        <button class="d-b d-mode" data-anim="spirale">Spirale</button>
        <button class="d-b d-mode" data-anim="rond">Rond</button>
        <button class="d-b d-mode" data-anim="trajet">Trajet</button>
        <button class="d-b d-mode" data-anim="mousesim">MouseSim</button>
        <button class="d-b d-mode" data-anim="random">Random</button>
      </div>
      <div class="d-modes-row">
        <span class="d-cat">Outils</span>
        <button class="d-b d-mode" data-anim="layout">UI debug</button>
      </div>
    </div>

    <!-- Largeur iframe -->
    <div class="d-vp-row">
      <span class="d-cat">Larg.</span>
      <input type="range" id="d-vp-slider" min="320" max="${window.innerWidth}" step="10" value="390" style="flex:1;accent-color:#fff;height:14px">
      <span id="d-vp-val" style="min-width:34px;text-align:right;font-weight:600;font-size:10px">390px</span>
      <button class="d-b" id="d-vp-reset">↺</button>
      <button class="d-b" id="d-copy">Copier</button>
    </div>

    <!-- Zones de sections + Apply en bas -->
    <div class="d-bar-scroll">

    <!-- ══ imgTrail ══ -->
    <div class="d-sect on" data-s="imgtrail">
      <div class="d-sect-title">Image Trail — suivi souris desktop</div>
      <div class="d-axis-block d-axis-geo">
        <div class="d-axis-label">Suivi</div>
        ${sl('d_threshold',    'Sensibilité px',  5,   200, 5)}
        ${sl('d_lerp',         'Fluidité',        0.05,0.5, 0.01)}
        ${sl('d_slideDuration','Glissement s',    0.01,2,   0.01)}
      </div>
      <div class="d-axis-block d-axis-fade">
        <div class="d-axis-label">Disparition</div>
        ${sl('d_fadeDelay',   'Délai s',    0,   2,   0.05)}
        ${sl('d_fadeDuration','Durée s',    0.1, 3,   0.05)}
        ${sl('d_fadeOpacity', 'Opacité fin',0,   1,   0.05)}
        ${sl('d_blur',        'Flou px',    0,   200, 1)}
      </div>
      ${presets('d')}
    </div>

    <!-- ══ Spirale ══ -->
    <div class="d-sect" data-s="spirale">
      <div class="d-sect-title">Spirale</div>
      <div class="d-toggle-row">
        <div class="d-toggle-group">
          <span class="d-toggle-label">Centre</span>
          <button class="d-b" data-center="true">Photo</button>
          <button class="d-b" data-center="false">Page</button>
        </div>
        <div class="d-toggle-group">
          <span class="d-toggle-label">Chemin</span>
          <button class="d-b" data-showpath="1">On</button>
          <button class="d-b on" data-showpath="0">Off</button>
        </div>
      </div>
      <div class="d-axis-block d-axis-geo">
        <div class="d-axis-label">Géométrie</div>
        ${sl('t_turns',     'Tours',         1,   12,  1)}
        ${sl('t_radiusMin', 'Rayon int %',   2,   50,  1)}
        ${sl('t_radiusMax', 'Rayon ext %',   20,  200, 1)}
      </div>
      <div class="d-axis-block">
        <div class="d-axis-label">Vitesse</div>
        ${sl('t_interval',   'Intervalle ms',10,  400, 1)}
        ${sl('t_speedStart', 'Vit. début',   0.05,2,   0.05)}
        ${sl('t_speedEnd',   'Vit. fin',     0.05,3,   0.05)}
        ${sl('t_densityMax', 'Densité ext',  1,   15,  1)}
      </div>
      <div class="d-axis-block d-axis-appear">
        <div class="d-axis-label">Images</div>
        <div class="d-img-ref"><span class="d-img-ref-lbl">Taille référence</span><span class="d-img-ref-val">${imgRef} × ${imgRef} px</span></div>
      </div>
      <div class="d-axis-block d-axis-fade">
        <div class="d-axis-label">Disparition</div>
        ${sl('t_fadeDelay',   'Délai s',    0,   3,   0.05)}
        ${sl('t_fadeDuration','Durée s',    0.1, 4,   0.05)}
        ${sl('t_fadeOpacity', 'Opacité fin',0,   1,   0.05)}
        ${sl('t_blur',        'Flou px',    0,   200, 1)}
      </div>
      ${presets('t')}
    </div>

    <!-- ══ Rond ══ -->
    <div class="d-sect" data-s="rond">
      <div class="d-sect-title">Rond</div>
      <div class="d-toggle-row">
        <div class="d-toggle-group">
          <span class="d-toggle-label">Centre</span>
          <button class="d-b" data-center="true">Photo</button>
          <button class="d-b" data-center="false">Page</button>
        </div>
      </div>
      <div class="d-axis-block d-axis-geo">
        <div class="d-axis-label">Cercle</div>
        ${sl('r_radius',  'Rayon %',       5,   90,  1)}
        ${sl('r_speed',   'Rotation/tick', 0.01,0.3, 0.01)}
        ${sl('r_interval','Intervalle ms', 20,  500, 5)}
        ${sl('r_count',   'Images/tick',   1,   8,   1)}
      </div>
      <div class="d-axis-block d-axis-appear">
        <div class="d-axis-label">Images</div>
        <div class="d-img-ref"><span class="d-img-ref-lbl">Taille référence</span><span class="d-img-ref-val">${imgRef} × ${imgRef} px</span></div>
      </div>
      <div class="d-axis-block d-axis-fade">
        <div class="d-axis-label">Disparition</div>
        ${sl('r_fadeDelay',   'Délai s',    0,   3,   0.05)}
        ${sl('r_fadeDuration','Durée s',    0.1, 4,   0.05)}
        ${sl('r_fadeOpacity', 'Opacité fin',0,   1,   0.05)}
        ${sl('r_blur',        'Flou px',    0,   200, 1)}
      </div>
      ${presets('r')}
    </div>

    <!-- ══ Trajet ══ -->
    <div class="d-sect" data-s="trajet">
      <div class="d-sect-title">Trajet</div>
      <div class="d-axis-block d-axis-geo">
        <div class="d-axis-label">Trajectoire</div>
        ${sl('p_paths',   'Tracés',        1,   7,   1)}
        ${sl('p_interval','Intervalle ms', 30,  600, 10)}
        ${sl('p_stepSize','Pas/tick',      0.002,0.1,0.002)}
        ${sl('p_spread',  'Écart latéral', 0,   200, 5)}
        ${sl('p_curve',   'Courbure X',   -200, 200, 5)}
      </div>
      <div class="d-axis-block d-axis-appear">
        <div class="d-axis-label">Images</div>
        <div class="d-img-ref"><span class="d-img-ref-lbl">Taille référence</span><span class="d-img-ref-val">${imgRef} × ${imgRef} px</span></div>
      </div>
      <div class="d-axis-block d-axis-fade">
        <div class="d-axis-label">Disparition</div>
        ${sl('p_fadeDelay',   'Délai s',    0,   3,   0.05)}
        ${sl('p_fadeDuration','Durée s',    0.1, 4,   0.05)}
        ${sl('p_fadeOpacity', 'Opacité fin',0,   1,   0.05)}
        ${sl('p_blur',        'Flou px',    0,   200, 1)}
      </div>
      ${presets('p')}
    </div>

    <!-- ══ Mouse Sim ══ -->
    <div class="d-sect" data-s="mousesim">
      <div class="d-sect-title">Mouse Simulation</div>
      <div class="d-toggle-row">
        <div class="d-toggle-group">
          <span class="d-toggle-label">Curseur</span>
          <button class="d-b" data-cursor="1">On</button>
          <button class="d-b on" data-cursor="0">Off</button>
        </div>
        <div class="d-toggle-group">
          <span class="d-toggle-label">Guides</span>
          <button class="d-b" data-ampl="1">On</button>
          <button class="d-b on" data-ampl="0">Off</button>
        </div>
      </div>
      <div class="d-axis-block d-axis-x">
        <div class="d-axis-label">Axe X</div>
        ${sl('m_freqX',   'Fréquence',    0.1,  3,   0.05)}
        ${sl('m_amplX',   'Amplitude %',  5,    70,  1)}
        ${sl('m_offsetX', 'Offset centre',-50,  50,  1)}
      </div>
      <div class="d-axis-block d-axis-y">
        <div class="d-axis-label">Axe Y</div>
        ${sl('m_freqY',   'Fréquence',    0.1,  3,   0.05)}
        ${sl('m_amplY',   'Amplitude %',  5,    70,  1)}
        ${sl('m_offsetY', 'Offset centre',-50,  50,  1)}
      </div>
      <div class="d-axis-block d-axis-geo">
        <div class="d-axis-label">Mouvement</div>
        ${sl('m_speed',     'Vitesse',    0.002, 0.05, 0.001)}
        ${sl('m_smoothing', 'Lissage',    0.02,  0.5,  0.01)}
        ${sl('m_gravity',   'Magnétisme', 0,     100,  1)}
      </div>
      <div class="d-axis-block d-axis-appear">
        <div class="d-axis-label">Apparition</div>
        ${sl('m_threshold',    'Seuil px',   5,    80,  1)}
        ${sl('m_interval',     'Intervalle', 10,   200, 5)}
        <div class="d-img-ref"><span class="d-img-ref-lbl">Taille référence</span><span class="d-img-ref-val">${imgRef} × ${imgRef} px</span></div>
        ${sl('m_slideDuration','Glissement', 0.01, 2,   0.01)}
      </div>
      <div class="d-axis-block d-axis-fade">
        <div class="d-axis-label">Disparition</div>
        ${sl('m_fadeDelay',   'Délai s',      0,   2,   0.05)}
        ${sl('m_fadeDuration','Durée s',      0.1, 3,   0.05)}
        ${sl('m_fadeOpacity', 'Opacité fin',  0,   1,   0.05)}
        ${sl('m_blur',        'Flou px',      0,   200, 1)}
      </div>
      <button class="d-b d-action-btn" id="d-m-from-desktop">↙ Sync depuis imgTrail</button>
      ${presets('m')}
    </div>

    <!-- ══ Random ══ -->
    <div class="d-sect" data-s="random">
      <div class="d-sect-title">Random</div>
      <div class="d-axis-block d-axis-geo">
        <div class="d-axis-label">Zone & répartition</div>
        ${sl('x_zone',       'Zone %',       10,  100, 5)}
        ${sl('x_dispersion', 'Dispersion',   0,   300, 5)}
        ${sl('x_randomness', 'Aléatoire',    0,   100, 1)}
        ${sl('x_minDist',    'Dist. min px', 0,   200, 5)}
        ${sl('x_gravity',    'Gravité',      0,   100, 1)}
      </div>
      <div class="d-axis-block d-axis-appear">
        <div class="d-axis-label">Apparition</div>
        ${sl('x_interval',   'Intervalle ms',50,  1000,10)}
        ${sl('x_density',    'Images/batch', 1,   8,   1)}
        ${sl('x_imgSizeMin', 'Taille min px',20,  300, 5)}
        ${sl('x_imgSizeMax', 'Taille max px',40,  500, 5)}
        ${sl('x_scaleVar',   'Variation éch.',0,  1,   0.05)}
        ${sl('x_opacity',    'Opacité init.', 0.1,1,   0.05)}
      </div>
      <div class="d-axis-block d-axis-fade">
        <div class="d-axis-label">Disparition</div>
        ${sl('x_fadeDelay',   'Délai s',    0,   3,   0.05)}
        ${sl('x_fadeDuration','Durée s',    0.1, 4,   0.05)}
        ${sl('x_fadeOpacity', 'Opacité fin',0,   1,   0.05)}
        ${sl('x_blur',        'Flou px',    0,   200, 1)}
      </div>
      ${presets('x')}
    </div>

    <!-- ══ Layout ══ -->
    <div class="d-sect" data-s="layout">
      <div class="d-sect-title">Layout / UI debug</div>
      <div class="d-toggle-row" style="flex-direction:column;gap:5px">
        <button class="d-b" id="dbg-grid" style="text-align:left">Grille CSS 12 colonnes</button>
        <button class="d-b" id="dbg-hero-bounds" style="text-align:left">Contour hero</button>
        <button class="d-b" id="dbg-bp" style="text-align:left">Lire breakpoint</button>
      </div>
      <div id="dbg-bp-val" style="font-size:10px;color:rgba(255,255,255,.45);margin-top:4px"></div>
    </div>

    </div><!-- /d-bar-scroll -->

    <!-- ══ Apply — toujours visible en bas ══ -->
    <div class="d-apply-zone">
      <button class="d-apply" id="d-apply-desk">
        <span>Apply Desktop</span>
        <span class="d-apply-hint">🖥 Non tactile</span>
      </button>
      <button class="d-apply" id="d-apply-touch">
        <span>Apply Touch</span>
        <span class="d-apply-hint">👆 Tactile</span>
      </button>
    </div>

  </div><!-- /d-bar -->
</div><!-- /d-overlay -->`;

  document.body.appendChild(el);

  /* ── Indicateur taille image — mis à jour quand imgRef change ── */
  updateImgRefIndicator = () => {
    el.querySelectorAll('.d-img-ref-val').forEach(e => {
      e.textContent = imgRef + ' × ' + imgRef + ' px';
    });
  };

  const overlay  = el.querySelector('.d-overlay') as HTMLElement;
  const previewArea = el.querySelector('.d-preview') as HTMLElement;
  const vpSlider = el.querySelector('#d-vp-slider') as HTMLInputElement;
  const vpVal    = el.querySelector('#d-vp-val') as HTMLElement;
  const vpReset  = el.querySelector('#d-vp-reset') as HTMLElement;
  let vpIframe: HTMLIFrameElement | null = null;

  /* ── Créer / détruire l'iframe dans .d-preview ── */
  function createPreviewFrame() {
    if (vpIframe) return;
    vpIframe = document.createElement('iframe');
    vpIframe.src = window.location.href;
    vpIframe.style.cssText = 'border:none;height:100%;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.35);transition:width .15s ease;';
    vpIframe.style.width = vpSlider.value + 'px';
    vpIframe.addEventListener('load', () => syncCfgToIframe());
    previewArea.appendChild(vpIframe);
  }
  function removePreviewFrame() {
    if (vpIframe) { vpIframe.remove(); vpIframe = null; }
  }

  /* Pousser CFG dans l'iframe et relancer */
  function syncCfgToIframe() {
    if (!vpIframe?.contentWindow) return;
    const iw = vpIframe.contentWindow as any;
    const wait = setInterval(() => {
      if (iw.__TRAIL_CFG) {
        clearInterval(wait);
        Object.keys(CFG).forEach(k => { iw.__TRAIL_CFG[k] = CFG[k]; });
        const iDbg = iw.document.getElementById('dbg');
        if (iDbg) iDbg.remove();
        iw.__TRAIL_RELAUNCH();
      }
    }, 100);
  }

  /* ── Exposer openDebug pour le cheat code clavier ── */
  (window as any).__TRAIL_OPEN_DEBUG = () => { overlay.classList.add('open'); createPreviewFrame(); };

  /* ── Croix : ferme tout ── */
  el.querySelector('.d-close')!.addEventListener('click', () => {
    overlay.classList.remove('open');
    removePreviewFrame();
    vpSlider.value = '390'; vpVal.textContent = '390px';
    CFG.animMode = 'imgtrail';
    syncBtns();
    el.querySelectorAll('.d-sect').forEach(sec =>
      sec.classList.toggle('on', (sec as HTMLElement).dataset.s === 'imgtrail'));
    relaunch();
  });

  /* ── Slider largeur iframe ── */
  function applyVpWidth(w: number) {
    vpVal.textContent = w + 'px';
    if (vpIframe) vpIframe.style.width = w + 'px';
  }
  vpSlider.addEventListener('input', () => applyVpWidth(parseInt(vpSlider.value)));
  vpReset.addEventListener('click', () => {
    vpSlider.value = '390'; applyVpWidth(390);
  });

  /* ── Modes ── */
  el.querySelectorAll('.d-mode').forEach(b => b.addEventListener('click', () => {
    const anim = (b as HTMLElement).dataset.anim!;
    if (anim !== 'layout') { CFG.animMode = anim; relaunch(); syncCfgToIframe(); }
    el.querySelectorAll('.d-mode').forEach(x => x.classList.toggle('on', x === b));
    el.querySelectorAll('.d-sect').forEach(s =>
      s.classList.toggle('on', (s as HTMLElement).dataset.s === anim));
  }));

  /* ── Centre (Spirale/Rond) ── */
  el.querySelectorAll('[data-center]').forEach(b => b.addEventListener('click', () => {
    CFG.centerOnPhoto = (b as HTMLElement).dataset.center === 'true';
    syncBtns(); measure();
  }));

  /* ── Chemin (Spirale) ── */
  el.querySelectorAll('[data-showpath]').forEach(b => b.addEventListener('click', () => {
    CFG.t_showPath = parseInt((b as HTMLElement).dataset.showpath!);
    el.querySelectorAll('[data-showpath]').forEach(x => x.classList.toggle('on', x === b));
    ensurePathCanvas(); updatePathCanvas();
  }));

  /* ── Curseur (MouseSim) ── */
  el.querySelectorAll('[data-cursor]').forEach(b => b.addEventListener('click', () => {
    CFG.m_showCursor = parseInt((b as HTMLElement).dataset.cursor!);
    syncBtns();
    if (CFG.animMode === 'mousesim') relaunch();
  }));

  /* ── Guides amplitude (MouseSim) ── */
  el.querySelectorAll('[data-ampl]').forEach(b => b.addEventListener('click', () => {
    CFG.m_showAmpl = parseInt((b as HTMLElement).dataset.ampl!);
    syncBtns();
    if (CFG.m_showAmpl) { makeAmplGuides(); updateAmplGuides(); }
    else if (amplGuides) { amplGuides.remove(); amplGuides = null; }
  }));

  /* ── Récupérer du desktop (MouseSim ← imgTrail) ── */
  el.querySelector('#d-m-from-desktop')?.addEventListener('click', () => {
    // Copier les paramètres partagés : fade, blur, slide
    CFG.m_slideDuration = CFG.d_slideDuration;
    CFG.m_fadeDelay     = CFG.d_fadeDelay;
    CFG.m_fadeDuration  = CFG.d_fadeDuration;
    CFG.m_fadeOpacity   = CFG.d_fadeOpacity;
    CFG.m_blur          = CFG.d_blur;
    CFG.m_threshold     = CFG.d_threshold;
    syncAllSliders();
    if (CFG.animMode === 'mousesim') { relaunch(); syncCfgToIframe(); }
    const btn = el.querySelector('#d-m-from-desktop') as HTMLElement;
    btn.textContent = 'Copié !'; setTimeout(() => btn.textContent = 'Récupérer du desktop', 1500);
  });

  /* ── Sliders ── */
  el.querySelectorAll('input[type=range]').forEach(inp => {
    const input = inp as HTMLInputElement;
    const k = input.dataset.k!;
    input.addEventListener('input', () => {
      CFG[k] = parseFloat(input.value);
      const vEl = el.querySelector(`[data-v="${k}"]`) as HTMLElement;
      if (vEl) vEl.textContent = input.value;
      if (k === 't_radiusMin' || k === 't_radiusMax') { measure(); updatePathCanvas(); }
      if (k === 't_showPath' || k === 't_turns') { ensurePathCanvas(); updatePathCanvas(); }
      if (k === 'm_showCursor') { if (CFG.animMode==='mousesim') relaunch(); }
      if (k.startsWith('m_ampl') || k === 'm_offsetX' || k === 'm_offsetY') updateAmplGuides();
      if (['t_interval','t_speedStart','t_speedEnd','t_densityMax','t_turns'].includes(k) && CFG.animMode==='spirale') relaunch();
      syncCfgToIframe();
    });
  });

  /* ── Copier ── */
  el.querySelector('#d-copy')!.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(CFG, null, 2)).then(() => {
      const b = el.querySelector('#d-copy') as HTMLElement;
      b.textContent = 'Copié !'; setTimeout(() => b.textContent = 'Copier', 1500);
    });
  });

  /* ── Apply Desktop / Apply Touch ── */
  function applyProd(type: 'desk'|'touch') {
    const snap: Record<string,any> = {};
    Object.keys(CFG).forEach(k => snap[k] = CFG[k]);
    localStorage.setItem(PROD_KEY + '-' + type, JSON.stringify(snap));
    const btn = el.querySelector(type === 'desk' ? '#d-apply-desk' : '#d-apply-touch') as HTMLElement;
    btn.classList.add('saved');
    const orig = btn.querySelector('span:first-child')!.textContent!;
    btn.querySelector('span:first-child')!.textContent = '✓ Enregistré';
    setTimeout(() => { btn.classList.remove('saved'); btn.querySelector('span:first-child')!.textContent = orig; }, 1800);
  }
  el.querySelector('#d-apply-desk')!.addEventListener('click', () => applyProd('desk'));
  el.querySelector('#d-apply-touch')!.addEventListener('click', () => applyProd('touch'));

  /* ── Layout debug ── */
  let gridEl: HTMLElement | null = null;
  el.querySelector('#dbg-grid')!.addEventListener('click', e => {
    const btn = e.currentTarget as HTMLElement;
    if (gridEl) { gridEl.remove(); gridEl=null; btn.classList.remove('on'); return; }
    gridEl = document.createElement('div');
    gridEl.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:9989;
      background:repeating-linear-gradient(90deg,rgba(255,0,0,.06) 0,rgba(255,0,0,.06) 1px,transparent 1px,transparent calc(100%/12))`;
    document.body.appendChild(gridEl); btn.classList.add('on');
  });
  let heroBoundsEl: HTMLElement | null = null;
  el.querySelector('#dbg-hero-bounds')!.addEventListener('click', e => {
    const btn = e.currentTarget as HTMLElement;
    if (heroBoundsEl) { heroBoundsEl.remove(); heroBoundsEl=null; btn.classList.remove('on'); return; }
    heroBoundsEl = document.createElement('div');
    const r = hero!.getBoundingClientRect();
    heroBoundsEl.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;border:1px solid rgba(0,255,255,.55);pointer-events:none;z-index:9989`;
    document.body.appendChild(heroBoundsEl); btn.classList.add('on');
  });
  const bpVal = el.querySelector('#dbg-bp-val') as HTMLElement;
  el.querySelector('#dbg-bp')!.addEventListener('click', () => {
    const w = window.innerWidth;
    bpVal.textContent = `${w}px — ${w<768?'mobile':w<960?'tablette':w<1024?'tablette-lg':'desktop'}`;
  });

  /* ── Presets ── */
  const PRESET_KEY = 'trail-debug-presets';
  const loadAll = (): Record<string,any> => { try { return JSON.parse(localStorage.getItem(PRESET_KEY)||'{}'); } catch { return {}; } };
  const saveAll = (p: Record<string,any>) => localStorage.setItem(PRESET_KEY, JSON.stringify(p));
  function syncPresetLabels() {
    const stored = loadAll();
    el.querySelectorAll('[data-load]').forEach(btn => {
      const id = (btn as HTMLElement).dataset.load!;
      btn.classList.toggle('filled', !!stored[id]);
      (btn as HTMLElement).textContent = stored[id]
        ? `Slot ${id.slice(-1)} (${new Date(stored[id]._saved||0).toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'})})`
        : `Slot ${id.slice(-1)}`;
    });
  }
  function syncAllSliders() {
    el.querySelectorAll('input[type=range]').forEach(inp => {
      const input = inp as HTMLInputElement; const k = input.dataset.k!;
      if (CFG[k] !== undefined) {
        input.value = String(CFG[k]);
        const vEl = el.querySelector(`[data-v="${k}"]`) as HTMLElement;
        if (vEl) vEl.textContent = String(CFG[k]);
      }
    });
  }
  el.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', () => {
    const id = (btn as HTMLElement).dataset.save!;
    const prefix = id[0];
    const stored = loadAll();
    const snap: Record<string,any> = { _saved: Date.now() };
    Object.keys(CFG).filter(k=>k.startsWith(prefix+'_')).forEach(k=>snap[k]=CFG[k]);
    stored[id]=snap; saveAll(stored); syncPresetLabels();
    (btn as HTMLElement).textContent='Sauvegardé !';
    setTimeout(()=>(btn as HTMLElement).textContent=`Slot ${id.slice(-1)}`,1200);
  }));
  el.querySelectorAll('[data-load]').forEach(btn => btn.addEventListener('click', () => {
    const id = (btn as HTMLElement).dataset.load!;
    const stored = loadAll(); if (!stored[id]) return;
    Object.entries(stored[id]).forEach(([k,v])=>{ if(k!=='_saved'&&CFG[k]!==undefined) CFG[k]=v as number; });
    syncAllSliders(); measure(); ensurePathCanvas(); updatePathCanvas(); relaunch();
  }));
  syncPresetLabels();

  function syncBtns() {
    el.querySelectorAll('.d-mode').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.anim === CFG.animMode));
    el.querySelectorAll('[data-center]').forEach(b => b.classList.toggle('on', ((b as HTMLElement).dataset.center==='true')===CFG.centerOnPhoto));
    el.querySelectorAll('[data-cursor]').forEach(b => b.classList.toggle('on', parseInt((b as HTMLElement).dataset.cursor!)=== CFG.m_showCursor));
    el.querySelectorAll('[data-ampl]').forEach(b => b.classList.toggle('on', parseInt((b as HTMLElement).dataset.ampl!)=== CFG.m_showAmpl));
    el.querySelectorAll('[data-showpath]').forEach(b => b.classList.toggle('on', parseInt((b as HTMLElement).dataset.showpath!)=== CFG.t_showPath));
  }
  syncBtns();
}
buildDebug();

/* ── Cheat code : taper "dbg" n'importe où pour ouvrir le debug ── */
let _cs = '', _ct = 0;
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.target as HTMLElement).matches('input,textarea,select,[contenteditable]')) return;
  clearTimeout(_ct);
  _cs += e.key.toLowerCase();
  if (_cs.length > 3) _cs = _cs.slice(-3);
  if (_cs === 'dbg') { _cs = ''; (window as any).__TRAIL_OPEN_DEBUG?.(); }
  _ct = setTimeout(() => { _cs = ''; }, 2000) as unknown as number;
});
