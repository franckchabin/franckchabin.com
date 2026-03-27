/* ================================================================
   IMAGE TRAIL — hero animation (desktop + tactile)
   Config centralisée + panneau debug togglable
   ================================================================ */
const hero = document.getElementById('hero');
const trailImgs = Array.from(document.querySelectorAll('.hero-trail-img'));
if (!hero || trailImgs.length === 0) throw new Error('Hero elements not found');

function waitForGSAP(cb: () => void) {
  if ((window as any).gsap) { cb(); return; }
  const id = setInterval(() => {
    if ((window as any).gsap) { clearInterval(id); cb(); }
  }, 50);
}

/* ── CONFIG ── */
const CFG: Record<string, any> = {
  mode: 'auto', centerOnPhoto: true,
  // Spirale
  t_interval: 172, t_radiusMin: 15, t_radiusMax: 96,
  t_speedStart: 0.25, t_speedEnd: 0.3,
  t_densityMax: 1,
  t_fadeDelay: 0.6, t_fadeDuration: 1.2,
  t_fadeOpacity: 0, t_blur: 0,
  t_turns: 3,       // nb de tours de spirale
  t_imgSize: 150,   // taille des images en px
  t_showPath: 0,    // 0=caché, 1=visible (chemin tracé)
  // Desktop
  d_threshold: 30, d_lerp: 0.36,
  d_slideDuration: 0.1,
  d_fadeDelay: 0.3, d_fadeDuration: 0.9,
  d_fadeOpacity: 0.2, d_blur: 30,
};

