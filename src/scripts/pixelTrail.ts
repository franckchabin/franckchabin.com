/* ================================================================
   PIXEL TRAIL — Three.js overlay
   Effets : pixelisation progressive + dissolution extérieur→centre
            + flou gaussien GLSL optionnel
   ================================================================ */

import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* ── Fragment shader ──────────────────────────────────────────────
   u_pixelFactor : 0 = net    → 1 = blocs de 96px
   u_dissolve    : 0 = intact → 1 = dissolution extérieur→centre
   u_blur        : sigma UV   (0 = net)
   u_opacity     : opacité globale
   ─────────────────────────────────────────────────────────────── */
const FRAG = /* glsl */`
  precision mediump float;

  uniform sampler2D u_tex;
  uniform float     u_pixelFactor;
  uniform float     u_dissolve;
  uniform float     u_blur;
  uniform float     u_opacity;
  uniform vec2      u_resolution;

  varying vec2 vUv;

  /* ── Hash 2D → [0, 1] ── */
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  /* ── Flou gaussien 5 taps séparable H+V ── */
  vec4 gaussBlur(sampler2D tex, vec2 uv, float sigma) {
    float w0 = 0.38774, w1 = 0.24477, w2 = 0.06136;
    vec4 h = texture2D(tex, uv) * w0
      + (texture2D(tex, clamp(uv + vec2( sigma, 0.0), 0.0, 1.0))
      +  texture2D(tex, clamp(uv - vec2( sigma, 0.0), 0.0, 1.0))) * w1
      + (texture2D(tex, clamp(uv + vec2(2.0*sigma, 0.0), 0.0, 1.0))
      +  texture2D(tex, clamp(uv - vec2(2.0*sigma, 0.0), 0.0, 1.0))) * w2;
    vec4 v = texture2D(tex, uv) * w0
      + (texture2D(tex, clamp(uv + vec2(0.0,  sigma), 0.0, 1.0))
      +  texture2D(tex, clamp(uv - vec2(0.0,  sigma), 0.0, 1.0))) * w1
      + (texture2D(tex, clamp(uv + vec2(0.0, 2.0*sigma), 0.0, 1.0))
      +  texture2D(tex, clamp(uv - vec2(0.0, 2.0*sigma), 0.0, 1.0))) * w2;
    return (h + v) * 0.5;
  }

  void main() {
    /* ── Pixelisation ── */
    float blockSize = 1.0 + u_pixelFactor * 95.0;
    vec2  blockIdx  = floor(vUv * u_resolution / blockSize);
    vec2  pixelUV   = clamp((blockIdx + 0.5) * blockSize / u_resolution, 0.0, 1.0);

    /* ── Flou ── */
    vec4 color = (u_blur > 0.001)
      ? gaussBlur(u_tex, pixelUV, min(u_blur, 0.25))
      : texture2D(u_tex, pixelUV);

    /* ── Dissolution extérieur → centre ──────────────────────────
       Chaque bloc a un seuil de disparition basé sur :
         · distance au centre de l'image  → les bords partent en premier
         · hash aléatoire par bloc        → aspect organique, non-uniforme
    ─────────────────────────────────────────────────────────────── */
    if (u_dissolve > 0.001) {
      float dist = clamp(length(pixelUV - 0.5) * 1.4142, 0.0, 1.0);
      float h    = hash21(blockIdx);
      /* threshold ∈ [0.02, 0.98] : 0 = disparaît tôt (bord), 1 = disparaît tard (centre) */
      float threshold = clamp((1.0 - dist) * 0.78 + h * 0.22, 0.02, 0.98);
      color.a *= step(u_dissolve, threshold);
    }

    gl_FragColor = vec4(color.rgb, color.a * u_opacity);
  }
`;

export interface TrailMesh {
  mesh:     THREE.Mesh;
  mat:      THREE.ShaderMaterial;
  texIdx:   number;
  lastUsed: number; // compteur monotone pour le recyclage LRU
}

export class PixelTrail {
  private renderer: THREE.WebGLRenderer;
  private scene:    THREE.Scene;
  private camera:   THREE.OrthographicCamera;
  private textures: (THREE.Texture | null)[];
  private pool:     TrailMesh[];
  private canvas:   HTMLCanvasElement;
  private rafId:    number | null = null;
  private _tick = 0; // horloge logique pour le LRU
  private _fallbackTick = 0; // cycle parmi les images chargées tant que tout n'est pas prêt
  heroW = 0;
  heroH = 0;

