#!/usr/bin/env node
// ─── Dashboard franckchabin.com ───
// Lancé par l'app Electron (dashboard/shell) ou : node app.mjs

import { createServer } from 'node:http';
import { execSync, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = 3333;
const DEV_PORT = 4321;
const DEV_LOG = '/tmp/franckchabin-dev.log';
const DEV_URL = `http://localhost:${DEV_PORT}/`;
const LIVE_URL = 'https://franckchabin.com';
const LIVE_HOST = 'franckchabin.com';

let devProcess = null;

// ─── Petites icônes SVG (pas d'emoji) ───
const IC = {
  play: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  up:   '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  ext:  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  sun:  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  live: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  rocket:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13c-1.5 1.3-2 5-2 5s3.7-.5 5-2M14 5c4-3 7-2 7-2s1 3-2 7c-2.5 3.3-7 6-7 6l-3-3s2.7-4.5 5-8z"/><circle cx="15" cy="9" r="1.2"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/></svg>',
};

// Couleur stable et distincte dérivée d'un slug (pour les projets sans couleur définie).
function hashColor(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return `hsl(${h % 360},62%,60%)`; }

// Répartitions GoatCounter : [clé API, titre affiché].
const BD = [['toprefs', 'Référents'], ['browsers', 'Navigateurs'], ['systems', 'Systèmes'], ['locations', 'Pays'], ['languages', 'Langues'], ['sizes', "Tailles d'écran"]];

function exec(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, timeout: 30000, env: { ...process.env, FORCE_COLOR: '0' } }).toString().trim();
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: (e.stderr?.toString() || e.stdout?.toString() || e.message).trim() };
  }
}

function isDevRunning() { return devProcess !== null && devProcess.exitCode === null; }

function readPages() {
  try {
    return readdirSync(join(ROOT, 'src', 'pages')).filter(f => f.endsWith('.astro'))
      .map(f => ({ name: f, src: readFileSync(join(ROOT, 'src', 'pages', f), 'utf8') }));
  } catch { return []; }
}

function getGitInfo() {
  const g = (c) => { const r = exec(c); return r.ok ? r.output : ''; };
  return {
    branch: g('git branch --show-current') || '—',
    remote: g('git remote get-url origin') || 'non configuré',
    status: g('git status --short'),
    log: g('git log --oneline -10'),
    lastRel: g('git log -1 --format=%cr') || '—',
    lastMsg: g('git log -1 --format=%s') || '—',
  };
}

function githubUrls(remote) {
  const m = (remote || '').match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  const repo = `https://github.com/${m[1]}/${m[2]}`;
  return { repo, actions: `${repo}/actions`, commits: `${repo}/commits` };
}

