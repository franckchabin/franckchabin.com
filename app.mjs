#!/usr/bin/env node
// ─── Dashboard franckchabin.com ───
// Double-clic sur Dashboard.app ou : node app.mjs

import { createServer } from 'node:http';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 3333;
const DEV_PORT = 4321;
const DEV_URL = `http://localhost:${DEV_PORT}/franckchabin.com/`;
const LIVE_URL = 'https://franckchabin.github.io/franckchabin.com';

let devProcess = null;

// ─── Exécuter une commande et retourner le résultat ───

function exec(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, timeout: 30000, env: { ...process.env, FORCE_COLOR: '0' } }).toString().trim();
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: (e.stderr?.toString() || e.stdout?.toString() || e.message).trim() };
  }
}

function isDevRunning() {
  return devProcess !== null && devProcess.exitCode === null;
}

function getGitInfo() {
  const branch = exec('git branch --show-current');
  const remote = exec('git remote get-url origin');
  const status = exec('git status --short');
  const log = exec('git log --oneline -10');
  return {
    branch: branch.ok ? branch.output : '—',
    remote: remote.ok ? remote.output : 'non configuré',
    status: status.ok ? status.output : '',
    log: log.ok ? log.output : '',
  };
}

// ─── Répondre en JSON ───

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// ─── API ───