function isTouch(): boolean {
  if (CFG.mode === 'touch') return true;
  if (CFG.mode === 'desktop') return false;
  return !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

const photo = hero.querySelector('.hero-photo-wrapper') as HTMLElement;
let cx = 0, cy = 0, minR = 0, maxR = 0;
function measure() {
  const hr = hero.getBoundingClientRect();
  const vmin = Math.min(hr.width, hr.height);
  if (CFG.centerOnPhoto && photo) {
    const pr = photo.getBoundingClientRect();
    cx = pr.left - hr.left + pr.width / 2;
    cy = pr.top  - hr.top  + pr.height / 2;
  } else { cx = hr.width / 2; cy = hr.height / 2; }
  minR = vmin * CFG.t_radiusMin / 100;
  maxR = vmin * CFG.t_radiusMax / 100;
}
measure();
window.addEventListener('resize', () => { measure(); updatePathCanvas(); }, { passive: true });

/* ── ANIMATIONS ── */
let touchTimer: number | null = null;
let deskRunning = false, deskBound = false;

function stopAll() {
  if (touchTimer) { clearInterval(touchTimer); touchTimer = null; }
  deskRunning = false;
  const g = (window as any).gsap;
  if (g) trailImgs.forEach(img => { g.killTweensOf(img); g.set(img, { opacity: 0, scale: 0 }); });
}

/* -- Spirale (tactile) -- */
let pathCanvas: HTMLCanvasElement | null = null;

function updatePathCanvas() {
  if (!pathCanvas) return;
  const hr = hero.getBoundingClientRect();
  pathCanvas.width  = hr.width;
  pathCanvas.height = hr.height;
  const ctx = pathCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, pathCanvas.width, pathCanvas.height);
  if (!CFG.t_showPath) return;
  ctx.strokeStyle = 'rgba(255,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  const totalAngle = Math.PI * 2 * CFG.t_turns;
  const steps = Math.ceil(totalAngle / 0.05);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * totalAngle;
    const p = a / totalAngle;
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

function startTouch(gsap: any) {
  let idx = 0, z = 1, angle = 0;
  measure();
  ensurePathCanvas();
  updatePathCanvas();

  function tick() {
    const totalAngle = Math.PI * 2 * CFG.t_turns;
    const p = (angle % totalAngle) / totalAngle;
    const r = minR + (maxR - minR) * p;
    const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
    const img = trailImgs[idx] as HTMLImageElement;
    const s = CFG.t_imgSize;
    gsap.killTweensOf(img);
    gsap.set(img, { width: s, height: s });
    const useBlur = CFG.t_blur > 0;
    gsap.timeline()
      .set(img, { opacity: 1, scale: 1, x: x-s/2, y: y-s/2, zIndex: ++z,
        ...(useBlur ? { filter:'blur(0px)' } : { filter:'none' }) })
      .to(img, { duration: CFG.t_fadeDuration, ease:'power3.out', scale: 0,
        opacity: CFG.t_fadeOpacity,
        ...(useBlur ? { filter:`blur(${CFG.t_blur}px)` } : {})
      }, CFG.t_fadeDelay);
    idx = (idx + 1) % trailImgs.length;
    const ratio = (maxR - minR) > 0 ? (r - minR) / (maxR - minR) : 0;
    angle += CFG.t_speedStart + (CFG.t_speedEnd - CFG.t_speedStart) * ratio;
  }
  touchTimer = setInterval(() => {
    const totalAngle = Math.PI * 2 * CFG.t_turns;
    const p = (angle % totalAngle) / totalAngle;
    const count = Math.max(1, Math.round(1 + (CFG.t_densityMax - 1) * p));
    for (let i = 0; i < count; i++) tick();
  }, CFG.t_interval) as unknown as number;
}

/* -- Trail souris (desktop) -- */
function startDesktop(gsap: any) {
  let mouse = {x:0,y:0}, last = {x:0,y:0}, sm = {x:0,y:0};
  let idx = 0, z = 1;
  const lerp = (a:number,b:number,n:number) => (1-n)*a+n*b;
  const dist2 = (a:{x:number,y:number},b:{x:number,y:number}) => Math.hypot(b.x-a.x,b.y-a.y);
  if (!deskBound) {
    hero.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect(); mouse.x = e.clientX-r.left; mouse.y = e.clientY-r.top;
    });
    hero.addEventListener('mouseenter', () => { deskRunning=true; sm={...mouse}; last={...mouse}; loop(); });
    hero.addEventListener('mouseleave', () => { deskRunning=false; });
    deskBound = true;
  }
  function loop() {
    if (!deskRunning) return;
    sm.x = lerp(sm.x, mouse.x, CFG.d_lerp); sm.y = lerp(sm.y, mouse.y, CFG.d_lerp);
    if (dist2(mouse, last) > CFG.d_threshold) { show(); last = {...mouse}; }
    requestAnimationFrame(loop);
  }
  function show() {
    const img = trailImgs[idx] as HTMLImageElement;
    const w = img.offsetWidth||150, h = img.offsetHeight||150;
    gsap.killTweensOf(img);
    const useBlur = CFG.d_blur > 0;
    gsap.timeline()
      .set(img, { opacity:1, scale:1, x:sm.x-w/2, y:sm.y-h/2, zIndex:++z,
        ...(useBlur ? {filter:'blur(0px)'} : {filter:'none'}) })
      .to(img, { duration:CFG.d_slideDuration, ease:'expo.out', x:mouse.x-w/2, y:mouse.y-h/2 }, 0)
      .to(img, { duration:CFG.d_fadeDuration, ease:'power3.out', scale:0,
        opacity:CFG.d_fadeOpacity,
        ...(useBlur ? {filter:`blur(${CFG.d_blur}px)`} : {})
      }, CFG.d_fadeDelay);
    idx = (idx+1) % trailImgs.length;
  }
}

function launch() {
  waitForGSAP(() => { const g=(window as any).gsap; stopAll(); measure();
    if (isTouch()) startTouch(g); else startDesktop(g); });
}
launch();
function relaunch() { launch(); }

/* ================================================================
   DEBUG PANEL — horizontal, semi-transparent, mobile-friendly
   ================================================================ */
function sl(key:string, label:string, min:number, max:number, step:number): string {
  return `<div class="d-sl"><span class="d-lbl">${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${CFG[key]}"><span class="d-val" data-v="${key}">${CFG[key]}</span></div>`;
}

