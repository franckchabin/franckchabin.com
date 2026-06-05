/* ================================================================
   PIXEL TRAIL — WebGL natif (SANS Three.js)
   Même effet exact : pixelisation progressive + dissolution
   extérieur→centre + flou gaussien GLSL.
   Aucune librairie → démarrage instantané (rien à télécharger).
   API identique à l'ancienne version pour rester compatible avec
   trail.ts (GSAP anime mesh.position / mesh.scale / mat.uniforms.*).
   ================================================================ */

const VERT = /* glsl */`
  attribute vec2 a_corner;       // coin du quad : -0.5 .. 0.5
  uniform   vec2 u_center;       // centre du quad, px, origine au centre, y vers le haut
  uniform   vec2 u_scale;        // taille du quad en px
  uniform   vec2 u_halfView;     // (largeur/2, hauteur/2) du hero en px
  varying   vec2 vUv;
  void main() {
    vUv = a_corner + 0.5;
    vec2 world = u_center + a_corner * u_scale;
    gl_Position = vec4(world / u_halfView, 0.0, 1.0);
  }
`;

/* ── Fragment shader — IDENTIQUE à la version Three.js ───────────── */
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

    /* ── Dissolution extérieur → centre ── */
    if (u_dissolve > 0.001) {
      float dist = clamp(length(pixelUV - 0.5) * 1.4142, 0.0, 1.0);
      float h    = hash21(blockIdx);
      float threshold = clamp((1.0 - dist) * 0.78 + h * 0.22, 0.02, 0.98);
      color.a *= step(u_dissolve, threshold);
    }

    gl_FragColor = vec4(color.rgb, color.a * u_opacity);
  }
