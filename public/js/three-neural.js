/**
 * Fond Étoiles (Investisseurs & Projets) — Three.js
 * Rendu optimisé via Custom ShaderMaterial (God-Tier Level)
 *
 * Métaphore visuelle :
 *  - 80% des points → masse de projets (violet/bleu, petits, discrets)
 *  - 15% des points → bons projets (émeraude, luminosité moyenne)
 *  - 5%  des points → "Superstars" à fort potentiel (ambre, grandes, scintillantes)
 *
 * Animation idle  : scintillement 100% GPU via uTime + sin().
 * Warp transition : uTransitionProgress 0→1 anime un effet hyperespace côté GPU.
 *   — Vertex  : déplacement Z (rush vers caméra) + explosion de taille.
 *   — Fragment : étirement oval + virement couleur vers ambre/blanc.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/* ─── GLSL — Vertex Shader ──────────────────────────────────────────────── */
const vertexShader = `
  attribute float size;
  attribute float phase;
  attribute float brightness;

  varying vec3  vColor;
  varying float vPhase;
  varying float vBrightness;
  varying float vTransition;

  uniform float uTime;
  uniform float uTransitionProgress;

  void main() {
    vColor      = color;
    vPhase      = phase;
    vBrightness = brightness;
    vTransition = uTransitionProgress;

    vec3 pos = position;

    /* Warp : déplace chaque particule vers la caméra (Z+) selon sa luminosité.
       Les Superstars (brightness > 1) prennent de l'avance — elles "jaillissent"
       en premier, comme des projets à fort potentiel se démarquant du lot.
       Ease quadratique (progress²) pour une accélération naturelle. */
    float ease     = uTransitionProgress * uTransitionProgress;
    float rushZ    = ease * vBrightness * 55.0;
    pos.z         += rushZ;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    /* Explosion de taille : les particules gonflent pour remplir l'écran */
    float warpScale = 1.0 + ease * 14.0 * vBrightness;
    gl_PointSize    = size * warpScale * (300.0 / -mvPosition.z);
    gl_Position     = projectionMatrix * mvPosition;
  }
`;

/* ─── GLSL — Fragment Shader ────────────────────────────────────────────── */
const fragmentShader = `
  varying vec3  vColor;
  varying float vPhase;
  varying float vBrightness;
  varying float vTransition;

  uniform float uTime;

  void main() {
    /* Étirement oval pendant le warp :
       En comprimant la coordonnée Y, le disque devient une ellipse verticale
       qui simule la traînée d'une particule se ruant vers la caméra. */
    vec2  uv      = gl_PointCoord - 0.5;
    float stretch = 1.0 - vTransition * 0.72;             /* 1.0 → 0.28 */
    float d       = length(vec2(uv.x, uv.y * max(stretch, 0.12)));

    float strength = 0.05 / d - 0.1;
    if (strength < 0.0) discard;

    /* Scintillement idle (atténué en warp pour ne pas polluer les traînées) */
    float twinkle   = sin(uTime * (1.0 + vBrightness) + vPhase) * 0.5 + 0.5;
    float idleTwink = twinkle * (1.0 - vTransition);

    /* Alpha : discret au repos, explosif en warp */
    float idleAlpha = strength * (0.2 + idleTwink * vBrightness * 0.8);
    float warpAlpha = strength * (0.6 + vBrightness * 2.2);
    float alpha     = mix(idleAlpha, warpAlpha, vTransition);

    /* Couleur : vire vers ambre-blanc en warp
       vec3(1.0, 0.85, 0.35) ≈ ambre clair, proche de --accent-amber boosté */
    vec3 warpTint = mix(vColor, vec3(1.0, 0.85, 0.35), vTransition * 0.75);

    gl_FragColor = vec4(warpTint, alpha);
  }
`;

