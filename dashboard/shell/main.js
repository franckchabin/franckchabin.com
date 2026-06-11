// Coquille Electron pour le dashboard franckchabin.com.
//
// On démarre le serveur du dashboard (app.mjs, port 3333) en arrière-plan,
// puis on l'affiche dans une vraie fenêtre d'app (sans barre de navigateur).
// Le dashboard contient maintenant un APERÇU du site (iframe du dev server).
//
// Dossier projet :
//   - En dev (electron .) : le dossier parent (… /franckchabin.com).
//   - En app packagée : un chemin choisi au 1er lancement (sélecteur de dossier),
//     mémorisé dans la config de l'app.

const { app, BrowserWindow, shell, nativeImage, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

app.setName('franckchabin');

const PORT = 3333;
let dashProcess = null;

function configPath() { return path.join(app.getPath('userData'), 'franck-config.json'); }
function readConfig() { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (e) { return {}; } }
function writeConfig(cfg) { try { fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)); } catch (e) {} }
function isValidProjectDir(dir) { return !!dir && fs.existsSync(path.join(dir, 'app.mjs')); }

// Détermine le dossier du projet (celui qui contient app.mjs). null si annulé.
function resolveProjectDir() {
  if (!app.isPackaged) return path.join(__dirname, '..', '..');   // dashboard/shell → racine projet
  const cfg = readConfig();
  if (isValidProjectDir(cfg.projectDir)) return cfg.projectDir;
  const guess = path.join(app.getPath('home'), 'Developer', 'franckchabin.com');
  const picked = dialog.showOpenDialogSync({
    title: 'Sélectionne le dossier franckchabin.com (celui qui contient app.mjs)',
    defaultPath: isValidProjectDir(guess) ? guess : app.getPath('home'),
    properties: ['openDirectory'],
    buttonLabel: 'Utiliser ce dossier',
  });
  if (picked && picked[0] && isValidProjectDir(picked[0])) {
    writeConfig(Object.assign({}, cfg, { projectDir: picked[0] }));
    return picked[0];
  }
  return null;
}

// Attend que le serveur du dashboard réponde sur le port.
function waitForServer(cb, tries = 0) {
  const req = http.get(`http://localhost:${PORT}/`, () => cb(true));
  req.on('error', () => {
    if (tries > 60) return cb(false);
    setTimeout(() => waitForServer(cb, tries + 1), 250);
  });
}

function startDashboard(projectDir) {
  // process.execPath = binaire Electron. ELECTRON_RUN_AS_NODE=1 le fait se
  // comporter comme Node → app.mjs (et le serveur astro qu'il lance, qui hérite
  // de l'env) tournent vraiment en Node, sans relancer l'app Electron en boucle.
  // FRANCK_ELECTRON=1 → app.mjs n'ouvre pas le navigateur système.
  dashProcess = spawn(process.execPath, [path.join(projectDir, 'app.mjs')], {
    cwd: projectDir,
    stdio: 'ignore',
    env: Object.assign({}, process.env, { FRANCK_ELECTRON: '1', ELECTRON_RUN_AS_NODE: '1' }),
  });
  dashProcess.on('close', () => { dashProcess = null; });
}

function createWindow() {
  const projectDir = resolveProjectDir();
  if (!projectDir) {
    dialog.showErrorBox('franckchabin', "Aucun dossier de projet valide (il doit contenir app.mjs).");
    app.quit();
    return;
  }

  if (process.platform === 'darwin') {
    try {
      const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
      if (!icon.isEmpty()) app.dock.setIcon(icon);
    } catch (e) {}
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 720,
    minHeight: 520,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0a0a0a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  startDashboard(projectDir);
  waitForServer((ok) => {
    if (ok) win.loadURL(`http://localhost:${PORT}/`);
    else dialog.showErrorBox('franckchabin', "Le dashboard n'a pas démarré (port 3333).");
  });

  // Bande draggable en haut (pour déplacer la fenêtre sans barre de titre).
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      body::before { content:''; position:fixed; top:0; left:0; right:0; height:30px;
        -webkit-app-region: drag; z-index: 9999; }
      a, button, input, .action-btn, iframe { -webkit-app-region: no-drag; }
    `);
  });

  // Liens externes (site en ligne, GitHub…) → navigateur système.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// Verrou d'instance unique → jamais plusieurs fenêtres/instances de l'app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
  });
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('window-all-closed', () => {
  if (dashProcess) { try { dashProcess.kill(); } catch (e) {} }
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { if (dashProcess) { try { dashProcess.kill(); } catch (e) {} } });
