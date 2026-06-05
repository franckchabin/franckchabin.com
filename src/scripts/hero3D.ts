/* ================================================================
   HERO 3D — 3dBoy.glb centré dans le hero
   Modèle single-mesh → rotation 90° gauche + suivi curseur doux
   ================================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function initHero3D(hero: HTMLElement, glbPath: string) {
  const W = 240, H = 360;

  /* ── Wrapper centré dans le hero ── */
  const wrap = document.createElement('div');
  wrap.id = 'hero-3d';
  wrap.style.cssText = [
    'position:absolute',
    'left:50%', 'top:50%',
    'transform:translate(-50%,-52%)',
    `width:${W}px`, `height:${H}px`,
    'pointer-events:none',
    'z-index:1',
  ].join(';');
  hero.appendChild(wrap);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  wrap.appendChild(canvas);

  /* ── Renderer ── */
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  /* ── Scène ── */
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, W / H, 0.01, 50);

  /* ── Lumières ── */
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1.5, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xaabbff, 0.5);
  fill.position.set(-2, 0.5, 1);
  scene.add(fill);

  /* ── Curseur ── */
  let targetX = 0, targetY = 0;
  let smoothX = 0, smoothY = 0;

  let model: THREE.Group | null = null;
  /* Rotation de base 90° gauche — signe inversé pour corriger l'orientation */
  const BASE_Y = -Math.PI / 2;
  /* Amplitude max du suivi curseur */
  const MAX_X = 0.22, MAX_Y = 0.35;

  let rafId = 0;

  /* ── Chargement ── */
  new GLTFLoader().load(glbPath, (gltf) => {
    model = gltf.scene;
    scene.add(model);
    model.updateMatrixWorld(true);

    /* Centrer + dimensionner le modèle pour qu'il remplisse le canvas */
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const cent = box.getCenter(new THREE.Vector3());
    const maxD = Math.max(size.x, size.y, size.z);
    const fit  = 2.0 / maxD;                   // échelle pour tenir en ~2 unités
    model.scale.setScalar(fit);
    model.position.set(
      -cent.x * fit,
      -box.min.y * fit,  // poser les pieds sur y=0
      -cent.z * fit,
    );

    /* Caméra : recule pour voir tout le personnage */
    const fovRad = (camera.fov * Math.PI) / 180;
    const dist   = (size.y * fit) / (2 * Math.tan(fovRad / 2)) + 0.4;
    camera.position.set(0, size.y * fit * 0.5, dist);
    camera.lookAt(0, size.y * fit * 0.42, 0);

    /* Rotation initiale : 90° gauche */
    model.rotation.y = BASE_Y;

    /* ── Boucle ── */
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const L = 0.06;
      smoothX += (targetX - smoothX) * L;
      smoothY += (targetY - smoothY) * L;
      if (model) {
        model.rotation.y = BASE_Y + smoothY;
        model.rotation.x = smoothX;
      }
      renderer.render(scene, camera);
    };
    animate();
  });

  /* ── Suivi curseur ── */
  const onMove = (e: MouseEvent) => {
    const r = hero.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width)  * 2 - 1;
    const ny = ((e.clientY - r.top)  / r.height) * 2 - 1;
    targetY = nx * MAX_Y;
    targetX = ny * MAX_X;
  };
  hero.addEventListener('mousemove', onMove);
  hero.addEventListener('mouseleave', () => { targetX = 0; targetY = 0; });

  return () => {
    cancelAnimationFrame(rafId);
    hero.removeEventListener('mousemove', onMove);
    renderer.dispose();
    wrap.remove();
  };
}