// Inventaire du site (compteurs, poids, versions, vidéos).
function getSiteInfo() {
  const pages = readPages();
  const num = (cmd) => { const r = exec(cmd); const n = parseInt((r.output || '').trim(), 10); return Number.isNaN(n) ? 0 : n; };
  const size = (cmd) => { const r = exec(cmd); return r.ok ? (r.output.split(/\s+/)[0] || '—') : '—'; };
  const comps = num(`find src/components -name "*.astro" 2>/dev/null | wc -l`);
  const scripts = num(`find src/scripts -type f 2>/dev/null | wc -l`);
  const images = num(`find public -type f \\( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" -o -iname "*.gif" -o -iname "*.svg" \\) 2>/dev/null | wc -l`);
  const allSrc = pages.map(p => p.src).join('\n');
  const vidUrls = [...new Set((allSrc.match(/https:\/\/res\.cloudinary\.com[^\s"'`)]+\.mp4/g) || []))];
  const publicSize = size(`du -sh public 2>/dev/null`);
  const distSize = existsSync(join(ROOT, 'dist')) ? size(`du -sh dist 2>/dev/null`) : '—';
  let astro = '—';
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    astro = ((pkg.dependencies && pkg.dependencies.astro) || (pkg.devDependencies && pkg.devDependencies.astro) || '—').replace(/^[\^~]/, '');
  } catch {}
  return { pages: pages.length, comps, scripts, images, videos: vidUrls.length, publicSize, distSize, astro, node: process.version };
}

// Code GoatCounter configuré dans src/config.ts (vide si non configuré).
function getGoatcounter() {
  try {
    const s = readFileSync(join(ROOT, 'src', 'config.ts'), 'utf8');
    const m = s.match(/GOATCOUNTER\s*=\s*'([^']*)'/);
    return m ? m[1] : '';
  } catch { return ''; }
}

// Projets (depuis index.astro) + structure de chaque page + aperçu (poster local).
function getProjects() {
  let src = '';
  try { src = readFileSync(join(ROOT, 'src', 'pages', 'index.astro'), 'utf8'); } catch { return []; }
  const m = src.match(/const projects\s*=\s*\[([\s\S]*?)\];/);
  if (!m) return [];
  // Neutralise les ${BASE} (accolades internes) puis découpe par objet.
  const body = m[1].replace(/\$\{BASE\}/g, '/');
  const blocks = body.match(/\{[^{}]*\}/g) || [];
  const folderMap = { 'tiket-culture': 'ticket-culture', 'typographes-createurs-de-caracteres-et-typodiversite': 'memoire' };
  return blocks.map(b => {
    const g = (re) => { const x = b.match(re); return x ? x[1] : ''; };
    const title = g(/title:\s*'([^']*)'/) || g(/title:\s*"([^"]*)"/);
    const slug = g(/slug:\s*'([^']*)'/);
    const tagsRaw = g(/tags:\s*\[([^\]]*)\]/);
    const tags = (tagsRaw.match(/['"]([^'"]+)['"]/g) || []).map(s => s.replace(/['"]/g, ''));
    const image = g(/image:\s*`([^`]*)`/);
    const poster = g(/videoPoster:\s*`([^`]*)`/);
    let thumb = poster || image || '';
    if (thumb && !thumb.startsWith('/')) thumb = '/' + thumb;
    let pageSrc = '';
    try { pageSrc = readFileSync(join(ROOT, 'src', 'pages', slug + '.astro'), 'utf8'); } catch {}
    const vids = [...new Set((pageSrc.match(/https:\/\/res\.cloudinary\.com[^\s"'`)]+\.mp4/g) || []))].length;
    const imgs = (pageSrc.match(/<img\b/g) || []).length;
    const sections = (pageSrc.match(/<section\b/g) || []).length;
    const lines = pageSrc ? pageSrc.split('\n').length : 0;
    const folder = folderMap[slug] || slug;
    const assets = (() => { const r = exec(`find "public/images/projects/${folder}" -type f 2>/dev/null | wc -l`); return parseInt(r.output || '0', 10) || 0; })();
    return { title, slug, tags, thumb, vids, imgs, sections, lines, assets };
  });
}

// Fichiers les plus lourds (utile pour un portfolio media-heavy).
function getHeavyAssets() {
  const r = exec(`find public/images -type f -exec du -k {} + 2>/dev/null | sort -rn | head -6`);
  if (!r.ok || !r.output) return [];
  return r.output.split('\n').map(l => {
    const mm = l.trim().match(/^(\d+)\s+(.+)$/);
    if (!mm) return null;
    const kb = parseInt(mm[1], 10);
    const sz = kb >= 1024 ? (kb / 1024).toFixed(1) + ' Mo' : kb + ' Ko';
    return { size: sz, name: mm[2].replace(/^public\/images\//, '') };
  }).filter(Boolean);
}

// Toutes les vidéos Cloudinary intégrées dans le site (dédupliquées).
function getVideos(projects) {
  const slugTitle = {};
  (projects || []).forEach(p => { slugTitle[p.slug] = p.title; });
  const seen = new Set(); const out = [];
  for (const pg of readPages()) {
    const name = pg.name.replace(/\.astro$/, '');
    const urls = pg.src.match(/https:\/\/res\.cloudinary\.com[^\s"'`)]+\.mp4/g) || [];
    for (const u of urls) {
      if (seen.has(u)) continue; seen.add(u);
      let fname = ''; try { fname = decodeURIComponent(u.split('/').pop()); } catch { fname = u.split('/').pop(); }
      fname = fname.replace(/\.mp4$/, '').replace(/^©?franckchabin[_-]?/i, '');
      const where = slugTitle[name] || (name === 'index' ? 'Accueil' : name);
      out.push({ url: u, jpg: u.replace(/\.mp4$/, '.jpg'), name: fname, where });
    }
  }
  return out;
}

// Tailles des vidéos via HEAD (mises en cache).
let _mediaCache = null;
async function getMediaSizes(urls) {
  if (_mediaCache) return _mediaCache;
  const out = {};
  await Promise.all(urls.map(async u => {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
      const r = await fetch(u, { method: 'HEAD', signal: c.signal }); clearTimeout(t);
      const len = r.headers.get('content-length'); out[u] = len ? Number(len) : null;
    } catch { out[u] = null; }
  }));
  _mediaCache = out; return out;
}

// Liste légère {slug,title} des projets (sans lecture des pages).
function getProjectSlugs() {
  let src = '';
  try { src = readFileSync(join(ROOT, 'src', 'pages', 'index.astro'), 'utf8'); } catch { return []; }
  const m = src.match(/const projects\s*=\s*\[([\s\S]*?)\];/);
  if (!m) return [];
  const blocks = m[1].replace(/\$\{BASE\}/g, '/').match(/\{[^{}]*\}/g) || [];
  return blocks.map(b => ({
    slug: (b.match(/slug:\s*'([^']*)'/) || [])[1] || '',
    title: (b.match(/title:\s*'([^']*)'/) || [])[1] || (b.match(/title:\s*"([^"]*)"/) || [])[1] || '',
  })).filter(p => p.slug);
}

// Couleurs dominantes des projets (calculées depuis leurs posters).
// Accueil = blanc, À propos = gris (neutres), pages cachées = gris foncé.
const PROJECT_COLORS = {
  '75000': '#b5c6ec',
  'golosino': '#e2c5b6',
  'tiket-culture': '#f99a4c',
  'fisheye': '#e44211',
  'anemo': '#e4ccb8',
  'typographes-createurs-de-caracteres-et-typodiversite': '#83cafa',
  'vittorine': '#4caf50',
};

// Token API GoatCounter — lu depuis l'env ou dashboard/secret.json (gitignored).
function getGCToken() {
  if (process.env.GOATCOUNTER_TOKEN) return process.env.GOATCOUNTER_TOKEN.trim();
  try { const j = JSON.parse(readFileSync(join(ROOT, 'dashboard', 'secret.json'), 'utf8')); return (j.token || '').trim(); } catch { return ''; }
}

function periodStart(period) {
  const d = new Date();
  if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setDate(d.getDate() - 30);
  else if (period === 'year') d.setDate(d.getDate() - 365);
  else return '2020-01-01';
  return d.toISOString().slice(0, 10);
}

// Statistiques via l'API GoatCounter (données à jour, pas le cache 4 h des compteurs publics).
const _statsCache = {}, _statsTime = {};
async function gcStats(period, nocache) {
  const code = getGoatcounter(); const token = getGCToken();
  if (!code) return { ok: false, reason: 'config' };
  if (!token) return { ok: false, reason: 'token' };
  const key = period || 'all'; const now = Date.now();
  if (!nocache && _statsCache[key] && now - _statsTime[key] < 60000) return _statsCache[key];
  const start = periodStart(period);
  let data;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(`https://${code}.goatcounter.com/api/v0/stats/hits?start=${start}&daily=true&limit=100`,
      { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, signal: c.signal });
    clearTimeout(t);
    if (r.status === 401 || r.status === 403) { const e = await r.json().catch(() => ({})); return { ok: false, reason: 'token', message: e.error || e.Error || 'clé refusée' }; }
    data = await r.json();
  } catch (e) { return { ok: false, reason: 'error', message: e.message }; }
  if (!data || !data.hits) return { ok: false, reason: 'error', message: (data && data.error) || 'réponse inattendue' };

  const projects = getProjectSlugs();
  const labelFor = p => { if (p === '/') return 'Accueil'; if (p === '/about') return 'À propos'; const pr = projects.find(x => '/' + x.slug === p); return pr ? (pr.title || pr.slug) : p.replace(/^\//, ''); };
  const colorFor = p => { if (p === '/') return '#ffffff'; if (p === '/about') return '#9aa0a6'; const s = p.replace(/^\//, ''); return PROJECT_COLORS[s] || hashColor(s); };

  let minDay = null;
  const pages = data.hits.map(h => {
    const byDay = {}; let cnt = 0;
    (h.stats || []).forEach(s => { const v = s.daily || 0; byDay[s.day] = v; cnt += v; if (v > 0 && (!minDay || s.day < minDay)) minDay = s.day; });
    return { path: h.path, label: labelFor(h.path), color: colorFor(h.path), count: (h.count != null ? h.count : cnt), byDay };
  });

  const today = new Date().toISOString().slice(0, 10);
  const days = []; const cur = new Date((minDay || start) + 'T00:00:00');
  while (cur.toISOString().slice(0, 10) <= today && days.length < 400) { days.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }

  const total = pages.reduce((a, p) => a + (p.count || 0), 0);
  const result = { ok: true, total, days, pages: pages.sort((a, b) => b.count - a.count) };
  _statsCache[key] = result; _statsTime[key] = now; return result;
}

// Répartitions (référents, navigateurs, systèmes, pays, langues, tailles) via l'API.
const _extraCache = {}, _extraTime = {};
async function gcExtra(period, nocache) {
  const code = getGoatcounter(); const token = getGCToken();
  if (!code || !token) return { ok: false };
  const key = period || 'all'; const now = Date.now();
  if (!nocache && _extraCache[key] && now - _extraTime[key] < 60000) return _extraCache[key];
  const start = periodStart(period);
  const one = async pg => {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 12000);
      const r = await fetch(`https://${code}.goatcounter.com/api/v0/stats/${pg}?start=${start}&limit=8`,
        { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, signal: c.signal });
      clearTimeout(t);
      if (!r.ok) return [];
      const d = await r.json();
      return (d.stats || []).map(s => ({ name: s.name || s.id || '(inconnu)', count: s.count || 0 }));
    } catch { return []; }
  };
  const out = { ok: true };
  await Promise.all(BD.map(async ([pg]) => { out[pg] = await one(pg); }));
  _extraCache[key] = out; _extraTime[key] = now; return out;
}

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// ─── API ───
function handleAPI(pathname, params, res) {
  if (pathname === '/api/dev') {
    if (isDevRunning()) {
      devProcess.kill('SIGTERM'); devProcess = null;
      return json(res, { ok: true, message: 'Serveur arrêté.' });
    }
    const astroBin = join(ROOT, 'node_modules', 'astro', 'astro.js');
    if (!existsSync(astroBin)) {
      const install = exec('npm install');
      if (!install.ok) return json(res, { ok: false, message: 'Erreur npm install :\n' + install.output });
    }
    writeFileSync(DEV_LOG, `--- Lancement dev ---\nnode    : ${process.execPath}\nversion : ${process.version}\n---------------------\n`);
    const logFd = openSync(DEV_LOG, 'a');
    devProcess = spawn(process.execPath, [astroBin, 'dev', '--port', String(DEV_PORT)], {
      cwd: ROOT, stdio: ['ignore', logFd, logFd], detached: false, env: { ...process.env, FORCE_COLOR: '0' },
    });
    devProcess.on('close', () => { devProcess = null; });
    return new Promise(resolve => {
      setTimeout(() => {
        if (isDevRunning()) json(res, { ok: true, message: 'Serveur lancé !', devRunning: true });
        else {
          let log = ''; try { log = readFileSync(DEV_LOG, 'utf8').trim().split('\n').slice(-15).join('\n'); } catch {}
          json(res, { ok: false, message: 'Le serveur a planté au démarrage :\n\n' + (log || '(aucun log)'), devRunning: false });
        }
        resolve();
      }, 2500);
    });
  }

  if (pathname === '/api/status') return json(res, { ok: true, git: getGitInfo(), devRunning: isDevRunning() });

  if (pathname === '/api/open') {
    const url = params.get('url') || '';
    if (!/^https?:\/\//.test(url)) return json(res, { ok: false, message: 'URL invalide.' });
    try { execSync(`open ${JSON.stringify(url)}`); return json(res, { ok: true, message: 'Ouvert dans le navigateur.' }); }
    catch (e) { return json(res, { ok: false, message: e.message }); }
  }

  if (pathname === '/api/media') {
    const vids = getVideos();
    return getMediaSizes(vids.map(v => v.url)).then(sizes => json(res, { ok: true, sizes }));
  }

  if (pathname === '/api/gc-stats') {
    return gcStats(params.get('period') || '', params.get('nocache') === '1').then(r => json(res, r));
  }

  if (pathname === '/api/gc-extra') {
    return gcExtra(params.get('period') || '', params.get('nocache') === '1').then(r => json(res, r));
  }

  if (pathname === '/api/gc-token') {
    const t = (params.get('token') || '').trim();
    if (!t) return json(res, { ok: false, message: 'Token vide.' });
    try {
      writeFileSync(join(ROOT, 'dashboard', 'secret.json'), JSON.stringify({ token: t }, null, 2));
      for (const k in _statsCache) delete _statsCache[k];
      return json(res, { ok: true, message: 'API GoatCounter connectée.' });
    } catch (e) { return json(res, { ok: false, message: e.message }); }
  }

  if (pathname === '/api/perf') {
    const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(LIVE_URL)}&strategy=mobile&category=performance&category=accessibility&category=seo&category=best-practices`;
    return fetch(api).then(r => r.json()).then(d => {
      if (!d.lighthouseResult) return json(res, { ok: false, message: (d.error && d.error.message) || 'Analyse indisponible.' });
      const cat = d.lighthouseResult.categories || {}, au = d.lighthouseResult.audits || {};
      const sc = c => (c && typeof c.score === 'number') ? Math.round(c.score * 100) : null;
      const dv = k => (au[k] && au[k].displayValue) || '—';
      json(res, {
        ok: true,
        scores: { perf: sc(cat.performance), a11y: sc(cat.accessibility), seo: sc(cat.seo), bp: sc(cat['best-practices']) },
        metrics: { lcp: dv('largest-contentful-paint'), cls: dv('cumulative-layout-shift'), fcp: dv('first-contentful-paint'), tbt: dv('total-blocking-time') },
      });
    }).catch(e => json(res, { ok: false, message: 'Erreur réseau PageSpeed : ' + e.message }));
  }

  if (pathname === '/api/commit') {
    const msg = params.get('msg') || '';
    const push = params.get('push') === 'true';
    if (!msg) return json(res, { ok: false, message: 'Message de commit vide.' });
    const add = exec('git add -A');
    if (!add.ok) return json(res, { ok: false, message: 'Erreur git add :\n' + add.output });
    const diff = exec('git diff --cached --stat');
    if (diff.ok && !diff.output) return json(res, { ok: false, message: 'Rien à envoyer — aucun fichier modifié.' });
    const commit = exec(`git commit -m ${JSON.stringify(msg)}`);
    if (!commit.ok) return json(res, { ok: false, message: 'Erreur commit :\n' + commit.output });
    if (push) {
      const branchName = exec('git branch --show-current');
      const pushResult = exec(`git push origin ${branchName.output || 'main'}`);
      if (!pushResult.ok) return json(res, { ok: false, message: 'Commit OK, mais erreur push :\n' + pushResult.output });
      return json(res, { ok: true, message: 'Envoyé sur GitHub ! Le site sera mis à jour dans ~1 minute.' });
    }
    return json(res, { ok: true, message: 'Commit sauvegardé en local (pas envoyé sur GitHub).' });
  }

  if (pathname === '/api/remote') {
    const url = params.get('url') || '';
    if (!url) return json(res, { ok: false, message: 'URL vide.' });
    const has = exec('git remote get-url origin');
    const cmd = has.ok ? `git remote set-url origin ${JSON.stringify(url)}` : `git remote add origin ${JSON.stringify(url)}`;
    const r = exec(cmd);
    return json(res, { ok: r.ok, message: r.ok ? 'Adresse GitHub mise à jour !' : 'Erreur :\n' + r.output });
  }

  res.writeHead(404); res.end('Not found');
}

// ─── Fragments HTML ───
function formatLog(logStr) {
  if (!logStr) return '<p class="empty">Aucun envoi pour le moment</p>';
  return logStr.split('\n').map(line => {
    const m = line.match(/^([a-f0-9]+)\s+(.+)$/);
    return m ? `<div class="log-entry"><span class="hash">${m[1]}</span> ${esc(m[2])}</div>` : '';
  }).join('');
}

function formatStatus(statusStr) {
  if (!statusStr) return '<p class="empty">Aucun fichier modifié — tout est synchronisé</p>';
  return statusStr.split('\n').map(line => {
    const code = line.substring(0, 2).trim();
    const file = line.substring(3);
    let label = 'modifié', cls = 'modified';
    if (code === '??') { label = 'nouveau'; cls = 'new'; }
    else if (code === 'D') { label = 'supprimé'; cls = 'deleted'; }
    else if (code === 'A') { label = 'ajouté'; cls = 'new'; }
    return `<div class="file-entry"><span class="badge ${cls}">${label}</span> ${esc(file)}</div>`;
  }).join('');
}

function statCard(label, value, foot) {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-val">${value}</div><div class="stat-foot">${foot}</div></div>`;
}

function projectCard(p, devRunning) {
  const local = DEV_URL + p.slug;
  const live = LIVE_URL + '/' + p.slug;
  const thumb = p.thumb ? `<img src="${encodeURI(p.thumb)}" alt="" loading="lazy">` : '<div class="noimg">aperçu indisponible</div>';
  const tags = p.tags.map(t => `<span class="ptag">${esc(t)}</span>`).join('');
  const meta = [
    p.sections ? `${p.sections} sections` : null,
    p.vids ? `${p.vids} vidéo${p.vids > 1 ? 's' : ''}` : null,
    p.imgs ? `${p.imgs} images` : null,
    p.assets ? `${p.assets} fichiers` : null,
  ].filter(Boolean).join(' · ');
  return `<article class="pcard">
    <div class="pcard-media" ${devRunning ? `onclick="setPreview('${local}')"` : ''} title="${devRunning ? 'Voir dans l\'aperçu' : ''}">${thumb}${p.vids ? '<span class="vbadge">' + p.vids + ' vidéo' + (p.vids > 1 ? 's' : '') + '</span>' : ''}</div>
    <div class="pcard-body">
      <h4>${esc(p.title)}</h4>
      <div class="pcard-tags">${tags}</div>
      <div class="pcard-meta">${meta || '—'}</div>
      <div class="pcard-links">
        ${devRunning ? `<a class="plink" onclick="setPreview('${local}')">${IC.play} Aperçu</a>` : ''}
        <a class="plink" href="${live}" target="_blank">${IC.ext} En ligne</a>
      </div>
    </div>
  </article>`;
}

function pageLinks(slug, devRunning) {
  const path = slug ? ('/' + slug) : '/';
  const live = LIVE_URL + path;
  const local = DEV_URL.replace(/\/$/, '') + path;
  return `<a class="tlink" href="${live}" target="_blank" title="En ligne">${IC.ext}</a>` +
    (devRunning ? `<a class="tlink" onclick="setPreview('${local}')" title="Aperçu local">${IC.play}</a>` : '');
}

// ─── Page ───
function page() {
  const git = getGitInfo();
  const site = getSiteInfo();
  const projects = getProjects();
  const heavy = getHeavyAssets();
  const devRunning = isDevRunning();
  const gh = githubUrls(git.remote);
  const modifiedCount = git.status ? git.status.split('\n').filter(l => l.trim()).length : 0;
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const videos = getVideos(projects);
  const pageNames = readPages().map(p => p.name.replace(/\.astro$/, ''));
  const projSlugs = projects.map(p => p.slug);
  const known = new Set(['index', 'about', ...projSlugs]);
  const hidden = pageNames.filter(n => !known.has(n));
  const gc = getGoatcounter();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>franckchabin.com — Tableau de bord</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --bg:#ececed; --card:#fff; --ink:#0f0f11; --muted:#86868e; --line:#ececef;
    --accent:#c4f034; --accent-ink:#1c2a00; --dark:#16161a;
    --radius:20px; --shadow:0 1px 2px rgba(0,0,0,.05),0 10px 26px rgba(0,0,0,.05);
  }
  body.dark{
    --bg:#0a0a0c; --card:#161619; --ink:#f1f1f4; --muted:#7d7d87; --line:#26262c;
    --dark:#000; --shadow:0 1px 2px rgba(0,0,0,.5),0 12px 32px rgba(0,0,0,.45);
  }
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;transition:background .2s,color .2s}
  a{color:inherit;text-decoration:none}
  svg{display:block}
  .wrap{max-width:1480px;margin:0 auto;padding:14px 22px 30px;display:flex;flex-direction:column;gap:14px}

  /* En-tête (padding-top : ne chevauche pas les pastilles macOS) */
  .topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:34px;margin-bottom:4px}
  h1{font-size:1.9rem;font-weight:650;letter-spacing:-.02em}
  .sub{color:var(--muted);font-size:.88rem;margin-top:2px}
  /* Toggle jour/nuit isolé */
  .seg{display:inline-flex;background:var(--card);border-radius:12px;padding:4px;box-shadow:var(--shadow);gap:2px}
  .seg-btn{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:.82rem;padding:7px 13px;border-radius:9px;cursor:pointer}
  .seg-btn.active{background:var(--ink);color:var(--card)}

  /* Titres de section (hiérarchie) */
  .sect-h{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;margin:8px 2px 0}

  /* Actions principales */
  .actions{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .act{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px 22px;min-height:132px;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;transition:transform .12s}
  .act:hover{transform:translateY(-2px)}
  .act-top{display:flex;align-items:center;justify-content:space-between;font-size:.82rem;color:var(--muted)}
  .act-ic{width:34px;height:34px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;color:var(--ink)}
  .act-val{font-size:1.7rem;font-weight:650;letter-spacing:-.02em}
  .act-foot{font-size:.8rem;color:var(--muted)}
  .act.dark-card{background:var(--dark);color:#fff}
  .act.dark-card .act-top,.act.dark-card .act-foot{color:#9a9aa2}
  .act.dark-card .act-ic{background:#2a2a2e;color:#fff}
  .act.on{background:var(--accent);color:var(--accent-ink)}
  .act.on .act-top,.act.on .act-foot{color:#3c5200}
  .act.on .act-ic{background:rgba(0,0,0,.14);color:var(--accent-ink)}

  /* Cartes liens (mise en ligne) */
  .links2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .lcard{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px 20px;display:block;transition:transform .12s}
  .lcard:hover{transform:translateY(-2px)}
  .lcard-top{display:flex;align-items:center;gap:9px;font-size:.82rem;color:var(--muted);margin-bottom:8px}
  .lcard-title{font-size:1.15rem;font-weight:600;display:flex;align-items:center;gap:8px}
  .lcard-desc{font-size:.8rem;color:var(--muted);margin-top:6px;line-height:1.45}

  /* Inventaire */
  .stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
  .stat{background:var(--card);border-radius:15px;box-shadow:var(--shadow);padding:14px 16px}
  .stat-label{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .stat-val{font-size:1.45rem;font-weight:650;margin-top:4px}
  .stat-foot{font-size:.7rem;color:var(--muted);margin-top:2px}

  .panel{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px 22px}
  .panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .panel-head h3{font-size:.98rem;font-weight:600}
  .panel-head .link{font-size:.8rem;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:5px}
  .panel-head .link:hover{color:var(--ink)}
  .ph-actions{display:flex;gap:16px;align-items:center}

  /* Arbre des pages */
  .tree,.tree ul{list-style:none}
  .tree ul{margin-left:14px;padding-left:14px;border-left:1.5px solid var(--line)}
  .tree li{position:relative;padding:3px 0}
  .tnode{display:flex;align-items:center;gap:8px;font-size:.88rem;flex-wrap:wrap}
  .tnode code{font-family:'SF Mono',Menlo,monospace;font-size:.72rem;color:var(--muted);background:var(--bg);padding:1px 6px;border-radius:6px}
  .troot{font-weight:650;font-size:.96rem}
  .tcat{font-weight:600;color:var(--ink)}
  .tcount{font-size:.66rem;background:var(--accent);color:var(--accent-ink);padding:1px 7px;border-radius:20px;font-weight:600}
  .tmuted{font-size:.68rem;color:var(--muted);font-style:italic}
  .tlink{display:inline-flex;color:var(--muted);cursor:pointer;padding:2px}
  .tlink:hover{color:var(--ink)}

  /* Grille vidéos */
  .vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
  .vcard{display:flex;flex-direction:column;gap:6px}
  .vcard-img{position:relative;aspect-ratio:16/10;border-radius:11px;overflow:hidden;background:var(--line)}
  .vcard-img img{width:100%;height:100%;object-fit:cover;display:block}
  .vcard-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;pointer-events:none}
  .vcard-play svg{width:32px;height:32px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.55))}
  .vcard-open{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
  .vcard-name{font-size:.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .vcard-foot{display:flex;justify-content:space-between;gap:8px;font-size:.72rem;color:var(--muted)}
  .vsize{font-weight:600;white-space:nowrap}

  /* Performance */
  .perf-static{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:.8rem;color:var(--muted);margin-bottom:12px}
  .perf-static b{color:var(--ink);font-weight:600}
  .perf-scores{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
  .score{background:var(--bg);border-radius:12px;padding:12px;text-align:center}
  .score-val{font-size:1.5rem;font-weight:700}
  .score-lab{font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-top:2px}
  .s-good{color:#2e9b3f}.s-mid{color:#c98a00}.s-bad{color:#cf2f2f}
  .perf-metrics{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:.78rem;color:var(--muted)}
  .perf-metrics b{color:var(--ink)}

  /* Trafic */
  .muted-p{font-size:.82rem;color:var(--muted);line-height:1.5;margin-bottom:8px}
  .muted-p b{color:var(--ink)}
  .opt-list{list-style:none;display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
  .opt-list li{font-size:.8rem;color:var(--muted);padding-left:14px;position:relative;line-height:1.4}
  .opt-list li::before{content:'';position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:50%;background:var(--accent)}
  .opt-list b{color:var(--ink)}
  .opt-list code{font-family:'SF Mono',Menlo,monospace;font-size:.74rem;background:var(--bg);padding:1px 6px;border-radius:5px}
  .gc-count{margin-bottom:10px}
  .gc-big{font-size:2.1rem;font-weight:700;letter-spacing:-.02em}
  .gc-lab{font-size:.75rem;color:var(--muted);margin-top:2px}
  .link2{color:var(--ink);text-decoration:underline;cursor:pointer}

  /* Classement des pages */
  .ptraf-row{display:grid;grid-template-columns:170px 1fr 56px;align-items:center;gap:12px;padding:6px 0}
  .ptraf-lab{font-size:.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ptraf-lab code{display:block;font-family:'SF Mono',Menlo,monospace;font-size:.66rem;color:var(--muted);font-weight:400}
  .ptraf-track{height:12px;background:var(--bg);border-radius:7px;overflow:hidden}
  .ptraf-bar{height:100%;background:var(--accent);border-radius:7px;min-width:2px;transition:width .4s}
  .ptraf-num{font-size:.85rem;font-weight:600;text-align:right}
  @media(max-width:560px){.ptraf-row{grid-template-columns:120px 1fr 46px}}
  .stats-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .chart-wrap{background:#16161a;border-radius:13px;padding:14px;height:360px}
  .bd-list .bd-row:first-child{padding-top:0}

  /* Répartitions */
  .bdgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .bd-row{display:grid;grid-template-columns:1fr 64px 30px;align-items:center;gap:9px;padding:5px 0;font-size:.8rem}
  .bd-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bd-bar{height:8px;background:var(--bg);border-radius:5px;overflow:hidden}
  .bd-bar span{display:block;height:100%;background:var(--accent);border-radius:5px}
  .bd-num{text-align:right;font-weight:600;color:var(--muted)}
  @media(max-width:900px){.bdgrid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:600px){.bdgrid{grid-template-columns:1fr}}

  /* Arbre des pages (graphique) */
  .tnode2{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;font-size:.88rem}
  .tnode2:hover{background:var(--bg)}
  .troot2{font-weight:650;font-size:.98rem;background:var(--bg);margin-bottom:4px}
  .tbranch{margin-left:15px;padding-left:18px;border-left:2px solid var(--line);display:flex;flex-direction:column;gap:1px}
  .tgroup{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;margin:12px 0 3px 12px;display:flex;align-items:center;gap:8px}
  .tdot{width:11px;height:11px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 2px var(--card)}
  .tlabel{font-weight:600}
  .tnode2 code{font-family:'SF Mono',Menlo,monospace;font-size:.7rem;color:var(--muted);background:var(--bg);padding:1px 6px;border-radius:5px}
  .tnode2:hover code{background:var(--card)}
  .tlinks{margin-left:auto;display:flex;gap:4px}
  .tcount{font-size:.64rem;background:var(--accent);color:var(--accent-ink);padding:1px 7px;border-radius:20px;font-weight:700}
  .tmuted{font-size:.66rem;color:var(--muted);font-style:italic;text-transform:none;letter-spacing:0}

  /* Favicon */
  .favrow{display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap}
  .favitem{display:flex;flex-direction:column;align-items:center;gap:7px}
  .favbox{background:#cfcfd6;border-radius:10px;padding:10px;display:flex;align-items:center;justify-content:center}
  .favitem span{font-size:.7rem;color:var(--muted)}

  .preview-wrap{border-radius:13px;overflow:hidden;border:1px solid var(--line);background:#fff;height:clamp(340px,44vh,540px)}
  .preview-frame{width:100%;height:100%;border:0;display:block}
  .preview-empty{height:190px;border-radius:13px;border:1.5px dashed var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.88rem;text-align:center;padding:0 20px}

  /* Grille projets */
  .pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:16px}
  .pcard{background:var(--card);border-radius:16px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
  .pcard-media{position:relative;aspect-ratio:16/10;background:var(--line);cursor:pointer;overflow:hidden}
  .pcard-media img{width:100%;height:100%;object-fit:cover;display:block}
  .pcard-media .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.78rem}
  .vbadge{position:absolute;left:10px;bottom:10px;background:rgba(0,0,0,.7);color:#fff;font-size:.68rem;padding:3px 8px;border-radius:7px;backdrop-filter:blur(4px)}
  .pcard-body{padding:13px 15px 15px;display:flex;flex-direction:column;gap:7px}
  .pcard-body h4{font-size:1.02rem;font-weight:600}
  .pcard-tags{display:flex;flex-wrap:wrap;gap:5px}
  .ptag{font-size:.66rem;color:var(--muted);background:var(--bg);padding:3px 7px;border-radius:6px}
  .pcard-meta{font-size:.74rem;color:var(--muted)}
  .pcard-links{display:flex;gap:14px;margin-top:3px}
  .plink{display:inline-flex;align-items:center;gap:5px;font-size:.78rem;color:var(--ink);cursor:pointer;opacity:.85}
  .plink:hover{opacity:1}

  /* Bandeau vidéos */
  .vstrip{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px}
  .vthumb{flex:0 0 168px}
  .vthumb-img{position:relative;aspect-ratio:16/10;border-radius:11px;overflow:hidden;background:var(--line)}
  .vthumb-img img{width:100%;height:100%;object-fit:cover}
  .vthumb-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff}
  .vthumb-play svg{width:34px;height:34px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
  .vthumb-cap{font-size:.76rem;margin-top:6px;font-weight:600}
  .vthumb-sub{font-size:.68rem;color:var(--muted)}

  .file-entry{font-size:.82rem;color:var(--muted);padding:.3rem 0;font-family:'SF Mono',Menlo,monospace;border-bottom:1px solid var(--line)}
  .file-entry:last-child{border-bottom:none}
  .badge{display:inline-block;font-size:.6rem;padding:.12rem .45rem;border-radius:6px;margin-right:8px;font-family:system-ui;text-transform:uppercase;letter-spacing:.03em;font-weight:600}
  .badge.new{background:#e7f8d8;color:#3f6212}.badge.modified{background:#fdf0d5;color:#92560b}.badge.deleted{background:#fde2e2;color:#9b1c1c}
  .log-entry{font-size:.82rem;color:var(--muted);padding:.4rem 0;border-bottom:1px solid var(--line)}
  .log-entry:last-child{border-bottom:none}
  .hash{font-family:'SF Mono',Menlo,monospace;color:#aaa;font-size:.72rem;margin-right:8px}
  .empty{font-size:.84rem;color:var(--muted);font-style:italic}
  .heavy-row{display:flex;justify-content:space-between;gap:10px;font-size:.8rem;padding:.4rem 0;border-bottom:1px solid var(--line)}
  .heavy-row:last-child{border-bottom:none}
  .heavy-name{color:var(--muted);font-family:'SF Mono',Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .heavy-size{font-weight:600;white-space:nowrap}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .remote-url{font-size:.78rem;color:var(--muted);font-family:'SF Mono',Menlo,monospace;word-break:break-all;margin-bottom:8px}
  .config-link{font-size:.78rem;color:var(--muted);cursor:pointer}.config-link:hover{color:var(--ink)}
  .techos{display:flex;gap:18px;flex-wrap:wrap;font-size:.78rem;color:var(--muted);margin-top:10px}
  .techos b{color:var(--ink);font-weight:600}

  #toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:.8rem 1.4rem;border-radius:12px;font-size:.85rem;max-width:90vw;text-align:center;display:none;z-index:200;box-shadow:var(--shadow)}
  #toast.ok{background:#163d12;color:#c7f5b0;display:block}#toast.err{background:#4a1212;color:#ffc9c9;display:block}
  .overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;justify-content:center;align-items:center}
  .overlay.show{display:flex}
  .modal{background:var(--card);border-radius:18px;padding:1.8rem;width:440px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.3)}
  .modal h2{font-size:1.1rem;margin-bottom:.5rem}
  .modal .modal-explain{font-size:.82rem;color:var(--muted);margin-bottom:1.1rem;line-height:1.5}
  .modal input[type=text]{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:.7rem 1rem;font-size:.9rem;font-family:inherit;margin-bottom:1rem;outline:none;color:var(--ink)}
  .modal input[type=text]:focus{border-color:var(--ink)}
  .btns{display:flex;gap:.6rem;justify-content:flex-end}
  .btn{padding:.6rem 1.2rem;border-radius:11px;border:1px solid var(--line);font-size:.85rem;cursor:pointer;background:var(--bg);color:var(--ink);font-family:inherit}
  .btn.primary{background:var(--ink);color:var(--card);border-color:var(--ink);font-weight:600}
  @media(max-width:920px){.stats{grid-template-columns:repeat(3,1fr)}}
  @media(max-width:760px){.actions,.links2,.cols{grid-template-columns:1fr}}
</style>
</head>
<body>
<script>if(localStorage.getItem('dash-theme')==='dark')document.body.classList.add('dark');</script>
<div class="wrap">

  <header class="topbar">
    <div>
      <h1>franckchabin.com</h1>
      <p class="sub">Tableau de bord · ${esc(today)}</p>
    </div>
    <div class="seg" id="seg">
      <button class="seg-btn" data-th="light" onclick="setTheme('light')">${IC.sun} Jour</button>
      <button class="seg-btn" data-th="dark" onclick="setTheme('dark')">${IC.moon} Nuit</button>
    </div>
  </header>

  <!-- ACTIONS -->
  <div class="sect-h">Actions</div>
  <section class="actions">
    <div class="act ${devRunning ? 'on' : 'dark-card'}" onclick="toggleDev()">
      <div class="act-top"><span>Site local (test)</span><span class="act-ic">${devRunning ? IC.stop : IC.play}</span></div>
      <div class="act-val">${devRunning ? 'En marche' : 'Éteint'}</div>
      <div class="act-foot">${devRunning ? 'Aperçu actif · clique pour arrêter' : 'Clique pour tester le site sur ton Mac'}</div>
    </div>
    <div class="act" onclick="openModal('commit-modal')">
      <div class="act-top"><span>Envoyer sur GitHub</span><span class="act-ic">${IC.up}</span></div>
      <div class="act-val">${modifiedCount} ${modifiedCount > 1 ? 'fichiers' : 'fichier'}</div>
      <div class="act-foot">${modifiedCount ? 'en attente d\'envoi · dernier : ' + esc(git.lastRel) : 'tout est à jour · dernier envoi ' + esc(git.lastRel)}</div>
    </div>
  </section>

  <!-- MISE EN LIGNE -->
  <div class="sect-h">Mise en ligne</div>
  <section class="links2">
    <a class="lcard" href="${LIVE_URL}" target="_blank">
      <div class="lcard-top">${IC.live} Site public</div>
      <div class="lcard-title">${LIVE_HOST} ${IC.ext}</div>
      <div class="lcard-desc">Ouvrir le site tel que le voient tes visiteurs.</div>
    </a>
    ${gh ? `<a class="lcard" href="${gh.actions}" target="_blank">
      <div class="lcard-top">${IC.rocket} État du déploiement</div>
      <div class="lcard-title">Suivre la publication ${IC.ext}</div>
      <div class="lcard-desc">Après un envoi, GitHub reconstruit le site (~1 min). Vert = en ligne, jaune = en cours, rouge = erreur.</div>
    </a>` : `<div class="lcard"><div class="lcard-top">${IC.rocket} Déploiement</div><div class="lcard-title">Non configuré</div><div class="lcard-desc">Ajoute l'adresse GitHub plus bas.</div></div>`}
  </section>

  <!-- INVENTAIRE -->
  <div class="sect-h">Inventaire du site</div>
  <section class="stats">
    ${statCard('Projets', projects.length, 'études de cas')}
    ${statCard('Pages', site.pages, site.comps + ' composants')}
    ${statCard('Images', site.images, 'webp · png · svg')}
    ${statCard('Vidéos', site.videos, 'hébergées sur Cloudinary')}
    ${statCard('Poids /public', site.publicSize, 'build : ' + site.distSize)}
  </section>

  <!-- APERÇU -->
  <div class="sect-h">Aperçu en direct</div>
  <section class="panel">
    <div class="panel-head"><h3>Aperçu du site</h3><span class="ph-actions">${devRunning ? `<a class="link" onclick="openLocal()">${IC.ext} Ouvrir dans le navigateur</a><span class="link" onclick="refreshPreview()">Rafraîchir</span>` : ''}</span></div>
    ${devRunning
      ? `<div class="preview-wrap"><iframe class="preview-frame" id="preview" src="${DEV_URL}" title="Aperçu"></iframe></div>`
      : `<div class="preview-empty">Lance « Site local (test) » ci-dessus pour voir le site en direct ici, et clique sur un projet pour l'ouvrir dans cet aperçu.</div>`}
  </section>

  <!-- STATISTIQUES DE VISITE -->
  <div class="sect-h">Statistiques de visite</div>
  <section class="panel">
    <div class="panel-head"><h3>Visites</h3>
      <span class="ph-actions">
        <span class="link" onclick="refreshStats()">${IC.refresh} Rafraîchir</span>
        <span class="link" onclick="openModal('token-modal')">Connecter l'API</span>
        ${gc ? `<a class="link" href="https://${esc(gc)}.goatcounter.com" target="_blank">GoatCounter ${IC.ext}</a>` : ''}
      </span>
    </div>
    <div class="stats-toolbar">
      <div id="gc-count" class="gc-count"><p class="empty">Chargement…</p></div>
      <div class="seg" id="period-seg">
        <button class="seg-btn" data-p="week" onclick="setPeriod('week')">Semaine</button>
        <button class="seg-btn" data-p="month" onclick="setPeriod('month')">Mois</button>
        <button class="seg-btn" data-p="year" onclick="setPeriod('year')">Année</button>
        <button class="seg-btn active" data-p="" onclick="setPeriod('')">Tout</button>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h3>Pages</h3>
      <div class="seg" id="view-seg">
        <button class="seg-btn active" data-v="bars" onclick="setView('bars')">Classement</button>
        <button class="seg-btn" data-v="chart" onclick="setView('chart')">Graphique</button>
      </div>
    </div>
    <div id="bars-view"><p class="empty">Chargement…</p></div>
    <div id="chart-view" style="display:none"><div class="chart-wrap"><canvas id="gc-chart"></canvas></div></div>
  </section>

  <section class="bdgrid">
    ${BD.map(([k, title]) => `<div class="panel"><div class="panel-head"><h3>${title}</h3></div><div class="bd-list" id="bd-${k}"><p class="empty">…</p></div></div>`).join('')}
  </section>

  <!-- PLAN DU SITE -->
  <div class="sect-h">Plan du site</div>
  <section class="panel">
    <div class="panel-head"><h3>Arbre des pages</h3><span class="link">${pageNames.length} pages</span></div>
    <div class="tree2">
      <div class="tnode2 troot2"><span class="tdot" style="background:#111"></span><span class="tlabel">Accueil</span><code>/</code><span class="tlinks">${pageLinks('', devRunning)}</span></div>
      <div class="tbranch">
        <div class="tgroup">Projets <span class="tcount">${projects.length}</span></div>
        ${projects.map(p => `<div class="tnode2"><span class="tdot" style="background:${PROJECT_COLORS[p.slug] || hashColor(p.slug)}"></span><span class="tlabel">${esc(p.title)}</span><code>/${esc(p.slug)}</code><span class="tlinks">${pageLinks(p.slug, devRunning)}</span></div>`).join('')}
        <div class="tgroup">Autre</div>
        <div class="tnode2"><span class="tdot" style="background:#9aa0a6"></span><span class="tlabel">À propos</span><code>/about</code><span class="tlinks">${pageLinks('about', devRunning)}</span></div>
        ${hidden.length ? `<div class="tgroup">Pages cachées <span class="tmuted">hors navigation</span></div>
        ${hidden.map(h => `<div class="tnode2"><span class="tdot" style="background:#6b7280"></span><span class="tlabel">${esc(h)}</span><code>/${esc(h)}</code><span class="tlinks">${pageLinks(h, devRunning)}</span></div>`).join('')}` : ''}
      </div>
    </div>
  </section>

  <!-- PROJETS -->
  <div class="sect-h">Projets (${projects.length})</div>
  <section class="pgrid">
    ${projects.map(p => projectCard(p, devRunning)).join('')}
  </section>

  <!-- VIDEOS -->
  ${videos.length ? `<div class="sect-h">Toutes les vidéos (${videos.length})</div>
  <section class="panel">
    <div class="panel-head"><h3>Vidéos intégrées</h3></div>
    <div class="vgrid">
      ${videos.map(v => `<div class="vcard">
        <div class="vcard-img"><img src="${esc(v.jpg)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="vcard-play">${IC.play}</span><a class="vcard-open" href="${esc(v.url)}" target="_blank" title="Ouvrir la vidéo">${IC.ext}</a></div>
        <div class="vcard-name" title="${esc(v.name)}">${esc(v.name)}</div>
        <div class="vcard-foot"><span class="vcard-where">${esc(v.where)}</span><span class="vsize" data-url="${esc(v.url)}">…</span></div>
      </div>`).join('')}
    </div>
  </section>` : ''}

  <!-- PERFORMANCE -->
  <div class="sect-h">Performance</div>
  <section class="panel" id="perf-panel">
    <div class="panel-head"><h3>Vitesse du site</h3><span class="link" onclick="runPerf()">Analyser</span></div>
    <div class="perf-static">
      <span>Poids /public <b>${site.publicSize}</b></span>
      <span>Images <b>${site.images}</b></span>
      <span>Vidéos <b>${site.videos}</b></span>
      <span>Plus gros fichier <b>${heavy[0] ? heavy[0].size : '—'}</b></span>
    </div>
    <div id="perf-scores"><p class="empty">Clique sur « Analyser » pour mesurer la vitesse réelle du site en ligne (mobile, via Google). ~20 s.</p></div>
  </section>

  <!-- FAVICON -->
  <div class="sect-h">Identité</div>
  <section class="panel">
    <div class="panel-head"><h3>Favicon</h3></div>
    <div class="favrow">
      ${[16, 24, 32, 48, 64, 128, 256].map(s => `<div class="favitem"><div class="favbox"><img src="/favicon.svg" width="${s}" height="${s}" alt=""></div><span>${s}px</span></div>`).join('')}
    </div>
  </section>

  <!-- MAINTENANCE -->
  <div class="sect-h">Maintenance &amp; Git</div>
  <section class="cols">
    <div class="panel">
      <div class="panel-head"><h3>Fichiers les plus lourds</h3></div>
      ${heavy.length ? heavy.map(h => `<div class="heavy-row"><span class="heavy-name">${esc(h.name)}</span><span class="heavy-size">${h.size}</span></div>`).join('') : '<p class="empty">—</p>'}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Historique des envois</h3>${gh ? `<a class="link" href="${gh.commits}" target="_blank">tout voir ${IC.ext}</a>` : ''}</div>
      ${formatLog(git.log)}
    </div>
  </section>

  <section class="cols">
    <div class="panel">
      <div class="panel-head"><h3>Fichiers modifiés (${modifiedCount})</h3></div>
      ${formatStatus(git.status)}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Dépôt &amp; technique</h3></div>
      <div class="remote-url">${esc(git.remote)}</div>
      <span class="config-link" onclick="openModal('remote-modal')">Modifier l'adresse</span>
      <div class="techos">
        <span>Astro <b>${esc(site.astro)}</b></span>
        <span>Node <b>${esc(site.node)}</b></span>
        <span>Build dist <b>${esc(site.distSize)}</b></span>
        <span>Branche <b>${esc(git.branch)}</b></span>
      </div>
    </div>
  </section>

</div>

<div id="toast"></div>

<div class="overlay" id="commit-modal"><div class="modal">
  <h2>Envoyer sur GitHub</h2>
  <p class="modal-explain">Décris en quelques mots ce que tu as changé. Le site en ligne se met à jour ~1 minute après l'envoi.</p>
  <input type="text" id="commit-msg" placeholder="Ex : nouvelle page projet, correction couleurs…">
  <div class="btns"><button class="btn" onclick="closeModal('commit-modal')">Annuler</button><button class="btn primary" onclick="doCommit()">Envoyer</button></div>
</div></div>

<div class="overlay" id="token-modal"><div class="modal">
  <h2>Connecter l'API GoatCounter</h2>
  <p class="modal-explain">Pour des chiffres <b>à jour</b> (sans le cache de 4 h) et le graphique. Dans GoatCounter : menu en haut à droite → <b>API</b> → nouvelle clé avec la permission « Read statistics ». Colle-la ici — elle est stockée <b>seulement sur ton Mac</b> (dashboard/secret.json, jamais sur GitHub).</p>
  <input type="text" id="token-input" placeholder="Clé API GoatCounter">
  <div class="btns"><button class="btn" onclick="closeModal('token-modal')">Annuler</button><button class="btn primary" onclick="saveToken()">Connecter</button></div>
</div></div>

<div class="overlay" id="remote-modal"><div class="modal">
  <h2>Adresse du dépôt GitHub</h2>
  <p class="modal-explain">Là où ton site est stocké sur GitHub. À changer seulement si tu crées un nouveau dépôt.</p>
  <input type="text" id="remote-url" placeholder="https://github.com/ton-nom/ton-repo.git" value="${git.remote !== 'non configuré' ? esc(git.remote) : ''}">
  <div class="btns"><button class="btn" onclick="closeModal('remote-modal')">Annuler</button><button class="btn primary" onclick="doRemote()">Enregistrer</button></div>
</div></div>

<script>
(function(){const d=document.body.classList.contains('dark');document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.th===(d?'dark':'light')));})();
function setTheme(t){const d=t==='dark';document.body.classList.toggle('dark',d);localStorage.setItem('dash-theme',t);document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.th===t));}
function setPreview(url){const f=document.getElementById('preview');if(f){f.src=url;f.scrollIntoView({behavior:'smooth',block:'center'});}else{window.open(url.replace('localhost:${DEV_PORT}','localhost:${DEV_PORT}'),'_blank');}}
function refreshPreview(){const f=document.getElementById('preview');if(f)f.src=f.src;}
function toast(m,ok){const t=document.getElementById('toast');t.textContent=m;t.className=ok?'ok':'err';clearTimeout(t._t);t._t=setTimeout(()=>{t.className='';},5000);}
async function api(p){try{const r=await fetch(p,{method:'POST'});return await r.json();}catch(e){return{ok:false,message:'Erreur réseau : '+e.message};}}
async function toggleDev(){toast('…',true);const d=await api('/api/dev');toast(d.message,d.ok);setTimeout(()=>location.reload(),700);}
async function doCommit(){const m=document.getElementById('commit-msg').value.trim();if(!m){toast("Écris un message avant d'envoyer.",false);return;}closeModal('commit-modal');toast('Envoi en cours…',true);const d=await api('/api/commit?msg='+encodeURIComponent(m)+'&push=true');toast(d.message,d.ok);if(d.ok)setTimeout(()=>location.reload(),1500);}
async function doRemote(){const u=document.getElementById('remote-url').value.trim();if(!u){toast("Colle l'adresse du dépôt.",false);return;}closeModal('remote-modal');const d=await api('/api/remote?url='+encodeURIComponent(u));toast(d.message,d.ok);if(d.ok)setTimeout(()=>location.reload(),600);}
function openModal(id){document.getElementById(id).classList.add('show');}
function closeModal(id){document.getElementById(id).classList.remove('show');}
document.querySelectorAll('.overlay').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('show');}));
async function openLocal(){const d=await api('/api/open?url='+encodeURIComponent('${DEV_URL}'));if(!d.ok)toast(d.message,false);}
function fmtBytes(n){if(!n)return'—';if(n>=1048576)return (n/1048576).toFixed(1)+' Mo';if(n>=1024)return Math.round(n/1024)+' Ko';return n+' o';}
(async function loadSizes(){const els=document.querySelectorAll('.vsize');if(!els.length)return;try{const r=await fetch('/api/media',{method:'POST'});const d=await r.json();if(!d.ok)return;els.forEach(e=>{e.textContent=fmtBytes(d.sizes[e.dataset.url]);});}catch{}})();
let _period='',_view='bars',_stats=null,_chart=null;
function he(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function periodLabel(p){return p==='week'?'7 derniers jours':p==='month'?'30 derniers jours':p==='year'?'12 derniers mois':'tout';}
function segActive(id,attr,val){document.querySelectorAll('#'+id+' .seg-btn').forEach(b=>b.classList.toggle('active',b.dataset[attr]===val));}
function setPeriod(p){_period=p;segActive('period-seg','p',p);loadStats();loadExtra();}
function setView(v){_view=v;segActive('view-seg','v',v);render();}
function refreshStats(){loadStats(true);loadExtra(true);}
async function saveToken(){const t=document.getElementById('token-input').value.trim();if(!t){toast('Colle la clé API.',false);return;}closeModal('token-modal');const d=await api('/api/gc-token?token='+encodeURIComponent(t));toast(d.message,d.ok);if(d.ok)loadStats();}
function statsMsg(){if(!_stats)return '…';if(_stats.reason==='config')return 'Configure GoatCounter dans src/config.ts.';if(_stats.reason==='token')return "Connecte l'API GoatCounter (bouton « Connecter l'API ») pour des chiffres à jour et le graphique."+(_stats.message?' ('+_stats.message+')':'');return 'Données indisponibles'+(_stats.message?' : '+_stats.message:'')+'.';}
async function loadStats(nocache){const bars=document.getElementById('bars-view');if(bars)bars.innerHTML='<p class="empty">Chargement…</p>';try{const r=await fetch('/api/gc-stats?period='+_period+(nocache?'&nocache=1':''),{method:'POST'});_stats=await r.json();}catch(e){_stats={ok:false,reason:'error',message:e.message};}updateTotal();render();}
async function loadExtra(nocache){const keys=['toprefs','browsers','systems','locations','languages','sizes'];keys.forEach(k=>{const b=document.getElementById('bd-'+k);if(b)b.innerHTML='<p class="empty">…</p>';});try{const r=await fetch('/api/gc-extra?period='+_period+(nocache?'&nocache=1':''),{method:'POST'});const d=await r.json();keys.forEach(k=>renderBd(k,d&&d.ok?d[k]:null));}catch{keys.forEach(k=>renderBd(k,null));}}
function renderBd(key,items){const box=document.getElementById('bd-'+key);if(!box)return;if(!items||!items.length){box.innerHTML='<p class="empty">—</p>';return;}const max=Math.max(1,...items.map(i=>i.count));box.innerHTML=items.map(i=>'<div class="bd-row"><span class="bd-name">'+he(i.name)+'</span><span class="bd-bar"><span style="width:'+Math.round(i.count/max*100)+'%"></span></span><span class="bd-num">'+i.count+'</span></div>').join('');}
function updateTotal(){const box=document.getElementById('gc-count');if(!box)return;if(_stats&&_stats.ok){box.innerHTML='<div class="gc-big">'+(_stats.total||0)+'</div><div class="gc-lab">pages vues · '+periodLabel(_period)+'</div>';}else{box.innerHTML='<p class="empty">'+statsMsg()+'</p>';}}
function render(){const bars=document.getElementById('bars-view'),chart=document.getElementById('chart-view');if(!bars||!chart)return;
if(!_stats||!_stats.ok){bars.style.display='';chart.style.display='none';bars.innerHTML='<p class="empty">'+statsMsg()+'</p>';return;}
if(_view==='chart'){bars.style.display='none';chart.style.display='';renderChart();}else{bars.style.display='';chart.style.display='none';renderBars();}}
function renderBars(){const bars=document.getElementById('bars-view'),rows=_stats.pages;if(!rows.length){bars.innerHTML='<p class="empty">Aucune vue sur cette période.</p>';return;}const max=Math.max(1,...rows.map(x=>x.count));
bars.innerHTML=rows.map(x=>'<div class="ptraf-row"><div class="ptraf-lab">'+x.label+'<code>'+x.path+'</code></div><div class="ptraf-track"><div class="ptraf-bar" style="width:'+Math.round(x.count/max*100)+'%;background:'+x.color+'"></div></div><div class="ptraf-num">'+x.count+'</div></div>').join('');}
function renderChart(){const top=_stats.pages.slice(0,10),days=_stats.days;const ctx=document.getElementById('gc-chart');if(!window.Chart){ctx.parentNode.innerHTML='<p class="empty">Graphique indisponible (Chart.js non chargé — vérifie ta connexion).</p>';return;}
const ds=top.map(p=>({label:p.label,data:days.map(d=>p.byDay[d]||0),borderColor:p.color,backgroundColor:p.color,tension:.3,borderWidth:2,pointRadius:0,pointHoverRadius:4}));
if(_chart)_chart.destroy();
_chart=new Chart(ctx,{type:'line',data:{labels:days,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{labels:{color:'#ddd',boxWidth:10,usePointStyle:true,font:{size:11}}},tooltip:{}},scales:{x:{ticks:{color:'#888',maxTicksLimit:8,maxRotation:0},grid:{color:'rgba(255,255,255,.06)'}},y:{beginAtZero:true,ticks:{color:'#888',precision:0},grid:{color:'rgba(255,255,255,.06)'}}}}});}
loadStats();loadExtra();
function scoreClass(v){return v>=90?'s-good':v>=50?'s-mid':'s-bad';}
async function runPerf(){const box=document.getElementById('perf-scores');box.innerHTML='<p class="empty">Analyse en cours (~20 s)…</p>';try{const r=await fetch('/api/perf',{method:'POST'});const d=await r.json();if(!d.ok){box.innerHTML='<p class="empty">'+(d.message||'Analyse indisponible.')+'</p>';return;}
const S=d.scores,M=d.metrics;const cell=(v,l)=>'<div class="score"><div class="score-val '+(v==null?'':scoreClass(v))+'">'+(v==null?'—':v)+'</div><div class="score-lab">'+l+'</div></div>';
box.innerHTML='<div class="perf-scores">'+cell(S.perf,'Perf')+cell(S.a11y,'Accessib.')+cell(S.seo,'SEO')+cell(S.bp,'Bonnes prat.')+'</div>'+
'<div class="perf-metrics"><span>LCP <b>'+M.lcp+'</b></span><span>FCP <b>'+M.fcp+'</b></span><span>CLS <b>'+M.cls+'</b></span><span>Blocage <b>'+M.tbt+'</b></span></div>';
}catch(e){box.innerHTML='<p class="empty">Erreur : '+e.message+'</p>';}}
</script>
</body>
</html>`;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ─── Serveur ───
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page());
    return;
  }
  if (url.pathname.startsWith('/api/') && req.method === 'POST') { handleAPI(url.pathname, url.searchParams, res); return; }

  // Sert les assets du dossier public/ (pour les aperçus/posters).
  if (req.method === 'GET') {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { rel = url.pathname; }
    const fp = join(PUBLIC, rel);
    if (fp.startsWith(PUBLIC) && existsSync(fp)) {
      try {
        if (statSync(fp).isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
          res.end(readFileSync(fp));
          return;
        }
      } catch {}
    }
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Dashboard → http://localhost:${PORT}\n`);
  if (!process.env.FRANCK_ELECTRON) { try { execSync(`open http://localhost:${PORT}`); } catch {} }
});

process.on('SIGINT', () => { if (devProcess) devProcess.kill(); process.exit(0); });
process.on('SIGTERM', () => { if (devProcess) devProcess.kill(); process.exit(0); });