function handleAPI(pathname, params, res) {

  // --- Démarrer / Arrêter le serveur de dev ---
  if (pathname === '/api/dev') {
    if (isDevRunning()) {
      devProcess.kill('SIGTERM');
      devProcess = null;
      return json(res, { ok: true, message: 'Serveur arrêté.' });
    }
    if (!existsSync(`${ROOT}/node_modules`)) {
      const install = exec('npm install');
      if (!install.ok) return json(res, { ok: false, message: 'Erreur npm install :\n' + install.output });
    }
    devProcess = spawn('npx astro dev', {
      cwd: ROOT, shell: true, stdio: 'ignore', detached: false,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    devProcess.on('close', () => { devProcess = null; });
    return new Promise(resolve => {
      setTimeout(() => {
        json(res, { ok: true, message: `Serveur lancé !`, devRunning: true });
        resolve();
      }, 2000);
    });
  }

  // --- Git status (rafraîchir) ---
  if (pathname === '/api/status') {
    return json(res, { ok: true, git: getGitInfo(), devRunning: isDevRunning() });
  }

  // --- Git commit + push ---
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

  // --- Config remote ---
  if (pathname === '/api/remote') {
    const url = params.get('url') || '';
    if (!url) return json(res, { ok: false, message: 'URL vide.' });
    const has = exec('git remote get-url origin');
    const cmd = has.ok ? `git remote set-url origin ${JSON.stringify(url)}` : `git remote add origin ${JSON.stringify(url)}`;
    const result = exec(cmd);
    return json(res, { ok: result.ok, message: result.ok ? 'Adresse GitHub mise à jour !' : 'Erreur :\n' + result.output });
  }

  res.writeHead(404);
  res.end('Not found');
}

// ─── Formater l'historique git ───

function formatLog(logStr) {
  if (!logStr) return '<p class="empty">Aucun envoi pour le moment</p>';
  return logStr.split('\n').map(line => {
    const match = line.match(/^([a-f0-9]+)\s+(.+)$/);
    if (!match) return '';
    return `<div class="log-entry"><span class="hash">${match[1]}</span> ${esc(match[2])}</div>`;
  }).join('');
}

// ─── Formater les fichiers modifiés ───

function formatStatus(statusStr) {
  if (!statusStr) return '<p class="empty">Aucun fichier modifié</p>';
  return statusStr.split('\n').map(line => {
    const code = line.substring(0, 2).trim();
    const file = line.substring(3);
    let label = 'modifié';
    let cls = 'modified';
    if (code === '??') { label = 'nouveau'; cls = 'new'; }
    else if (code === 'D') { label = 'supprimé'; cls = 'deleted'; }
    else if (code === 'A') { label = 'ajouté'; cls = 'new'; }
    return `<div class="file-entry"><span class="badge ${cls}">${label}</span> ${esc(file)}</div>`;
  }).join('');
}

// ─── HTML ───

function page() {
  const git = getGitInfo();
  const devRunning = isDevRunning();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>franckchabin.com</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0a0a0a; color: #e0e0e0;
    min-height: 100vh; padding: 2.5rem;
    max-width: 700px;
  }
  a { color: #4ade80; text-decoration: none; }
  a:hover { text-decoration: underline; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #fff; margin-bottom: 0.2rem; }
  .sub { font-size: 0.85rem; color: #555; margin-bottom: 2rem; }

  /* ── Liens du site ── */
  .links {
    display: flex; gap: 1.5rem; margin-bottom: 2rem; font-size: 0.85rem;
  }
  .links a {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 0.5rem 1rem; border-radius: 10px; border: 1px solid #222;
    background: #141414; color: #aaa; transition: all 0.15s;
  }
  .links a:hover { border-color: #4ade80; color: #4ade80; text-decoration: none; }
  .links a.live { border-color: #333; }
  .links a.dev-on { border-color: #4ade80; color: #4ade80; }
  .links .dot-sm { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
  .links .dot-green { background: #4ade80; }
  .links .dot-grey { background: #555; }

  /* ── Boutons principaux ── */
  .actions { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .action-btn {
    padding: 0.9rem 1.5rem; border-radius: 14px; border: 1px solid #222;
    background: #141414; cursor: pointer; transition: all 0.15s; user-select: none;
    flex: 1; min-width: 180px; text-align: left;
  }
  .action-btn:hover { border-color: #444; background: #1a1a1a; transform: translateY(-1px); }
  .action-btn:active { transform: translateY(0); }
  .action-btn.on { border-color: #4ade80; }
  .action-btn.busy { opacity: 0.5; pointer-events: none; }
  .action-btn h2 { font-size: 1rem; font-weight: 500; margin-bottom: 0.3rem; color: #fff; }
  .action-btn p { font-size: 0.75rem; color: #666; line-height: 1.4; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .green { background: #4ade80; }
  .grey { background: #444; }

  /* ── Sections info ── */
  .section {
    margin-bottom: 1.5rem; background: #111; border: 1px solid #1a1a1a;
    border-radius: 14px; padding: 1.3rem;
  }
  .section h3 {
    font-size: 0.75rem; color: #555; margin-bottom: 0.8rem;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .section .explain {
    font-size: 0.75rem; color: #444; margin-bottom: 0.8rem; line-height: 1.5;
  }

  /* Fichiers modifiés */
  .file-entry {
    font-size: 0.8rem; color: #888; padding: 0.25rem 0;
    font-family: 'SF Mono', Menlo, monospace;
  }
  .badge {
    display: inline-block; font-size: 0.65rem; padding: 0.1rem 0.4rem;
    border-radius: 4px; margin-right: 6px; font-family: system-ui;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .badge.new { background: #14532d; color: #86efac; }
  .badge.modified { background: #422006; color: #fbbf24; }
  .badge.deleted { background: #450a0a; color: #fca5a5; }

  /* Historique */
  .log-entry {
    font-size: 0.8rem; color: #888; padding: 0.3rem 0;
    border-bottom: 1px solid #1a1a1a;
  }
  .log-entry:last-child { border-bottom: none; }
  .hash {
    font-family: 'SF Mono', Menlo, monospace; color: #555;
    font-size: 0.7rem; margin-right: 8px;
  }

  .empty { font-size: 0.8rem; color: #444; font-style: italic; }

  /* Config remote (petit lien discret) */
  .config-link {
    font-size: 0.75rem; color: #444; cursor: pointer; margin-top: 0.6rem;
    display: inline-block;
  }
  .config-link:hover { color: #888; }

  /* Toast */
  #toast {
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    padding: 0.8rem 1.5rem; border-radius: 10px; font-size: 0.85rem;
    max-width: 90vw; text-align: center; display: none; z-index: 200;
    animation: slideUp 0.25s ease;
  }
  #toast.ok { background: #14532d; color: #86efac; border: 1px solid #22c55e33; display: block; }
  #toast.err { background: #450a0a; color: #fca5a5; border: 1px solid #ef444433; display: block; }
  @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  /* Modal */
  .overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75);
    z-index: 100; justify-content: center; align-items: center;
  }
  .overlay.show { display: flex; }
  .modal {
    background: #161616; border: 1px solid #2a2a2a; border-radius: 16px;
    padding: 1.8rem; width: 420px; max-width: 90vw;
  }
  .modal h2 { font-size: 1.1rem; margin-bottom: 0.5rem; color: #fff; }
  .modal .modal-explain { font-size: 0.8rem; color: #555; margin-bottom: 1.2rem; line-height: 1.5; }
  .modal input[type="text"] {
    width: 100%; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 10px;
    padding: 0.7rem 1rem; color: #e0e0e0; font-size: 0.9rem; font-family: inherit;
    margin-bottom: 1rem; outline: none;
  }
  .modal input[type="text"]:focus { border-color: #4ade80; }
  .modal label {
    font-size: 0.8rem; color: #666; display: flex; align-items: center; gap: 8px;
    margin-bottom: 1.2rem; cursor: pointer;
  }
  .modal .btns { display: flex; gap: 0.6rem; justify-content: flex-end; }
  .btn {
    padding: 0.55rem 1.2rem; border-radius: 10px; border: 1px solid #333;
    font-size: 0.85rem; cursor: pointer; background: #222; color: #ccc;
    font-family: inherit;
  }
  .btn:hover { background: #2a2a2a; }
  .btn.primary { background: #4ade80; color: #000; border-color: #4ade80; font-weight: 600; }
  .btn.primary:hover { background: #22c55e; }
</style>
</head>
<body>

<h1>franckchabin.com</h1>
<p class="sub">Dashboard</p>

<!-- ── Liens vers le site ── -->
<div class="links">
  <a href="${DEV_URL}" target="_blank" class="${devRunning ? 'dev-on' : ''}" id="link-dev">
    <span class="dot-sm ${devRunning ? 'dot-green' : 'dot-grey'}"></span>
    ${devRunning ? 'Voir le site en local' : 'Site local (éteint)'}
  </a>
  <a href="${LIVE_URL}" target="_blank" class="live">
    Voir le site en ligne
  </a>
</div>

<!-- ── 2 boutons principaux ── -->
<div class="actions">
  <div class="action-btn ${devRunning ? 'on' : ''}" id="card-dev" onclick="toggleDev()">
    <h2><span class="dot ${devRunning ? 'green' : 'grey'}"></span>${devRunning ? 'Arrêter' : 'Lancer le site en local'}</h2>
    <p>${devRunning
      ? 'Le serveur tourne — ton site est visible sur localhost'
      : 'Démarre un serveur pour voir ton site pendant que tu travailles'}</p>
  </div>

  <div class="action-btn" id="card-commit" onclick="openModal('commit-modal')">
    <h2>Envoyer sur GitHub</h2>
    <p>Envoie tes modifications — le site en ligne se met à jour tout seul</p>
  </div>
</div>

<!-- ── Fichiers modifiés ── -->
<div class="section">
  <h3>Fichiers modifiés</h3>
  <p class="explain">Ce sont les fichiers que tu as changés depuis le dernier envoi.</p>
  ${formatStatus(git.status)}
</div>

<!-- ── Historique des envois ── -->
<div class="section">
  <h3>Historique des envois</h3>
  <p class="explain">Chaque ligne = un envoi que tu as fait. Le plus récent est en haut.</p>
  ${formatLog(git.log)}
</div>

<!-- ── Config ── -->
<div class="section">
  <h3>Configuration</h3>
  <p class="explain">L'adresse GitHub de ton site. Change-la seulement si tu déplaces ton projet.</p>
  <div style="font-size:0.8rem;color:#666;font-family:'SF Mono',Menlo,monospace;word-break:break-all;">
    ${esc(git.remote)}
  </div>
  <span class="config-link" onclick="openModal('remote-modal')">Modifier l'adresse</span>
</div>

<div id="toast"></div>

<!-- Modal Commit -->
<div class="overlay" id="commit-modal">
  <div class="modal">
    <h2>Envoyer sur GitHub</h2>
    <p class="modal-explain">
      Écris en quelques mots ce que tu as changé (exemple : "ajout page contact", "correction couleurs").
      Ton site en ligne sera mis à jour automatiquement ~1 minute après l'envoi.
    </p>
    <input type="text" id="commit-msg" placeholder="Ex : modification de la page about…">
    <div class="btns">
      <button class="btn" onclick="closeModal('commit-modal')">Annuler</button>
      <button class="btn primary" onclick="doCommit()">Envoyer</button>
    </div>
  </div>
</div>

<!-- Modal Remote -->
<div class="overlay" id="remote-modal">
  <div class="modal">
    <h2>Adresse du repo GitHub</h2>
    <p class="modal-explain">
      C'est l'adresse où ton site est stocké sur GitHub. Tu n'as besoin de la changer que si tu crées un nouveau repo.
    </p>
    <input type="text" id="remote-url" placeholder="https://github.com/ton-nom/ton-repo.git" value="${git.remote !== 'non configuré' ? esc(git.remote) : ''}">
    <div class="btns">
      <button class="btn" onclick="closeModal('remote-modal')">Annuler</button>
      <button class="btn primary" onclick="doRemote()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
// ─── Toast ───
function toast(msg, ok) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = ok ? 'ok' : 'err';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 5000);
}

// ─── Appel API ───
async function api(path) {
  try {
    const r = await fetch(path, { method: 'POST' });
    return await r.json();
  } catch (e) {
    return { ok: false, message: 'Erreur réseau : ' + e.message };
  }
}

// ─── Actions ───

async function toggleDev() {
  const card = document.getElementById('card-dev');
  card.classList.add('busy');
  const data = await api('/api/dev');
  toast(data.message, data.ok);
  setTimeout(() => location.reload(), 500);
}

async function doCommit() {
  const msg = document.getElementById('commit-msg').value.trim();
  if (!msg) { toast("Écris un message avant d'envoyer.", false); return; }
  closeModal('commit-modal');
  toast('Envoi en cours…', true);
  const data = await api('/api/commit?msg=' + encodeURIComponent(msg) + '&push=true');
  toast(data.message, data.ok);
  if (data.ok) {
    document.getElementById('commit-msg').value = '';
    setTimeout(() => location.reload(), 1500);
  }
}

async function doRemote() {
  const url = document.getElementById('remote-url').value.trim();
  if (!url) { toast("Colle l'adresse du repo GitHub.", false); return; }
  closeModal('remote-modal');
  const data = await api('/api/remote?url=' + encodeURIComponent(url));
  toast(data.message, data.ok);
  if (data.ok) setTimeout(() => location.reload(), 500);
}

// ─── Modals ───
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('show'); });
});
</script>
</body>
</html>`;
}

// Échapper le HTML
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── Serveur ───

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page());
    return;
  }

  if (url.pathname.startsWith('/api/') && req.method === 'POST') {
    handleAPI(url.pathname, url.searchParams, res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Dashboard → http://localhost:${PORT}\n`);
  try { execSync(`open http://localhost:${PORT}`); } catch {}
});

process.on('SIGINT', () => { if (devProcess) devProcess.kill(); process.exit(0); });
process.on('SIGTERM', () => { if (devProcess) devProcess.kill(); process.exit(0); });
