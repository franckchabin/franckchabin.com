/* ================================================================
   HERO CHARACTER — modèle GLB riggé, animé par code.
   - Idle "chill" : balancement du corps + bras qui se balancent
   - La tête (et les lunettes) suivent le curseur (espace-monde, symétrique)
   - Pixelisation (RenderPixelatedPass) + rim light / fresnel
   - Panneau de réglages live (taille, rotation, bras, pixel, lumière…)
   - Override de texture de peau possible sans ré-exporter le modèle
   ================================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';

interface Options {
  pixelSize?: number;
  tunable?: boolean;        // affiche le panneau de réglages (⚙)
  skinTextureURL?: string;  // PNG externe qui remplace la texture de peau (legacy)
  externalTextures?: Record<string, string>; // { nomMatériau: urlPNG } → écrase les textures embarquées
  chill?: boolean;          // mode "footer" : idle seulement, aucune interaction
  grayscale?: boolean;      // rendu noir & blanc
  outlineColor?: string;    // couleur de l'anneau / des contours
  outlineAlways?: boolean;  // contour silhouette toujours visible (sinon à la proximité)
  pixelEdge?: number;       // contour sombre par bord (pixel pass)
  whiteOutline?: boolean;   // contour net (OutlinePass) — silhouette unique
  outlineStrength?: number; // force du contour OutlinePass
  flatOutline?: boolean;    // aplat + contour PAR objet (inverted hull) — pièces séparées
  fillColor?: string;       // couleur d'aplat (sans texture)
  outlineThickness?: number;// épaisseur du contour par objet (fraction de la taille)
  onProximity?: (near: boolean) => void;  // entrée/sortie de la zone du perso (coucou)
  onZoneClick?: () => void;               // clic dans la zone du perso
  outlineFill?: string;                   // fond rempli dans l'écart silhouette ↔ contour
  params?: Partial<typeof DEFAULT_P>;  // surcharges de paramètres par instance
}

/* ── Paramètres par défaut (copiés par instance) ── */
const DEFAULT_P = {
  sizeMul:     0.8,         // multiplicateur de taille
  facingY:     10,          // orientation de base (degrés)
  armDown:     0.83,        // inclinaison des bras le long du corps
  headTilt:    0,           // penché avant de la tête (regard légèrement bas)
  headMax:     20,          // angle max de la tête avant que le CORPS tourne (°)
  turnLine:    0.76,        // position verticale de la jonction front/derrière
                            //   (0 = haut du perso, 1 = bas/pieds)
  waveEnabled: true,        // "coucou" quand le curseur s'approche
  waveRadius:  200,         // rayon de déclenchement du coucou (px)
  waveRaise:   0.50,        // angle du bras de coucou (plus petit = rentre moins dans la tête)
  pointEnabled: true,       // baguette levée (bras droit)
  pointRaise:  0.85,        // hauteur du bras baguette
  pointSide:   1.20,        // penché latéral du bras baguette
  idleAmount:  1.0,         // intensité des mouvements idle (respiration, balancement)
  pixelSize:   2,           // taille des pixels
  ambient:     2.3,         // lumière ambiante
  fresnel:     0.20,        // intensité rim light / fresnel
};
type Params = typeof DEFAULT_P;

/* ── Mapping curseur → cible 3D que le perso regarde (le "trail") ──
   +Z = vers la caméra (devant), +X = droite, +Y = haut.
   Quand le curseur monte au-dessus de sa tête, la cible passe derrière
   (Tz < 0) → le corps se retourne pour la suivre. */
const TRACK = {
  side:       1.15,   // amplitude horizontale
  up:         0.75,   // amplitude verticale
  depth:      1.60,   // vitesse de passage derrière au-dessus de la ligne
  frontBias:  0.35,   // décalage "devant" (plus petit = retournement plus près de la ligne)
  bodySmooth: 0.22,   // lissage de la rotation du corps (plus grand = suit mieux la tête)
};

/* ── Réglages fixes de l'idle ── */
const ANIM = {
  speed:       1.0,
  armSwing:    0.10,
  foreArm:     0.05,
  bodySway:    0.05,
  breathe:     0.025,
  headSmooth:  0.08,
  walkCadence: 7.0,    // vitesse FIXE des pas (indépendante de la vitesse de rotation)
  stepAmp:     0.40,   // amplitude du pas
  kneeBend:    0.50,   // pliure du genou
  walkSmooth:  0.06,   // lissage de l'activation de la marche
};

/* ── Animation "coucou" (maintenue tant que le curseur reste dans la zone) ── */
const WAVE = {
  dwell:      0.45, // temps dans la zone avant de démarrer (s)
  blendSpeed: 0.05, // vitesse d'entrée/sortie du coucou (plus petit = transition plus douce)
  turnEase:   0.022,// vitesse du retournement face caméra (plus petit = plus lent/smooth)
  zoneUp:     0.14, // remonte le centre de la zone de coucou (fraction de hauteur)
  raise:      1.45, // hauteur du bras levé (plus bas = ne rentre plus dans la tête)
  osc:        0.35, // amplitude du balancement de la main
  freq:       12,   // vitesse du coucou
  lean:      -0.20, // inclinaison du corps (côté bras gauche)
  headSide:  -0.10, // léger regard de côté
  headRoll:  -0.45, // inclinaison (roll) de la tête (côté bras gauche)
};

/* ── Baguette pointée vers le curseur (bras droit) ── */
const POINT = {
  blendSpeed: 0.10, // lissage on/off
  /* Pose "baguette levée + vers l'avant" (comme le coucou), sans visée curseur
     → ne rentre plus dans la tête. Hauteur/penché réglés via P (sliders). */
  forwardYaw: -0.90, // Y : amène le bras vers l'avant
  elbow:      -0.40, // léger pli de l'avant-bras vers l'avant
  follow:      0.30, // suivi TRÈS léger du curseur par le coude
  wrist:       0.45, // poignet vers l'avant → étoile devant la main
};

/* ── Orientation fixe de la baguette (bois vers l'avant) ── */
const BATON = { angle: 0 };  // correction d'orientation (le modèle est déjà bien orienté)