`;

/* ── Petit vecteur tweenable par GSAP (remplace THREE.Vector3) ── */
class V3 {
  x = 0; y = 0; z = 0;
  set(x: number, y: number, z = 0) { this.x = x; this.y = y; this.z = z; return this; }
}

interface GLTexture { tex: WebGLTexture; w: number; h: number; }

export interface TrailMesh {
  mesh: { position: V3; scale: V3; visible: boolean; renderOrder: number };
  mat:  { uniforms: {
    u_opacity:     { value: number };
    u_pixelFactor: { value: number };
    u_dissolve:    { value: number };
    u_blur:        { value: number };
  } };
  texIdx:   number;
  lastUsed: number;
}

export class PixelTrail {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private quadBuf: WebGLBuffer;
  private loc: Record<string, any> = {};
  private textures: (GLTexture | null)[];
  private pool: TrailMesh[];
  private rafId: number | null = null;
  private _tick = 0;          // horloge logique pour le LRU
  private _fallbackTick = 0;  // cycle parmi les images chargées tant que tout n'est pas prêt
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

    const gl = this.canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: false, antialias: false,
      powerPreference: 'high-performance', depth: false, stencil: false,
    });
    if (!gl) throw new Error('WebGL non disponible');
    this.gl = gl;

    /* ── Programme ── */
    this.program = this._buildProgram(VERT, FRAG);
    gl.useProgram(this.program);
    this.loc.a_corner     = gl.getAttribLocation(this.program, 'a_corner');
    for (const u of ['u_center','u_scale','u_halfView','u_tex','u_pixelFactor','u_dissolve','u_blur','u_opacity','u_resolution']) {
      this.loc[u] = gl.getUniformLocation(this.program, u);
    }

    /* ── Quad unitaire (triangle strip) ── */
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -0.5, -0.5,  0.5, -0.5,  -0.5, 0.5,  0.5, 0.5,
    ]), gl.STATIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    /* ── Textures (chargement asynchrone) ── */
    this.textures = new Array(imgSrcs.length).fill(null);
    imgSrcs.forEach((src, i) => this._loadTexture(src, i));

    /* ── Pool ── */
    this.pool = Array.from({ length: poolSize }, (_, i) => this._createMesh(i % imgSrcs.length));

    this._resize();
    new ResizeObserver(() => this._resize()).observe(hero);
    this._startRenderLoop();
  }

  /* Coordonnées DOM → repère centré, y vers le haut (px) */
  domToThree(x: number, y: number): { x: number; y: number } {
    return { x: x - this.heroW / 2, y: -(y - this.heroH / 2) };
  }

  acquire(texIdx: number, size: number): TrailMesh {
    /* Image demandée pas encore téléchargée → on prend une image DÉJÀ chargée
       en cyclant parmi elles (variété, jamais la même en boucle, zéro vide). */
    if (!this.textures[texIdx]) {
      const loaded: number[] = [];
      for (let i = 0; i < this.textures.length; i++) if (this.textures[i]) loaded.push(i);
      if (loaded.length) texIdx = loaded[this._fallbackTick++ % loaded.length];
    }

    const free = (p: TrailMesh) => p.mat.uniforms.u_opacity.value < 0.01;
    const e = this.pool.find(p => free(p) && p.texIdx === texIdx)
           ?? this.pool.find(free)
           ?? this.pool.reduce((oldest, p) => (p.lastUsed < oldest.lastUsed ? p : oldest));

    e.lastUsed = ++this._tick;
    if (this.textures[texIdx]) e.texIdx = texIdx;

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

  /* ── Interne ───────────────────────────────────────────────── */

  private _createMesh(texIdx: number): TrailMesh {
    return {
      mesh: { position: new V3(), scale: new V3().set(1, 1, 1), visible: false, renderOrder: 0 },
      mat: { uniforms: {
        u_opacity:     { value: 0 },
        u_pixelFactor: { value: 0 },
        u_dissolve:    { value: 0 },
        u_blur:        { value: 0 },
      } },
      texIdx,
      lastUsed: 0,
    };
  }

  private _loadTexture(src: string, i: number) {
    const img = new Image();
    img.onload = () => {
      const gl = this.gl;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      /* Pas de mipmaps + LINEAR + CLAMP → aucun contour autour des pixels */
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures[i] = { tex, w: img.naturalWidth, h: img.naturalHeight };
      if (!(window as any).__firstTexLogged) {
        (window as any).__firstTexLogged = true;
        (window as any).__trailDiag?.('1ère image téléchargée');
      }
    };
    img.src = src;
  }

  private _resize() {
    const r = this.hero.getBoundingClientRect();
    this.heroW = r.width; this.heroH = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width  = Math.max(1, Math.round(r.width  * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  private _render() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.heroW < 1 || this.heroH < 1) return;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(this.loc.a_corner);
    gl.vertexAttribPointer(this.loc.a_corner, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.loc.u_halfView, this.heroW / 2, this.heroH / 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.loc.u_tex, 0);

    /* Ne dessiner que les meshes visibles dont la texture est chargée,
       dans l'ordre de renderOrder (les plus récents au-dessus). */
    const visible = this.pool.filter(p =>
      p.mesh.visible && p.mat.uniforms.u_opacity.value > 0.001 && this.textures[p.texIdx]);
    visible.sort((a, b) => a.mesh.renderOrder - b.mesh.renderOrder);

    for (const m of visible) {
      const t = this.textures[m.texIdx]!;
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform2f(this.loc.u_resolution, t.w, t.h);
      gl.uniform2f(this.loc.u_center, m.mesh.position.x, m.mesh.position.y);
      gl.uniform2f(this.loc.u_scale,  m.mesh.scale.x,    m.mesh.scale.y);
      gl.uniform1f(this.loc.u_pixelFactor, m.mat.uniforms.u_pixelFactor.value);
      gl.uniform1f(this.loc.u_dissolve,    m.mat.uniforms.u_dissolve.value);
      gl.uniform1f(this.loc.u_blur,        m.mat.uniforms.u_blur.value);
      gl.uniform1f(this.loc.u_opacity,     m.mat.uniforms.u_opacity.value);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  private _startRenderLoop() {
    const loop = () => { this._render(); this.rafId = requestAnimationFrame(loop); };
    this.rafId = requestAnimationFrame(loop);
  }

  private _buildProgram(vsrc: string, fsrc: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('Shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Program: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const gl = this.gl;
    this.textures.forEach(t => t && gl.deleteTexture(t.tex));
    gl.deleteBuffer(this.quadBuf);
    gl.deleteProgram(this.program);
    this.canvas.remove();
  }
}