/* ─── Classe principale ─────────────────────────────────────────────────── */
export class FlaynnNeuralBackground {
  /**
   * @param {HTMLCanvasElement}      canvas
   * @param {{ particles?: number }} config
   */
  constructor(canvas, config) {
    const count = Math.min(config?.particles ?? 1500, 3000);

    this.clock  = new THREE.Clock();
    this.mouse  = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.rafId  = 0;
    this._transitioning = false;

    this._onMouseMove = (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth  - 0.5) * 2;
      this.mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    this._onOrient = (e) => {
      if (e.gamma == null) return;
      this.mouse.targetX =  e.gamma  / 45;
      this.mouse.targetY = (e.beta - 45) / 45;
    };
    this._onResize = () => this.#syncSize();

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
        stencil: false,
        depth:   false,
      });
    } catch {
      canvas.classList.add('three-canvas--fallback');
      return;
    }

    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene  = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#030407', 0.015);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200); /* far étendu pour le warp */
    this.camera.position.z = 40;

    this.#createStarfield(count);

    window.addEventListener('mousemove',         this._onMouseMove, { passive: true });
    window.addEventListener('deviceorientation', this._onOrient,    { passive: true });
    window.addEventListener('resize',            this._onResize,    { passive: true });

    this.#syncSize();
    document.documentElement.classList.add('has-three-bg');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      if (!document.hidden) this.#frame();
    };
    loop();
  }

  /* ── Construction du champ d'étoiles ────────────────────────────────── */
  #createStarfield(count) {
    const positions    = new Float32Array(count * 3);
    const colors       = new Float32Array(count * 3);
    const sizes        = new Float32Array(count);
    const phases       = new Float32Array(count);
    const brightnesses = new Float32Array(count);

    const cViolet  = new THREE.Color('#8b5cf6');
    const cBlue    = new THREE.Color('#3b82f6');
    const cEmerald = new THREE.Color('#10b981');
    const cAmber   = new THREE.Color('#f59e0b');

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      positions[i3]     = (Math.random() - 0.5) * 80;
      positions[i3 + 1] = (Math.random() - 0.5) * 50;
      positions[i3 + 2] = (Math.random() - 0.5) * 60;

      const r = Math.random();
      let color, brightness, size;

      if (r > 0.95) {
        color      = cAmber;
        brightness = 1.5 + Math.random();
        size       = 3.0 + Math.random() * 2.0;
      } else if (r > 0.80) {
        color      = cEmerald;
        brightness = 0.8 + Math.random() * 0.5;
        size       = 2.0 + Math.random();
      } else {
        color      = Math.random() > 0.5 ? cViolet : cBlue;
        brightness = 0.2 + Math.random() * 0.3;
        size       = 0.8 + Math.random();
      }

      colors[i3]      = color.r;
      colors[i3 + 1]  = color.g;
      colors[i3 + 2]  = color.b;
      sizes[i]        = size;
      phases[i]       = Math.random() * Math.PI * 2;
      brightnesses[i] = brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',   new THREE.BufferAttribute(positions,    3));
    geometry.setAttribute('color',      new THREE.BufferAttribute(colors,       3));
    geometry.setAttribute('size',       new THREE.BufferAttribute(sizes,        1));
    geometry.setAttribute('phase',      new THREE.BufferAttribute(phases,       1));
    geometry.setAttribute('brightness', new THREE.BufferAttribute(brightnesses, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:               { value: 0 },
        uTransitionProgress: { value: 0 },  /* 0 = idle, 1 = warp complet */
      },
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
      vertexColors: true,
    });

    this.particles = new THREE.Points(geometry, this.material);
    this.particles.rotation.x = -0.15;
    this.scene.add(this.particles);
  }

  /* ── Synchronisation renderer / caméra ──────────────────────────────── */
  #syncSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /* ── Frame ~60 fps ───────────────────────────────────────────────────── */
  #frame() {
    const t = this.clock.getElapsedTime();

    this.material.uniforms.uTime.value = t * 0.5;

    /* Rotation : ralentie pendant le warp (le tunnel absorbe toute l'attention) */
    const tp = this.material.uniforms.uTransitionProgress.value;
    this.particles.rotation.y = t * 0.018 * (1 - tp * 0.8);

    /* Parallaxe souris — désactivée pendant le warp pour ne pas perturber l'effet */
    if (tp < 0.05) {
      this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
      this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;
      this.camera.position.x =  this.mouse.x * 2.0;
      this.camera.position.y = -this.mouse.y * 2.0;
    }
    this.camera.lookAt(this.scene.position);

    this.renderer.render(this.scene, this.camera);
  }

  /* ── API publique : transition warp ─────────────────────────────────── */
  /**
   * Déclenche l'effet hyperespace puis navigue vers targetUrl.
   * Utilise GSAP si disponible (window.gsap), sinon RAF-based fallback.
   *
   * @param {string} targetUrl
   * @param {number} [duration=0.8] - secondes
   */
  triggerWarpTransition(targetUrl, duration = 0.8) {
    if (this._transitioning) return;
    this._transitioning = true;

    const uniform = this.material.uniforms.uTransitionProgress;
    const onComplete = () => { window.location.href = targetUrl; };

    /* GSAP path (disponible après bootDeferred pour tier >= 2) */
    if (typeof window.gsap !== 'undefined') {
      window.gsap.to(uniform, {
        value:    1.0,
        duration,
        ease:     'power3.in',
        onComplete,
      });
      return;
    }

    /* Fallback RAF : easing cubique-in manuel sans dépendance */
    const startTime = performance.now();
    const durationMs = duration * 1000;

    const tick = (now) => {
      const raw      = Math.min((now - startTime) / durationMs, 1);
      /* cubic ease-in : t³ */
      uniform.value  = raw * raw * raw;
      if (raw < 1) {
        requestAnimationFrame(tick);
      } else {
        onComplete();
      }
    };
    requestAnimationFrame(tick);
  }

  /* ── Nettoyage propre ────────────────────────────────────────────────── */
  destroy() {
    window.removeEventListener('mousemove',         this._onMouseMove);
    window.removeEventListener('deviceorientation', this._onOrient);
    window.removeEventListener('resize',            this._onResize);
    cancelAnimationFrame(this.rafId);
    this.particles?.geometry.dispose();
    this.material?.dispose();
    this.renderer?.dispose();
    document.documentElement.classList.remove('has-three-bg');
  }
}