function buildDebug() {
  const el = document.createElement('div');
  el.id = 'dbg';
  el.innerHTML = `<style>
#dbg{position:fixed;bottom:0;left:0;right:0;z-index:9999;font:11px/1.4 -apple-system,sans-serif;pointer-events:none}
#dbg *{box-sizing:border-box}
#dbg .d-bar{pointer-events:auto;background:rgba(0,0,0,0.75);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  color:#fff;padding:10px 16px;display:none;overflow-x:auto;-webkit-overflow-scrolling:touch}
#dbg .d-bar.open{display:block}
#dbg .d-tog{pointer-events:auto;position:fixed;bottom:10px;right:10px;z-index:10001;background:rgba(0,0,0,0.6);
  color:#fff;border:1px solid rgba(255,255,255,0.3);padding:5px 14px;border-radius:20px;cursor:pointer;font:11px/1 -apple-system,sans-serif;backdrop-filter:blur(6px)}
/* Sections */
#dbg .d-tabs{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center}
#dbg .d-tab{padding:4px 12px;border:1px solid rgba(255,255,255,0.3);border-radius:14px;cursor:pointer;color:rgba(255,255,255,0.6);font-size:11px;transition:all .15s;background:transparent}
#dbg .d-tab.on{background:#fff;color:#000;border-color:#fff}
#dbg .d-sect{display:none}
#dbg .d-sect.on{display:block}
/* Grid de sliders — horizontal */
#dbg .d-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 16px}
#dbg .d-sl{display:flex;align-items:center;gap:6px;white-space:nowrap}
#dbg .d-lbl{min-width:110px;color:rgba(255,255,255,0.7);font-size:10px}
#dbg .d-val{min-width:36px;text-align:right;font-weight:600;font-size:10px;font-variant-numeric:tabular-nums}
#dbg input[type=range]{flex:1;min-width:60px;accent-color:#fff;height:14px}
/* Boutons mode */
#dbg .d-btns{display:flex;gap:4px;flex-wrap:wrap}
#dbg .d-b{padding:4px 10px;border:1px solid rgba(255,255,255,0.3);border-radius:12px;cursor:pointer;color:rgba(255,255,255,0.6);font-size:10px;background:transparent;transition:all .15s}
#dbg .d-b.on{background:#fff;color:#000;border-color:#fff}
#dbg .d-b:hover{border-color:#fff}
#dbg .d-copy{margin-left:auto}
/* Presets — save à gauche, load à droite */
#dbg .d-presets{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.15);padding-top:8px}
#dbg .d-ps-col{display:flex;flex-direction:column;gap:4px}
#dbg .d-ps-col-label{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.3);margin-bottom:1px}
#dbg .d-ps-row{display:flex;gap:4px}
#dbg .d-ps-save{flex:1;padding:4px 4px;background:transparent;border:1px dashed rgba(255,255,255,0.2);border-radius:7px;color:rgba(255,255,255,0.3);cursor:pointer;font-size:9px;transition:all .15s}
#dbg .d-ps-save:hover{border-color:rgba(255,255,255,0.5);color:rgba(255,255,255,0.7)}
#dbg .d-ps-load{flex:1;padding:4px 4px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.4);border-radius:7px;color:#fff;cursor:pointer;font-size:9px;font-weight:600;transition:all .15s}
#dbg .d-ps-load:hover{background:rgba(255,255,255,0.22);border-color:#fff}
#dbg .d-ps-load.filled{background:rgba(255,255,255,0.18);border-color:#fff}
</style>
<button class="d-tog">Debug</button>
<div class="d-bar">
  <!-- Tabs -->
  <div class="d-tabs">
    <button class="d-tab on" data-tab="mode">Mode</button>
    <button class="d-tab" data-tab="spirale">Spirale</button>
    <button class="d-tab" data-tab="desktop">Desktop</button>
    <button class="d-b d-copy" id="d-copy">Copier</button>
  </div>

  <!-- Mode -->
  <div class="d-sect on" data-s="mode">
    <div class="d-btns">
      <button class="d-b" data-mode="auto">Auto</button>
      <button class="d-b" data-mode="desktop">Desktop</button>
      <button class="d-b" data-mode="touch">Tactile</button>
      <span style="width:16px"></span>
      <button class="d-b" data-center="true">Photo</button>
      <button class="d-b" data-center="false">Centre page</button>
    </div>
  </div>

  <!-- Spirale -->
  <div class="d-sect" data-s="spirale">
    <div class="d-grid">
      ${sl('t_interval',       'Vitesse générale',    10, 400, 1)}
      ${sl('t_speedStart',     'Vitesse début',       0.05, 2, 0.05)}
      ${sl('t_speedEnd',       'Vitesse fin',         0.05, 3, 0.05)}
      ${sl('t_densityMax',     'Densité extérieur',   1, 15, 1)}
      ${sl('t_radiusMin',      'Rayon intérieur %',   2, 50, 1)}
      ${sl('t_radiusMax',      'Rayon extérieur %',   20, 150, 1)}
      ${sl('t_fadeDelay',      'Délai disparition',   0, 3, 0.05)}
      ${sl('t_fadeDuration',   'Durée disparition',   0.1, 4, 0.05)}
      ${sl('t_fadeOpacity',    'Opacité finale',      0, 1, 0.05)}
      ${sl('t_blur',           'Flou disparition',    0, 200, 1)}
      ${sl('t_turns',          'Nombre de tours',     1, 12, 1)}
      ${sl('t_imgSize',        'Taille des images',   30, 400, 5)}
      <div class="d-sl"><span class="d-lbl">Voir le chemin</span><input type="range" data-k="t_showPath" min="0" max="1" step="1" value="0"><span class="d-val" data-v="t_showPath">0</span></div>
    </div>
    <div class="d-presets" data-prefix="t">
      <div class="d-ps-col">
        <div class="d-ps-col-label">↓ Sauvegarder</div>
        <div class="d-ps-row">${[1,2,3].map(n => `<button class="d-ps-save" data-save="t${n}">Slot ${n}</button>`).join('')}</div>
      </div>
      <div class="d-ps-col">
        <div class="d-ps-col-label">▶ Charger</div>
        <div class="d-ps-row">${[1,2,3].map(n => `<button class="d-ps-load" data-load="t${n}" id="d-tload${n}">Slot ${n}</button>`).join('')}</div>
      </div>
    </div>
  </div>

  <!-- Desktop -->
  <div class="d-sect" data-s="desktop">
    <div class="d-grid">
      ${sl('d_threshold',      'Sensibilité',         5, 200, 5)}
      ${sl('d_lerp',           'Fluidité',            0.05, 0.5, 0.01)}
      ${sl('d_slideDuration',  'Glissement',          0.01, 2, 0.01)}
      ${sl('d_fadeDelay',      'Délai disparition',   0, 2, 0.05)}
      ${sl('d_fadeDuration',   'Durée disparition',   0.1, 3, 0.05)}
      ${sl('d_fadeOpacity',    'Opacité finale',      0, 1, 0.05)}
      ${sl('d_blur',           'Flou disparition',    0, 200, 1)}
    </div>
    <div class="d-presets" data-prefix="d">
      <div class="d-ps-col">
        <div class="d-ps-col-label">↓ Sauvegarder</div>
        <div class="d-ps-row">${[1,2,3].map(n => `<button class="d-ps-save" data-save="d${n}">Slot ${n}</button>`).join('')}</div>
      </div>
      <div class="d-ps-col">
        <div class="d-ps-col-label">▶ Charger</div>
        <div class="d-ps-row">${[1,2,3].map(n => `<button class="d-ps-load" data-load="d${n}" id="d-dload${n}">Slot ${n}</button>`).join('')}</div>
      </div>
    </div>
  </div>
</div>`;
  document.body.appendChild(el);

  // Toggle
  el.querySelector('.d-tog')!.addEventListener('click', () =>
    el.querySelector('.d-bar')!.classList.toggle('open'));

  // Tabs
  el.querySelectorAll('.d-tab').forEach(tab => tab.addEventListener('click', () => {
    el.querySelectorAll('.d-tab').forEach(t => t.classList.toggle('on', t === tab));
    const s = (tab as HTMLElement).dataset.tab!;
    el.querySelectorAll('.d-sect').forEach(sec =>
      sec.classList.toggle('on', (sec as HTMLElement).dataset.s === s));
  }));

  // Mode buttons
  el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    CFG.mode = (b as HTMLElement).dataset.mode!; syncBtns(); relaunch();
  }));
  el.querySelectorAll('[data-center]').forEach(b => b.addEventListener('click', () => {
    CFG.centerOnPhoto = (b as HTMLElement).dataset.center === 'true'; syncBtns(); measure();
  }));

  // Sliders
  el.querySelectorAll('input[type=range]').forEach(inp => {
    const input = inp as HTMLInputElement;
    const k = input.dataset.k!;
    input.addEventListener('input', () => {
      CFG[k] = parseFloat(input.value);
      (el.querySelector(`[data-v="${k}"]`) as HTMLElement).textContent = input.value;
      measure();
      if (k === 't_showPath' || k === 't_turns' || k === 't_radiusMin' || k === 't_radiusMax') {
        ensurePathCanvas(); updatePathCanvas();
      }
      if (k === 't_imgSize') {
        trailImgs.forEach(img => { (window as any).gsap?.set(img, { width: CFG.t_imgSize, height: CFG.t_imgSize }); });
      }
      if (k.startsWith('t_') && isTouch() && !['t_showPath','t_imgSize','t_fadeOpacity','t_blur','t_fadeDelay','t_fadeDuration'].includes(k)) relaunch();
    });
  });

  // Copy
  el.querySelector('#d-copy')!.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(CFG, null, 2)).then(() => {
      const b = el.querySelector('#d-copy') as HTMLElement;
      b.textContent = 'Copié !'; setTimeout(() => b.textContent = 'Copier', 1500);
    });
  });

  // ── Presets ──
  const PRESET_KEY = 'trail-debug-presets';
  function loadAllPresets(): Record<string, any> {
    try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch { return {}; }
  }
  function saveAllPresets(p: Record<string, any>) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(p));
  }
  function presetKeys(prefix: string) {
    return Object.keys(CFG).filter(k => k.startsWith(prefix + '_'));
  }
  function syncPresetLabels() {
    const stored = loadAllPresets();
    el.querySelectorAll('[data-load]').forEach(btn => {
      const id = (btn as HTMLElement).dataset.load!;
      btn.classList.toggle('filled', !!stored[id]);
      if (stored[id]) {
        const d = new Date(stored[id]._saved || 0);
        const t = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
        (btn as HTMLElement).textContent = `Preset ${id.slice(-1)} (${t})`;
      } else {
        (btn as HTMLElement).textContent = `Preset ${id.slice(-1)}`;
      }
    });
  }
  function syncAllSliders() {
    el.querySelectorAll('input[type=range]').forEach(inp => {
      const input = inp as HTMLInputElement;
      const k = input.dataset.k!;
      if (CFG[k] !== undefined) {
        input.value = String(CFG[k]);
        const valEl = el.querySelector(`[data-v="${k}"]`) as HTMLElement;
        if (valEl) valEl.textContent = String(CFG[k]);
      }
    });
  }

  el.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.save!;
      const prefix = id[0];
      const keys = presetKeys(prefix);
      const stored = loadAllPresets();
      const snap: Record<string, any> = { _saved: Date.now() };
      keys.forEach(k => snap[k] = CFG[k]);
      stored[id] = snap;
      saveAllPresets(stored);
      syncPresetLabels();
      (btn as HTMLElement).textContent = 'Sauvegardé !';
      setTimeout(() => (btn as HTMLElement).textContent = `Sauv. ${id.slice(-1)}`, 1200);
    });
  });

  el.querySelectorAll('[data-load]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.load!;
      const stored = loadAllPresets();
      if (!stored[id]) return;
      Object.entries(stored[id]).forEach(([k, v]) => {
        if (k !== '_saved' && CFG[k] !== undefined) CFG[k] = v as number;
      });
      syncAllSliders();
      measure();
      ensurePathCanvas(); updatePathCanvas();
      relaunch();
    });
  });

  syncPresetLabels();

  function syncBtns() {
    el.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.mode === CFG.mode));
    el.querySelectorAll('[data-center]').forEach(b => b.classList.toggle('on', ((b as HTMLElement).dataset.center === 'true') === CFG.centerOnPhoto));
  }
  syncBtns();
}
buildDebug();