/* ── Idle "ennui" : regard qui vagabonde quand la souris ne bouge plus ── */
const BORED = {
  delay:         1000,  // ms d'inactivité avant de s'ennuyer
  blendSpeed:    0.012, // entrée très douce (la sortie est rapide)
  glanceInterval: 3.6,  // s entre deux "coups d'œil"
  ampX:          0.40,  // amplitude regard gauche/droite
  ampY:          0.13,  // amplitude regard haut/bas
};

const D2R = Math.PI / 180;
const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

export function initCornerDance(mount: HTMLElement, glbPath: string, opts: Options = {}) {
  /* Paramètres PROPRES à cette instance (footer ≠ hero) */
  const P: Params = { ...DEFAULT_P };
  if (opts.params) Object.assign(P, opts.params);
  if (opts.pixelSize != null) P.pixelSize = opts.pixelSize;
  if (opts.chill) { P.waveEnabled = false; P.pointEnabled = false; }
  /* Mobile (tactile, piloté par le mousesim) : pas de coucou ni de hover/clic */
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover:none)').matches;
  if (isTouch) P.waveEnabled = false;

  let W = mount.clientWidth  || 300;
  let H = mount.clientHeight || 390;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;transition:filter .25s ease';
  mount.appendChild(canvas);
  /* Outline de proximité : anneau gris clair DÉTACHÉ de la silhouette (marge
     externe vide), via un filtre SVG (dilatation de l'alpha → anneau). */
  const outlineId = 'dance-outline-' + Math.random().toString(36).slice(2);
  const outlineColor = opts.outlineColor ?? '#b9b9b9';
  const fillCol = opts.outlineFill;   // fond optionnel dans l'écart (silhouette ↔ anneau)
  /* Couche de remplissage de l'écart (dilate 6 = silhouette + marge) */
  const fillLayer = fillCol
    ? `<feFlood flood-color="${fillCol}" flood-opacity="0" result="ff"/>
       <feComposite in="ff" in2="inner" operator="in" result="fillc"/>` : '';
  const fillMerge = fillCol ? '<feMergeNode in="fillc"/>' : '';
  const svgWrap = document.createElement('div');
  svgWrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svgWrap.innerHTML =
    `<svg><defs><filter id="${outlineId}" x="-50%" y="-50%" width="200%" height="200%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="7.5" result="outer"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="inner"/>
      <feComposite in="outer" in2="inner" operator="out" result="ring"/>
      <feFlood flood-color="${outlineColor}" flood-opacity="0" result="rf"/>
      <feComposite in="rf" in2="ring" operator="in" result="ringc"/>
      ${fillLayer}
      <feMerge>${fillMerge}<feMergeNode in="ringc"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs></svg>`;
  document.body.appendChild(svgWrap);
  const floodEls = svgWrap.querySelectorAll('feFlood');
  canvas.style.filter = `${opts.grayscale ? 'grayscale(1) ' : ''}url(#${outlineId})`;
  let outlineOp = 0;                              // opacité animée de l'anneau

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, W / H, 0.01, 50);

  /* ── Lumières (avec rim light pour le relief) ── */
  const ambient = new THREE.AmbientLight(0xffffff, P.ambient);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x554433, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(1.5, 3, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-2, 0.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.2);  // contre-jour
  rim.position.set(0, 2, -3);
  scene.add(rim);

  /* ── Fresnel : liseré lumineux sur les bords (injecté dans les matériaux) ── */
  const fresnelUniform = { value: P.fresnel };
  const fresnelColor   = { value: new THREE.Color(0xeaf2ff) };
  function addFresnel(mat: THREE.Material) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFresnel = fresnelUniform;
      shader.uniforms.uFresnelColor = fresnelColor;
      shader.fragmentShader =
        'uniform float uFresnel;\nuniform vec3 uFresnelColor;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           float _fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
           gl_FragColor.rgb += uFresnel * _fres * uFresnelColor;`
        );
    };
    mat.needsUpdate = true;
  }

  /* ── Post-processing ── */
  const composer = new EffectComposer(renderer);
  composer.setSize(W, H);
  const edge = opts.pixelEdge ?? 0;   // contour par objet (bords normales/profondeur)
  const pixelPass = new RenderPixelatedPass(P.pixelSize, scene, camera, { normalEdgeStrength: edge, depthEdgeStrength: edge });
  composer.addPass(pixelPass);
  /* Contour BLANC par objet (style "cubes") — optionnel */
  let outlinePass: OutlinePass | null = null;
  if (opts.whiteOutline) {
    outlinePass = new OutlinePass(new THREE.Vector2(W, H), scene, camera);
    outlinePass.edgeStrength = opts.outlineStrength ?? 4;
    outlinePass.edgeThickness = 1;
    outlinePass.edgeGlow = 0;
    outlinePass.pulsePeriod = 0;
    outlinePass.visibleEdgeColor.set(opts.outlineColor ?? '#ffffff');
    outlinePass.hiddenEdgeColor.set(opts.outlineColor ?? '#ffffff');
    composer.addPass(outlinePass);
  }
  composer.addPass(new OutputPass());

  /* ── Suivi curseur (coords brutes ; le relatif au perso se calcule
        chaque frame à partir de la position réelle du canvas) ── */
  let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
  let smoothX = 0, smoothY = 0, smoothB = 0;
  let lastMoveMs = (typeof performance !== 'undefined' ? performance.now() : 0);
  let smoothBored = 0, glanceIdx = -1, glanceX = 0, glanceY = 0, glanceCurX = 0, glanceCurY = 0;
  let smoothArm = 1;   // activité (souris bouge) → fade rapide de la baguette
  const onMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; lastMoveMs = performance.now(); };
  window.addEventListener('mousemove', onMove);
  let curInZone = false;   // curseur dans la zone du perso (coucou)
  const onClick = () => { if (curInZone) opts.onZoneClick?.(); };
  if (opts.onZoneClick && !isTouch) window.addEventListener('click', onClick);

  /* ── Os ── */
  const bones: Record<string, THREE.Object3D> = {};
  const rest:  Record<string, THREE.Quaternion> = {};
  const parentQ:   Record<string, THREE.Quaternion> = {};  // quat du parent en espace-MODÈLE (repos)
  const parentInv: Record<string, THREE.Quaternion> = {};
  const BONE_NAMES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head',
    'UpperArm.L', 'UpperArm.R', 'ForeArm.L', 'ForeArm.R', 'Hand.R',
    'Thigh.L', 'Thigh.R', 'Shin.L', 'Shin.R'];

  /* GLTFLoader retire les points des noms : 'UpperArm.R' → 'UpperArmR' */
  function findBone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
    return root.getObjectByName(name)
      ?? root.getObjectByName(name.replace(/\./g, ''))
      ?? root.getObjectByName(name.replace(/\./g, '_'));
  }

  const _e = new THREE.Euler();
  const _qe = new THREE.Quaternion();
  /* Rotation de l'os en ESPACE-MODÈLE (axes monde : +X droite, +Y haut, +Z avant).
     Indépendant de l'orientation locale de l'os → axes intuitifs. */
  function setBone(name: string, x: number, y: number, z: number) {
    const b = bones[name];
    if (!b || !parentInv[name]) return;
    _e.set(x, y, z);
    _qe.setFromEuler(_e);
    b.quaternion.copy(parentInv[name]).multiply(_qe).multiply(parentQ[name]).multiply(rest[name]);
  }

  /* Head-tracking 3D look-at + report sur le corps */
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const qParent = new THREE.Quaternion(), qDesired = new THREE.Quaternion();
  const headPos = new THREE.Vector3(), targetWorld = new THREE.Vector3();
  const fAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), zAxis = new THREE.Vector3();
  const upRef = new THREE.Vector3(), headRollQ = new THREE.Quaternion();
  const bodyFwd = new THREE.Vector3(), rotAxis = new THREE.Vector3(), clampQ = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  /* Limite une direction à un cône autour de l'avant du corps (anti-backflip,
     et empêche le bras de pointer derrière quand le perso est retourné). */
  function clampDir(dir: THREE.Vector3, maxAng: number) {
    if (dir.angleTo(bodyFwd) <= maxAng) return;
    rotAxis.crossVectors(bodyFwd, dir);
    if (rotAxis.lengthSq() < 1e-6) rotAxis.set(0, 1, 0);
    rotAxis.normalize();
    clampQ.setFromAxisAngle(rotAxis, maxAng);
    dir.copy(bodyFwd).applyQuaternion(clampQ);
  }
  /* Aim baguette (bras droit) */
  const aimPos = new THREE.Vector3(), aimDir = new THREE.Vector3(), restDir = new THREE.Vector3();
  const qP2 = new THREE.Quaternion(), armRest = new THREE.Quaternion();
  const aimQ = new THREE.Quaternion(), aimWorld = new THREE.Quaternion(), aimLocal = new THREE.Quaternion();
  const handTiltQ = new THREE.Quaternion(), shoulderQ = new THREE.Quaternion();
  let modelYaw = P.facingY * Math.PI / 180;  // rotation appliquée lissée (anti-spin)
  let smoothPoint = 0;                       // blend on/off de la baguette
  let bodyYaw = 0;       // rotation additionnelle du corps (lissée)
  let azPrev = 0;        // azimut déroulé (continuité, évite le 360°)
  let walkPhase = 0;     // phase du cycle de marche
  let walkAmp = 0;       // intensité de la marche (fade in/out)
  let waveT = 0;         // phase d'oscillation du coucou
  let waveDwell = 0;     // temps passé dans la zone (déclenche après un délai)
  let smoothWave = 0;    // blend lissé (transitions douces)

  let model: THREE.Object3D | null = null;
  let baseFit = 1, cxFit = 0, czFit = 0, maxYFit = 0, topAnchorY = 0;
  let turnLineEl: HTMLDivElement | null = null;   // ligne de jonction (mode réglage)
  let waveRingEl: HTMLDivElement | null = null;   // cercle du rayon de coucou
  let centerLineEl: HTMLDivElement | null = null; // axe vertical (milieu de fenêtre)
  let showGuides = false;                         // afficher les guides visuels
  const skinMats: THREE.MeshStandardMaterial[] = [];
  const batonMats: THREE.MeshStandardMaterial[] = [];   // matériaux baguette+étoile (fade)

  const clock = new THREE.Clock();
  let t = 0, rafId = 0;

  /* ── Application live des paramètres ── */
  /* Scaling ancré sur le HAUT (la tête reste fixe en réduisant) */
  function applySize() {
    if (!model) return;
    const S = baseFit * P.sizeMul;
    model.scale.setScalar(S);
    model.position.set(-cxFit * S, topAnchorY - maxYFit * S, -czFit * S);
  }
  function applyFacing() { if (model) model.rotation.y = P.facingY * D2R; }
  function applyPixel()  { pixelPass.pixelSize = P.pixelSize; pixelPass.setSize(W, H); }
  function applyLights() { ambient.intensity = P.ambient; fresnelUniform.value = P.fresnel; }

  /* ── Chargement ── */
  new GLTFLoader().load(
    glbPath,
    (gltf) => {
      model = gltf.scene;
      scene.add(model);

      /* On supprime uniquement d'éventuels meshes de SAUVEGARDE (BACKUP, V2BAK,
         tripo…). On GARDE le perso skinné ET les accessoires (Baton, Etoile)
         qui sont enfants d'un os (Hand.R) et suivent donc la main. */
      const junk: THREE.Object3D[] = [];
      const matByName: Record<string, THREE.MeshStandardMaterial[]> = {};
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (/BACKUP|_BAK|V2BAK|tripo/i.test(mesh.name || '')) { junk.push(mesh); return; }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const mat = m as THREE.MeshStandardMaterial;
          if (!mat) return;
          if (mat.emissive && mat.emissive.r > 0.9 && mat.emissive.g > 0.9 && mat.emissive.b > 0.9) {
            mat.emissive.setRGB(0, 0, 0);
          }
          addFresnel(mat);
          if (mat.map) skinMats.push(mat);
          if (mat.name) (matByName[mat.name] ||= []).push(mat);
        });
      });
      junk.forEach((m) => m.parent?.remove(m));

      /* Baguette + étoile orientées 90° vers l'avant (le bois prolonge la main).
         On les regroupe dans un pivot à l'origine de la main pour les tourner
         ensemble sans les séparer. */
      const baton = model.getObjectByName('Baton');
      const etoile = model.getObjectByName('Etoile');
      const handForBaton = findBone(model, 'Hand.R');
      if (baton && etoile && handForBaton) {
        const pivot = new THREE.Group();
        handForBaton.add(pivot);
        pivot.attach(baton);
        pivot.attach(etoile);
        pivot.rotateX(BATON.angle * D2R);
        /* Matériaux clonés + transparents → on peut faire apparaître/disparaître
           la baguette sans toucher au corps (qui partage Rest_Mat). */
        [baton, etoile].forEach((o) => {
          const mesh = o as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const cloned = mats.map((m) => (m as THREE.MeshStandardMaterial).clone());
          mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
          cloned.forEach((m) => {
            m.transparent = true; m.opacity = 0; batonMats.push(m);
            if (m.name) (matByName[m.name] ||= []).push(m);   // clones aussi pilotés par l'override
          });
        });
      }

      /* Chaussures argentées (matériau métallique dédié) */
      const silver = new THREE.MeshStandardMaterial({ color: 0xd2d6dc, metalness: 0.6, roughness: 0.22 });
      addFresnel(silver);
      ['SHOES.D', 'SHOES.G'].forEach((n) => {
        const m = (model!.getObjectByName(n) || model!.getObjectByName(n.replace(/\./g, ''))) as THREE.Mesh | null;
        if (m && (m as THREE.Mesh).isMesh) m.material = silver;
      });


      /* Override des textures embarquées par des PNG externes (modifiables sans
         ré-export). Clé = nom du matériau (Rest_Mat, Clothes_Mat, Face_Mat…). */
      if (opts.externalTextures || opts.skinTextureURL) {
        const loader = new THREE.TextureLoader();
        const apply = (url: string, targets?: THREE.MeshStandardMaterial[]) => {
          if (!targets || !targets.length) return;
          loader.load(url, (base) => {
            /* On clone par matériau pour conserver SON canal UV (texCoord 1/2 !),
               son flipY et son wrap → sinon le mapping part en vrille. */
            targets.forEach((mat) => {
              const orig = mat.map as THREE.Texture | null;
              const tex = base.clone();
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.flipY = orig ? orig.flipY : false;
              /* Pas de mipmaps → évite que le noir entre les îlots UV "bave"
                 sur les coutures à distance. */
              tex.generateMipmaps = false;
              tex.minFilter = THREE.LinearFilter;
              if (orig) {
                tex.channel = orig.channel;       // jeu d'UV (0/1/2)
                tex.wrapS = orig.wrapS; tex.wrapT = orig.wrapT;
                tex.repeat.copy(orig.repeat); tex.offset.copy(orig.offset);
              }
              tex.needsUpdate = true;
              mat.map = tex; mat.needsUpdate = true;
            });
          });
        };
        if (opts.externalTextures) {
          for (const [matName, url] of Object.entries(opts.externalTextures)) apply(url, matByName[matName]);
        }
        if (opts.skinTextureURL) apply(opts.skinTextureURL, skinMats);
      }

      /* Os + pose de repos */
      BONE_NAMES.forEach((name) => {
        const b = findBone(model!, name);
        if (b) { bones[name] = b; rest[name] = b.quaternion.clone(); }
      });

      /* Centrage au REPOS (avant rotation) → rotation Y garde le centrage */
      model.rotation.set(0, 0, 0);
      model.updateMatrixWorld(true);

      /* Capture des frames parents en ESPACE-MODÈLE (root à 0) pour setBone */
      BONE_NAMES.forEach((name) => {
        const b = bones[name];
        if (!b || !b.parent) return;
        const pq = new THREE.Quaternion();
        b.parent.getWorldQuaternion(pq);
        parentQ[name] = pq;
        parentInv[name] = pq.clone().invert();
      });

      const box = new THREE.Box3();
      model.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) box.expandByObject(o);
      });
      const size = box.getSize(new THREE.Vector3());
      const cent = box.getCenter(new THREE.Vector3());
      const maxD = Math.max(size.x, size.y, size.z);
      baseFit = 1.8 / maxD;
      cxFit = cent.x; czFit = cent.z; maxYFit = box.max.y;
      topAnchorY = 0.40 + size.y * baseFit;   // sommet (tête) ancré près du haut (peu de marge)
      applySize();                            // applique échelle + position ancrée en haut
      model.rotation.y = P.facingY * D2R;

      /* Contour blanc par objet : on cible tous les meshes skinnés */
      if (outlinePass) {
        const outlineMeshes: THREE.Object3D[] = [];
        model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) outlineMeshes.push(o); });
        outlinePass.selectedObjects = outlineMeshes;
      }

      /* APLAT + contour PAR objet (inverted hull) : chaque pièce a son propre
         liseré, sans texture/couleur. Le contour suit le skinning. */
      if (opts.flatOutline) {
        const fill = new THREE.Color(opts.fillColor ?? '#7d7d7d');
        const outCol = new THREE.Color(opts.outlineColor ?? '#ffffff');
        const thick = maxD * (opts.outlineThickness ?? 0.012);
        const outlineMat = new THREE.MeshBasicMaterial({ color: outCol, side: THREE.BackSide });
        outlineMat.onBeforeCompile = (sh) => {
          sh.vertexShader = 'attribute vec3 aSmoothNormal;\n' + sh.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n\ttransformed += normalize(aSmoothNormal) * ${thick.toFixed(5)};`,
          );
        };
        /* Normales LISSÉES (moyennées par position) → coque continue, sans déchirure */
        const addSmooth = (geo: THREE.BufferGeometry) => {
          if (geo.getAttribute('aSmoothNormal')) return;
          const pos = geo.attributes.position, nor = geo.attributes.normal;
          if (!nor) return;
          const acc = new Map<string, number[]>();
          const key = (i: number) =>
            `${pos.getX(i).toFixed(3)}_${pos.getY(i).toFixed(3)}_${pos.getZ(i).toFixed(3)}`;
          for (let i = 0; i < pos.count; i++) {
            const e = acc.get(key(i)) || [0, 0, 0];
            e[0] += nor.getX(i); e[1] += nor.getY(i); e[2] += nor.getZ(i);
            acc.set(key(i), e);
          }
          const arr = new Float32Array(pos.count * 3);
          for (let i = 0; i < pos.count; i++) {
            const e = acc.get(key(i)) as number[];
            const l = Math.hypot(e[0], e[1], e[2]) || 1;
            arr[i * 3] = e[0] / l; arr[i * 3 + 1] = e[1] / l; arr[i * 3 + 2] = e[2] / l;
          }
          geo.setAttribute('aSmoothNormal', new THREE.BufferAttribute(arr, 3));
        };
        const skinned: THREE.SkinnedMesh[] = [];
        model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
        skinned.forEach((mesh) => {
          addSmooth(mesh.geometry as THREE.BufferGeometry);
          mesh.material = new THREE.MeshBasicMaterial({ color: fill });   // aplat sans texture
          const outline = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
          outline.position.copy(mesh.position);
          outline.quaternion.copy(mesh.quaternion);
          outline.scale.copy(mesh.scale);
          mesh.parent?.add(outline);
          outline.bind(mesh.skeleton, mesh.bindMatrix);
          outline.bindMode = mesh.bindMode;
          outline.frustumCulled = false;
          outline.renderOrder = (mesh.renderOrder || 0) - 1;
        });
      }

      const hModel = size.y * baseFit;
      const fovRad = (camera.fov * Math.PI) / 180;
      const dist   = (hModel * 1.45) / (2 * Math.tan(fovRad / 2)) + 0.4;
      camera.position.set(0, hModel * 0.55, dist);
      camera.lookAt(0, hModel * 0.5, 0);

      if (opts.tunable) {
        /* Guides visuels (créés directement, plus de panneau ⚙ flottant) */
        turnLineEl = document.createElement('div');
        turnLineEl.style.cssText = 'position:fixed;left:0;width:100%;height:0;border-top:2px dashed #9cf;z-index:9998;pointer-events:none;display:none';
        document.body.appendChild(turnLineEl);
        waveRingEl = document.createElement('div');
        waveRingEl.style.cssText = 'position:fixed;border:2px dashed #fc9;border-radius:50%;z-index:9998;pointer-events:none;display:none';
        document.body.appendChild(waveRingEl);
        centerLineEl = document.createElement('div');
        centerLineEl.style.cssText = 'position:fixed;top:0;left:50%;width:0;height:100%;border-left:2px dashed #9cf;z-index:9998;pointer-events:none;display:none';
        document.body.appendChild(centerLineEl);

        /* Contrôles exposés → intégrés dans le panneau DBG du trail */
        (window as unknown as { __DANCE_CTRL?: unknown }).__DANCE_CTRL = {
          P, BORED,
          applySize, applyFacing, applyPixel, applyLights,
          setGuides: (b: boolean) => { showGuides = b; },
          values: () => ({
            sizeMul: P.sizeMul, facingY: P.facingY, headMax: P.headMax, turnLine: P.turnLine,
            waveRadius: P.waveRadius, waveRaise: P.waveRaise, pointRaise: P.pointRaise,
            pointSide: P.pointSide, idleAmount: P.idleAmount, armDown: P.armDown,
            headTilt: P.headTilt, pixelSize: P.pixelSize, ambient: P.ambient, fresnel: P.fresnel,
            boredDelay: BORED.delay, boredAmp: BORED.ampX,
          }),
        };
      }

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        t += dt * ANIM.speed;

        const s = Math.sin(t), br = Math.sin(t * 1.3);

        /* Mobile : suivre la simulation de souris du trail (mousesim) */
        if (!opts.chill) {
          const sim = (window as unknown as { __SIM_CURSOR?: { x: number; y: number } }).__SIM_CURSOR;
          if (sim) { mouseX = sim.x; mouseY = sim.y; lastMoveMs = performance.now(); }
        }

        /* Curseur RELATIF au perso. Trois mesures indépendantes :
           - X (horizontal) : pour atteindre 90° sur les bords
           - gaze vertical  : regard haut/bas (relatif à la tête)
           - "derrière"     : DISTANCE AU-DESSUS de la ligne, réf FIXE
             (déplacer la ligne déplace donc réellement le seuil). */
        const rect    = mount.getBoundingClientRect();
        const lineY   = rect.top + rect.height * P.turnLine;
        const headY   = rect.top + rect.height * 0.30;
        const ax      = rect.left + rect.width * 0.5;
        const refX    = Math.max(180, window.innerWidth * 0.45);
        const refGaze = Math.max(150, window.innerHeight * 0.40);
        const refV    = Math.max(150, rect.height * 0.8);   // réf FIXE (hauteur perso)
        let targetX = Math.max(-1.6, Math.min(1.6, (mouseX - ax)    / refX));
        let targetG = Math.max(-1.5, Math.min(1.5, (mouseY - headY) / refGaze));
        let targetB = Math.max(0,    Math.min(1.3, (lineY - mouseY)  / refV));
        if (turnLineEl) { turnLineEl.style.display = showGuides ? 'block' : 'none'; turnLineEl.style.top = lineY + 'px'; }
        if (centerLineEl) centerLineEl.style.display = showGuides ? 'block' : 'none';

        /* Idle "ennui" : surtout FIXE, avec un coup d'œil de temps en temps.
           Entrée douce, sortie rapide dès qu'on rebouge la souris. */
        const bored = (performance.now() - lastMoveMs) > BORED.delay ? 1 : 0;
        smoothBored += (bored - smoothBored) * (bored ? BORED.blendSpeed : 0.08);
        /* Fade RAPIDE de la baguette (séparé du gaze lent) */
        smoothArm += ((1 - bored) - smoothArm) * ((1 - bored) > smoothArm ? 0.22 : 0.10);
        if (smoothBored > 0.001) {
          const gi = Math.floor(t / BORED.glanceInterval);
          if (gi !== glanceIdx) {                       // nouveau état
            glanceIdx = gi;
            if (gi % 2 === 0) {                         // 1 fois sur 2 : REGARDE EN FACE
              glanceX = 0; glanceY = -0.04;
            } else {                                     // sinon : petit coup d'œil
              const h1 = Math.sin(gi * 12.9898) * 43758.5453;
              const h2 = Math.sin(gi * 78.233)  * 96321.123;
              glanceX = ((h1 - Math.floor(h1)) * 2 - 1) * BORED.ampX;
              glanceY = -0.04 + ((h2 - Math.floor(h2)) * 2 - 1) * BORED.ampY;
            }
          }
          /* Transition LENTE entre états → plus de coups de tête brusques */
          glanceCurX += (glanceX - glanceCurX) * 0.025;
          glanceCurY += (glanceY - glanceCurY) * 0.025;
          const bx = glanceCurX + 0.03 * Math.sin(t * 0.5);   // micro-dérive
          const by = glanceCurY + 0.02 * Math.sin(t * 0.7);
          targetX = lerp(targetX, bx, smoothBored);
          targetG = lerp(targetG, by, smoothBored);
          targetB = lerp(targetB, 0, smoothBored);   // revient DEVANT même si souris garée derrière
        }

        /* CHILL (footer) : de face, regard quasi droit devant, très léger drift */
        if (opts.chill) {
          targetX = 0.08 * Math.sin(t * 0.18) + 0.03 * Math.sin(t * 0.07);
          targetG = -0.02 + 0.05 * Math.sin(t * 0.15 + 1.0);
          targetB = 0;
        }

        smoothX += (targetX - smoothX) * ANIM.headSmooth;
        smoothY += (targetG - smoothY) * ANIM.headSmooth;
        smoothB += (targetB - smoothB) * ANIM.headSmooth;

        /* ── COUCOU : MAINTENU tant que le curseur reste dans la zone du perso.
           Démarre après WAVE.dwell s de présence, s'arrête en douceur à la sortie
           (ou si on part derrière → le suivi/retournement normal reprend). */
        const cxC = rect.left + rect.width * 0.5;
        const cyC = rect.top  + rect.height * (0.5 - WAVE.zoneUp);   // zone remontée vers le haut
        const inZone = Math.hypot(mouseX - cxC, mouseY - cyC) < P.waveRadius;
        if (!isTouch && inZone !== curInZone) { curInZone = inZone; opts.onProximity?.(inZone); }
        waveDwell = inZone ? waveDwell + dt : 0;
        /* Outline gris : fondu d'opacité 0→1 en ~0,6 s à l'entrée dans la zone */
        const oTarget = opts.outlineAlways ? 1 : (inZone ? 1 : 0);
        const oStep = dt / 0.15;   // apparition ET disparition rapides
        outlineOp += Math.max(-oStep, Math.min(oStep, oTarget - outlineOp));
        floodEls.forEach((f) => f.setAttribute('flood-opacity', outlineOp.toFixed(3)));
        if (waveRingEl) {
          waveRingEl.style.display = showGuides ? 'block' : 'none';
          const d = P.waveRadius * 2;
          waveRingEl.style.width = d + 'px'; waveRingEl.style.height = d + 'px';
          waveRingEl.style.left = (cxC - P.waveRadius) + 'px';
          waveRingEl.style.top  = (cyC - P.waveRadius) + 'px';
        }
        const waveTarget = (P.waveEnabled && waveDwell >= WAVE.dwell) ? 1 : 0;
        smoothWave += (waveTarget - smoothWave) * WAVE.blendSpeed;
        if (smoothWave > 0.01) waveT += dt; else waveT = 0;   // phase d'oscillation

        const nx = smoothX;
        /* Cible : suit le curseur, OU regard face caméra légèrement de côté
           pendant le coucou (mignon). */
        const Tx = lerp(nx * TRACK.side, WAVE.headSide, smoothWave);
        const Ty = lerp(-smoothY * TRACK.up - P.headTilt, -0.10, smoothWave);
        const Tz = lerp(
          TRACK.frontBias * (1 - Math.min(1, Math.abs(nx))) - smoothB * TRACK.depth,
          TRACK.frontBias + 0.45,
          smoothWave,
        );

        /* Azimut DÉROULÉ (continu) → pas de saut +180/−180 ni de 360° */
        let az = Math.atan2(Tx, Tz);
        while (az - azPrev >  Math.PI) az -= 2 * Math.PI;
        while (az - azPrev < -Math.PI) az += 2 * Math.PI;
        azPrev = az;

        /* Report sur le corps de ce qui dépasse la capacité du cou */
        const headMax = P.headMax * D2R;
        const overflow = az - Math.max(-headMax, Math.min(headMax, az));
        bodyYaw += (overflow - bodyYaw) * TRACK.bodySmooth;

        /* Rotation appliquée lissée. Pendant le coucou on vise le DEAD-FRONT (0°)
           à VITESSE CONSTANTE (turnEase) → retournement dos→face régulier.
           Hors coucou, suivi réactif. */
        const trackYaw = P.facingY * D2R + bodyYaw;
        /* Cible ET vitesse mélangées EN CONTINU entre suivi et face-caméra
           (au lieu d'un seuil dur) → plus de saccade sèche à l'entrée/sortie
           du coucou. */
        let dFront = -trackYaw;
        dFront = Math.atan2(Math.sin(dFront), Math.cos(dFront));        // chemin court vers 0°
        const desiredYaw = trackYaw + dFront * smoothWave;             // suivi ↔ face caméra
        const turnFactor = lerp(0.6, WAVE.turnEase, Math.min(1, smoothWave * 4));
        let dStep = desiredYaw - modelYaw;
        dStep = Math.atan2(Math.sin(dStep), Math.cos(dStep));          // chemin court
        const yawStep = dStep * turnFactor;                            // rotation appliquée cette frame
        modelYaw += yawStep;
        const frontErr = Math.atan2(Math.sin(modelYaw), Math.cos(modelYaw));
        const armBlend = smoothWave * Math.max(0, 1 - Math.abs(frontErr) / 0.7);

        const idle = P.idleAmount;
        setBone('Hips',  0, 0, ANIM.bodySway * 0.4 * s * idle);
        setBone('Spine', ANIM.breathe * br * idle, 0, ANIM.bodySway * 0.5 * s * idle + WAVE.lean * armBlend);
        setBone('Chest', ANIM.breathe * br * idle, 0, ANIM.bodySway * 0.5 * s * idle + WAVE.lean * armBlend);
        model!.rotation.y = modelYaw;

        /* Jambes : petite marche quand le CORPS tourne (retournement inclus),
           pilotée par la vitesse de rotation réellement appliquée. */
        const turnSpeed = Math.abs(yawStep);
        walkAmp  += (Math.min(1, turnSpeed * 55) - walkAmp) * ANIM.walkSmooth;
        walkPhase += dt * ANIM.walkCadence;
        const wp = Math.sin(walkPhase) * walkAmp;
        setBone('Thigh.R',  ANIM.stepAmp * wp, 0, 0);
        setBone('Thigh.L', -ANIM.stepAmp * wp, 0, 0);
        setBone('Shin.R', -ANIM.kneeBend * Math.max(0, -wp), 0, 0);
        setBone('Shin.L', -ANIM.kneeBend * Math.max(0,  wp), 0, 0);

        /* Bras : repos le long du corps, OU bras GAUCHE levé qui fait coucou.
           (gauche = miroir → raise négatif sur Z) */
        const upLz = lerp(P.armDown, -(P.waveRaise + WAVE.osc * Math.sin(waveT * WAVE.freq)), armBlend);
        const upLx = lerp(ANIM.armSwing * Math.sin(t + Math.PI) * idle, -0.20, armBlend);
        const foLx = lerp(ANIM.foreArm * Math.sin(t + Math.PI + 0.4) * idle, -0.30, armBlend);
        setBone('UpperArm.L', upLx, 0, upLz);
        setBone('ForeArm.L',  foLx, 0, 0);
        setBone('UpperArm.R', ANIM.armSwing * Math.sin(t) * idle,       0, -P.armDown);
        setBone('ForeArm.R',  ANIM.foreArm * Math.sin(t + 0.4) * idle, 0, 0);

        /* Tête : look-at 3D vers la cible (axe avant = +X local) */
        const head = bones['Head'];
        if (head && head.parent) {
          model!.updateMatrixWorld(true);
          head.getWorldPosition(headPos);
          targetWorld.set(headPos.x + Tx, headPos.y + Ty, headPos.z + Tz);
          fAxis.copy(targetWorld).sub(headPos).normalize();
          /* La tête ne dépasse jamais ~90° de l'avant du corps → suit le corps,
             plus de backflip. (bodyFwd = avant du corps, réutilisé par le bras) */
          bodyFwd.set(Math.sin(modelYaw), 0, Math.cos(modelYaw)).normalize();
          clampDir(fAxis, 1.55);
          /* "up" incliné pour le roll de tête pendant le coucou (à gauche) */
          upRef.copy(WORLD_UP);
          if (armBlend > 0.001) {
            headRollQ.setFromAxisAngle(fAxis, WAVE.headRoll * armBlend);
            upRef.applyQuaternion(headRollQ);
          }
          zAxis.crossVectors(fAxis, upRef);
          if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1);
          zAxis.normalize();
          yAxis.crossVectors(zAxis, fAxis).normalize();
          basis.makeBasis(fAxis, yAxis, zAxis);
          qDesired.setFromRotationMatrix(basis);
          head.parent.getWorldQuaternion(qParent);
          qDesired.premultiply(qParent.invert());           // → orientation LOCALE désirée
          /* Inertie : la tête EASE vers la cible (slerp, chemin court) au lieu de
             s'y coller → plus de backflip ni de retournement instantané. */
          head.quaternion.slerp(qDesired, 0.16);
        }

        /* ── Baguette pointée vers le curseur (bras droit) — on/off ──
           Coupé pendant le coucou (le bras droit revient normal). Visée
           PARTIELLE sur l'épaule + COMPLÈTE sur le coude. */
        smoothPoint += ((P.pointEnabled ? 1 : 0) - smoothPoint) * POINT.blendSpeed;
        /* Coupé pendant le coucou ET quand le perso s'ennuie (bras revient normal) */
        const effPoint = smoothPoint * Math.max(0, 1 - smoothWave * 2) * smoothArm;
        /* Baguette visible seulement quand le bras est "sorti" (activité/trail) */
        if (batonMats.length) {
          const op = Math.min(1, effPoint * 1.5);
          for (const m of batonMats) m.opacity = op;
        }
        const armR = bones['UpperArm.R'], foreR = bones['ForeArm.R'], handR = bones['Hand.R'];
        if (effPoint > 0.001 && armR && foreR) {
          /* Bras droit : pose levée + avant (comme le coucou), pas de visée. */
          _e.set(P.pointSide, POINT.forwardYaw, P.pointRaise);
          _qe.setFromEuler(_e);
          shoulderQ.copy(parentInv['UpperArm.R']).multiply(_qe).multiply(parentQ['UpperArm.R']).multiply(rest['UpperArm.R']);
          armR.quaternion.slerp(shoulderQ, effPoint);
          /* Avant-bras : léger pli + suivi TRÈS léger du curseur (coude) */
          _e.set(POINT.elbow - smoothY * POINT.follow, smoothX * POINT.follow, 0);
          _qe.setFromEuler(_e);
          aimLocal.copy(parentInv['ForeArm.R']).multiply(_qe).multiply(parentQ['ForeArm.R']).multiply(rest['ForeArm.R']);
          foreR.quaternion.slerp(aimLocal, effPoint);
          /* Poignet : étoile orientée devant la main */
          if (handR && rest['Hand.R']) {
            handTiltQ.setFromAxisAngle(X_AXIS, POINT.wrist * effPoint);
            handR.quaternion.copy(rest['Hand.R']).multiply(handTiltQ);
          }
        }

        composer.render();
      };
      animate();
    },
    undefined,
    (err) => console.error('[heroCharacter] échec du chargement GLB :', err),
  );

  /* ── Panneau de réglages ─────────────────────────────────────── */
  function buildPanel() {
    const btn = document.createElement('button');
    btn.textContent = '⚙';
    btn.title = 'Réglages perso';
    btn.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9999;width:40px;height:40px;border-radius:50%;border:none;background:#1a1a1a;color:#fff;font-size:18px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3)';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:16px;bottom:64px;z-index:9999;width:260px;max-height:70vh;overflow:auto;padding:14px 16px;border-radius:12px;background:#181818ee;color:#eee;font:12px/1.5 system-ui,sans-serif;backdrop-filter:blur(8px);box-shadow:0 6px 24px rgba(0,0,0,.4);display:none';
    document.body.appendChild(panel);

    /* Guides visuels : ligne de jonction front/derrière + cercle du rayon coucou */
    turnLineEl = document.createElement('div');
    turnLineEl.style.cssText = 'position:fixed;left:0;width:100%;height:0;border-top:2px dashed #9cf;z-index:9998;pointer-events:none;display:none';
    document.body.appendChild(turnLineEl);
    waveRingEl = document.createElement('div');
    waveRingEl.style.cssText = 'position:fixed;border:2px dashed #fc9;border-radius:50%;z-index:9998;pointer-events:none;display:none';
    document.body.appendChild(waveRingEl);
    centerLineEl = document.createElement('div');
    centerLineEl.style.cssText = 'position:fixed;top:0;left:50%;width:0;height:100%;border-left:2px dashed #9cf;z-index:9998;pointer-events:none;display:none';
    document.body.appendChild(centerLineEl);

    btn.onclick = () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    const mk = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:block;margin:10px 0';
      const val = document.createElement('span');
      const render = () => { val.textContent = get().toFixed(2); };
      row.innerHTML = `<div style="display:flex;justify-content:space-between"><span>${label}</span></div>`;
      (row.querySelector('div') as HTMLElement).appendChild(val);
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(get());
      input.style.cssText = 'width:100%;margin-top:4px;accent-color:#9cf';
      input.oninput = () => { set(parseFloat(input.value)); render(); };
      row.appendChild(input);
      panel.appendChild(row);
      render();
    };

    mk('Taille',            0.4,  2.2,  0.01, () => P.sizeMul,  (v) => { P.sizeMul = v; applySize(); });
    mk('Orientation base °',-180, 180,  1,    () => P.facingY,  (v) => { P.facingY = v; applyFacing(); });
    mk('Tête max ° (corps)', 20,  120,  1,    () => P.headMax,  (v) => { P.headMax = v; });
    mk('Ligne retournement', 0,   1,    0.01, () => P.turnLine, (v) => { P.turnLine = v; });
    mk('Inclinaison bras',  0,    1.6,  0.01, () => P.armDown,  (v) => { P.armDown = v; });
    mk('Mouvements idle',   0,    2,    0.05, () => P.idleAmount,(v) => { P.idleAmount = v; });
    mk('Ennui délai s',     0.5,  8,    0.5,  () => BORED.delay / 1000, (v) => { BORED.delay = v * 1000; });
    mk('Ennui amplitude',   0,    1.2,  0.05, () => BORED.ampX, (v) => { BORED.ampX = v; BORED.ampY = v * 0.33; });
    mk('Penché tête',      -0.5,  0.9,  0.01, () => P.headTilt, (v) => { P.headTilt = v; });
    mk('Pixelisation',      1,    12,   1,    () => P.pixelSize,(v) => { P.pixelSize = v; applyPixel(); });
    mk('Lumière ambiante',  0,    3,    0.05, () => P.ambient,  (v) => { P.ambient = v; applyLights(); });
    mk('Fresnel / rim',     0,    2.5,  0.05, () => P.fresnel,  (v) => { P.fresnel = v; applyLights(); });

    /* Case à cocher : coucou à proximité + son rayon */
    const checkRow = document.createElement('label');
    checkRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0 4px;cursor:pointer';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.checked = P.waveEnabled; chk.style.accentColor = '#9cf';
    chk.onchange = () => { P.waveEnabled = chk.checked; };
    const chkLbl = document.createElement('span'); chkLbl.textContent = 'Coucou à proximité';
    checkRow.appendChild(chk); checkRow.appendChild(chkLbl);
    panel.appendChild(checkRow);
    mk('Rayon coucou px',   40,   400,  5,    () => P.waveRadius, (v) => { P.waveRadius = v; });
    mk('Angle bras coucou', 0.5,  2.0,  0.05, () => P.waveRaise,  (v) => { P.waveRaise = v; });

    /* Case à cocher : baguette pointée vers le curseur */
    const pointRow = document.createElement('label');
    pointRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:10px 0 4px;cursor:pointer';
    const pchk = document.createElement('input');
    pchk.type = 'checkbox'; pchk.checked = P.pointEnabled; pchk.style.accentColor = '#9cf';
    pchk.onchange = () => { P.pointEnabled = pchk.checked; };
    const pLbl = document.createElement('span'); pLbl.textContent = 'Baguette levée';
    pointRow.appendChild(pchk); pointRow.appendChild(pLbl);
    panel.appendChild(pointRow);
    mk('Baguette hauteur',  0,   2.0,  0.05, () => P.pointRaise, (v) => { P.pointRaise = v; });
    mk('Baguette penché',  -1.2, 1.2,  0.05, () => P.pointSide,  (v) => { P.pointSide = v; });

    /* Case à cocher : afficher les guides (ligne de retournement + rayon coucou) */
    const guideRow = document.createElement('label');
    guideRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0 4px;cursor:pointer';
    const gchk = document.createElement('input');
    gchk.type = 'checkbox'; gchk.checked = showGuides; gchk.style.accentColor = '#fc9';
    gchk.onchange = () => { showGuides = gchk.checked; };
    const gLbl = document.createElement('span'); gLbl.textContent = 'Afficher les guides';
    guideRow.appendChild(gchk); guideRow.appendChild(gLbl);
    panel.appendChild(guideRow);

    const copy = document.createElement('button');
    copy.textContent = 'Copier les valeurs';
    copy.style.cssText = 'margin-top:8px;width:100%;padding:8px;border:none;border-radius:8px;background:#9cf;color:#000;font-weight:600;cursor:pointer';
    copy.onclick = () => {
      const txt = JSON.stringify({ sizeMul: P.sizeMul, facingY: P.facingY, headMax: P.headMax, turnLine: P.turnLine, waveEnabled: P.waveEnabled, waveRadius: P.waveRadius, waveRaise: P.waveRaise, pointEnabled: P.pointEnabled, pointRaise: P.pointRaise, pointSide: P.pointSide, idleAmount: P.idleAmount, armDown: P.armDown, headTilt: P.headTilt, pixelSize: P.pixelSize, ambient: P.ambient, fresnel: P.fresnel, boredDelay: BORED.delay, boredAmp: BORED.ampX }, null, 2);
      navigator.clipboard?.writeText(txt);
      copy.textContent = 'Copié ✓';
      setTimeout(() => (copy.textContent = 'Copier les valeurs'), 1200);
    };
    panel.appendChild(copy);
  }

  /* ── Responsive ── */
  const resize = () => {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    composer.setSize(W, H);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  /* ── Nettoyage ── */
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('click', onClick);
    ro.disconnect();
    composer.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