  constructor(
    private hero: HTMLElement,
    private trailContainer: HTMLElement,
    imgSrcs: string[],
    poolSize = 24,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:0;width:100%;height:100%';
    this.trailContainer.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas:             this.canvas,
      alpha:              true,
      antialias:          false,
      premultipliedAlpha: true,
      powerPreference:    'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.z = 10;

    this.textures = new Array(imgSrcs.length).fill(null);
    const loader  = new THREE.TextureLoader();
    imgSrcs.forEach((src, i) => {
      loader.load(src, tex => {
        /* Pas de mipmaps : pixelUV est une fonction en escalier, donc les
           dérivées explosent aux frontières des blocs. Avec les mipmaps le GPU
           y choisit un LOD grossier → contour sombre autour de chaque pixel.
           Filtrage linéaire simple + wrap clamp = échantillonnage propre. */
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        this.textures[i] = tex;
        /* Upload GPU immédiat → pas de freeze au premier rendu de cette image */
        this.renderer.initTexture(tex);
        if (!(window as any).__firstTexLogged) {
          (window as any).__firstTexLogged = true;
          (window as any).__trailDiag?.('1ère image téléchargée');
        }
      });
    });

    this.pool = Array.from({ length: poolSize }, (_, i) =>
      this._createMesh(i % imgSrcs.length),
    );

    this._resize();
    /* Pré-compile le shader GLSL maintenant (sinon il se compile au 1er mesh
       affiché → micro-hoquet sur la première image de la traînée). */
    this.renderer.compile(this.scene, this.camera);
    new ResizeObserver(() => this._resize()).observe(hero);
    this._startRenderLoop();
  }

  domToThree(x: number, y: number): THREE.Vector2 {
    return new THREE.Vector2(x - this.heroW / 2, -(y - this.heroH / 2));
  }

  acquire(texIdx: number, size: number): TrailMesh {
    /* Image demandée pas encore téléchargée (réseau) → on prend une image DÉJÀ
       chargée, en CYCLANT parmi elles : variété garantie, jamais la même en
       boucle, et zéro case vide. Dès que tout est chargé, ce bloc ne sert plus. */
    if (!this.textures[texIdx]) {
      const loaded: number[] = [];
      for (let i = 0; i < this.textures.length; i++) if (this.textures[i]) loaded.push(i);
      if (loaded.length) texIdx = loaded[this._fallbackTick++ % loaded.length];
    }

    const free = (p: TrailMesh) => p.mat.uniforms.u_opacity.value < 0.01;

    /* Priorité : (1) mesh libre avec la bonne texture, (2) n'importe quel mesh
       libre, (3) le plus ancien (LRU). On ne renvoie JAMAIS null : un spawn
       sauté = un trou visible dans la traînée. Le plus ancien est aussi le plus
       avancé dans son fondu/réduction → le recycler est quasi invisible. */
    const e = this.pool.find(p => free(p) && p.texIdx === texIdx)
           ?? this.pool.find(free)
           ?? this.pool.reduce((oldest, p) => (p.lastUsed < oldest.lastUsed ? p : oldest));

    e.lastUsed = ++this._tick;

    if (e.texIdx !== texIdx && this.textures[texIdx]) {
      e.texIdx = texIdx;
      const tex = this.textures[texIdx]!;
      e.mat.uniforms.u_tex.value = tex;
      const img = tex.image as HTMLImageElement | undefined;
      e.mat.uniforms.u_resolution.value.set(img?.naturalWidth ?? size, img?.naturalHeight ?? size);
    }

    e.mat.uniforms.u_opacity.value     = 0;
    e.mat.uniforms.u_pixelFactor.value = 0;
    e.mat.uniforms.u_dissolve.value    = 0;
    e.mat.uniforms.u_blur.value        = 0;
    e.mesh.scale.set(size, size, 1);
    e.mesh.visible = true;
    return e;
  }

  hide(e: TrailMesh) {
    e.mesh.visible = false;
    e.mat.uniforms.u_opacity.value = 0;
  }

  resetAll() {
    this.pool.forEach(e => {
        e.mat.uniforms.u_opacity.value     = 0;
      e.mat.uniforms.u_pixelFactor.value = 0;
      e.mat.uniforms.u_dissolve.value    = 0;
      e.mat.uniforms.u_blur.value        = 0;
      e.mesh.visible = false;
    });
  }

  get entries() { return this.pool; }

  private _createMesh(texIdx: number): TrailMesh {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthTest:      false,
      depthWrite:     false,
      uniforms: {
        u_tex:         { value: this.textures[texIdx] ?? new THREE.Texture() },
        u_pixelFactor: { value: 0 },
        u_dissolve:    { value: 0 },
        u_blur:        { value: 0 },
        u_opacity:     { value: 0 },
        u_resolution:  { value: new THREE.Vector2(150, 150) },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible     = false;
    mesh.renderOrder = 0;
    this.scene.add(mesh);
    return { mesh, mat, texIdx, lastUsed: 0 };
  }

  private _resize() {
    const r = this.hero.getBoundingClientRect();
    this.heroW = r.width; this.heroH = r.height;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.left = -r.width/2; this.camera.right  =  r.width/2;
    this.camera.top  =  r.height/2; this.camera.bottom = -r.height/2;
    this.camera.updateProjectionMatrix();
  }

  private _startRenderLoop() {
    const loop = () => { this.renderer.render(this.scene, this.camera); this.rafId = requestAnimationFrame(loop); };
    this.rafId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.textures.forEach(t => t?.dispose());
    this.pool.forEach(({ mesh, mat }) => { mesh.geometry.dispose(); mat.dispose(); });
    this.renderer.dispose(); this.canvas.remove();
  }
}
