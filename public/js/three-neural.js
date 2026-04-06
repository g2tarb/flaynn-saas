/**
 * Flaynn Starfield — Canvas 2D cinematic background
 *
 * Replaces the Three.js FBM aurora shader with a multi-layer starfield
 * + organic nebula glows. Pure Canvas 2D — no external dependency.
 *
 * - 3 depth layers (far / mid / near) with seeded star placement
 * - Z-parallax on scroll via GSAP ScrollTrigger (fallback: passive scroll)
 * - Organic nebula glows with breathing animation + inverse mouse tracking
 * - Warp transition (hyperspace streaks) for navigation — same API
 *
 * Exported class: FlaynnNeuralBackground (same name for drop-in compat)
 * Used by: script.js → bootDeferred() → window.globalBg
 */

/* ── Seeded PRNG (mulberry32) — deterministic starfield across sessions ── */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Star layer definitions ─────────────────────────────────────────────── */
const LAYER_DEFS = [
  // Layer 0 — Far (background dust)
  { count: 140, rMin: 0.3, rMax: 0.7, aMin: 0.10, aMax: 0.28,
    twinkleMin: 0.2, twinkleMax: 0.7, speedZ: 0.12, mousePx: 0.006, halos: 0 },
  // Layer 1 — Mid
  { count: 80,  rMin: 0.6, rMax: 1.2, aMin: 0.18, aMax: 0.40,
    twinkleMin: 0.3, twinkleMax: 1.0, speedZ: 0.30, mousePx: 0.018, halos: 0 },
  // Layer 2 — Near (foreground, includes 5 halo stars)
  { count: 30,  rMin: 1.0, rMax: 2.2, aMin: 0.40, aMax: 0.75,
    twinkleMin: 0.5, twinkleMax: 1.5, speedZ: 0.55, mousePx: 0.035, halos: 5 },
];

function generateLayers(seed) {
  const rand = mulberry32(seed);
  return LAYER_DEFS.map((def) => {
    const stars = [];
    for (let i = 0; i < def.count; i++) {
      stars.push({
        x: rand(),
        y: rand(),
        r: def.rMin + rand() * (def.rMax - def.rMin),
        a: def.aMin + rand() * (def.aMax - def.aMin),
        tw: def.twinkleMin + rand() * (def.twinkleMax - def.twinkleMin),
        tp: rand() * Math.PI * 2,
        halo: i < def.halos,
      });
    }
    return { stars, speedZ: def.speedZ, mousePx: def.mousePx };
  });
}

/* ── Main class ─────────────────────────────────────────────────────────── */

export class FlaynnNeuralBackground {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ particles?: number }} [_config] — kept for API compat, ignored
   */
  constructor(canvas, _config) {
    void _config;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.classList.add('three-canvas--fallback');
      return;
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.w = 0;
    this.h = 0;
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.time = 0;
    this.rafId = 0;
    this._transitioning = false;
    this.warpProgress = 0;
    this.scrollProgress = 0;
    this._gsapConnected = false;

    // Mouse (lerped)
    this.mx = 0;
    this.my = 0;
    this._mtx = 0;
    this._mty = 0;

    // Stars
    this.layers = generateLayers(7734991);

    // ── Events ──
    this._onMM = (e) => {
      this._mtx = (e.clientX / window.innerWidth - 0.5) * 2;
      this._mty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    this._onOr = (e) => {
      if (e.gamma == null) return;
      this._mtx = (e.gamma / 45) * 2;
      this._mty = ((e.beta - 45) / 45) * 2;
    };
    this._onScroll = () => {
      if (this._gsapConnected) return; // GSAP drives scrollProgress
      const top = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      this.scrollProgress = max > 0 ? Math.min(top / max, 1) : 0;
    };
    this._onResize = () => this._syncSize();

    window.addEventListener('mousemove', this._onMM, { passive: true });
    window.addEventListener('deviceorientation', this._onOr, { passive: true });
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });

    this._syncSize();
    document.documentElement.classList.add('has-three-bg');

    // ── GSAP ScrollTrigger (async — may load after us) ──
    this._tryGsap();

    // ── Reduced motion: single frame then stop ──
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._frame(0);
      return;
    }

    // ── Render loop ──
    let prev = performance.now();
    const loop = (now) => {
      this.rafId = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      this.time += dt;
      this._frame(dt);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /* ── Resize ──────────────────────────────────────────────────────────── */

  _syncSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.w = w;
    this.h = h;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /* ── GSAP ScrollTrigger integration ──────────────────────────────────── */

  _tryGsap() {
    const connect = () => {
      const gsap = window.gsap;
      const ST = window.ScrollTrigger;
      if (!gsap || !ST) return false;
      gsap.registerPlugin(ST);
      gsap.to(this, {
        scrollProgress: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: document.documentElement,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1.5,
        },
      });
      this._gsapConnected = true;
      return true;
    };
    if (connect()) return;
    // Poll until GSAP loads (max 8s)
    let tries = 0;
    const id = setInterval(() => {
      if (connect() || ++tries > 16) clearInterval(id);
    }, 500);
  }

  /* ── Render pipeline ─────────────────────────────────────────────────── */

  _frame(dt) {
    const { ctx, w, h } = this;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    // Lerp mouse
    const lr = Math.min(dt * 2.5, 1) || 0.04;
    this.mx += (this._mtx - this.mx) * lr;
    this.my += (this._mty - this.my) * lr;

    const scroll = this.scrollProgress;
    const warp = this.warpProgress;

    this._drawNebulas(ctx, w, h, warp);
    this._drawStars(ctx, w, h, scroll, warp);

    // Warp white-out veil (last 30% of transition)
    if (warp > 0.7) {
      const veil = (warp - 0.7) / 0.3; // 0 → 1
      ctx.globalAlpha = veil * veil * 0.95;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  /* ── Nebula glows ────────────────────────────────────────────────────── */

  _drawNebulas(ctx, w, h, warp) {
    const t = this.time;
    const mx = this.mx;
    const my = this.my;

    // Breathing oscillators (very slow, out-of-phase)
    const b1 = Math.sin(t * 0.12) * 0.5 + 0.5;
    const b2 = Math.sin(t * 0.09 + 1.8) * 0.5 + 0.5;
    const b3 = Math.sin(t * 0.15 + 3.2) * 0.5 + 0.5;

    const dim = Math.max(w, h);

    // 1 — Violet glow (bottom-left)
    const vx = w * 0.15 - mx * 25;
    const vy = h * 0.82 + my * 25;
    const vr = dim * (0.52 + b1 * 0.06 + warp * 0.35);
    const va = 0.10 + b1 * 0.04 + warp * 0.18;
    const gv = ctx.createRadialGradient(vx, vy, 0, vx, vy, vr);
    gv.addColorStop(0, `rgba(123,45,142,${va})`);
    gv.addColorStop(0.55, `rgba(123,45,142,${va * 0.25})`);
    gv.addColorStop(1, 'rgba(123,45,142,0)');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, w, h);

    // 2 — Orange glow (top-right)
    const ox = w * 0.85 + mx * 18;
    const oy = h * 0.15 - my * 18;
    const or2 = dim * (0.38 + b2 * 0.05 + warp * 0.28);
    const oa = 0.05 + b2 * 0.02 + warp * 0.12;
    const go = ctx.createRadialGradient(ox, oy, 0, ox, oy, or2);
    go.addColorStop(0, `rgba(232,101,26,${oa})`);
    go.addColorStop(0.5, `rgba(232,101,26,${oa * 0.22})`);
    go.addColorStop(1, 'rgba(232,101,26,0)');
    ctx.fillStyle = go;
    ctx.fillRect(0, 0, w, h);

    // 3 — Rose glow (center-bottom, very subtle depth layer)
    const rx = w * 0.5 - mx * 12;
    const ry = h * 0.65 + my * 12;
    const rr = dim * (0.30 + b3 * 0.04 + warp * 0.2);
    const ra = 0.03 + b3 * 0.015 + warp * 0.08;
    const gr = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
    gr.addColorStop(0, `rgba(193,53,132,${ra})`);
    gr.addColorStop(0.6, `rgba(193,53,132,${ra * 0.18})`);
    gr.addColorStop(1, 'rgba(193,53,132,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  }

  /* ── Starfield ───────────────────────────────────────────────────────── */

  _drawStars(ctx, w, h, scroll, warp) {
    const t = this.time;
    const mx = this.mx;
    const my = this.my;
    const cx = w * 0.5;
    const cy = h * 0.5;

    for (const layer of this.layers) {
      const { stars, speedZ, mousePx } = layer;

      // Z-parallax: scale outward from center on scroll
      const zScale = 1 + scroll * speedZ;
      // Warp: explosive zoom
      const wScale = 1 + warp * warp * speedZ * 14;
      const totalScale = zScale * wScale;

      // Mouse parallax offset
      const px = -mx * mousePx * w;
      const py = -my * mousePx * h;

      // Subtle vertical drift on scroll (near layers drift more)
      const yDrift = -scroll * speedZ * h * 0.04;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        // Position: expand from center
        let sx = (s.x * w - cx) * totalScale + cx + px;
        let sy = (s.y * h - cy) * totalScale + cy + py + yDrift;

        // Wrap during normal scroll (not during warp — let them fly out)
        if (warp < 0.05) {
          sx = ((sx % w) + w) % w;
          sy = ((sy % h) + h) % h;
        }

        // Twinkle
        const twinkle = 0.7 + 0.3 * Math.sin(t * s.tw + s.tp);

        // Radius + alpha
        let r = s.r * totalScale;
        let alpha = s.a * twinkle;

        // Warp intensity
        alpha = Math.min(alpha + warp * 0.5, 1);
        r = Math.min(r + warp * speedZ * 4, 10);

        if (r < 0.1 || alpha < 0.01) continue;

        // Warp streak direction (from center outward)
        const dx = sx - cx;
        const dy = sy - cy;
        const warpStretch = warp * warp * speedZ * 3;

        ctx.globalAlpha = alpha;

        if (warpStretch > 0.08) {
          // ── Hyperspace streaks ──
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ndx = dx / dist;
          const ndy = dy / dist;
          const len = warpStretch * 20 * (0.5 + r);

          ctx.beginPath();
          ctx.moveTo(sx - ndx * len * 0.3, sy - ndy * len * 0.3);
          ctx.lineTo(sx + ndx * len, sy + ndy * len);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(r * 0.7, 0.5);
          ctx.lineCap = 'round';
          ctx.stroke();
        } else {
          // ── Halo stars ──
          if (s.halo) {
            const hr = r * 5;
            const hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, hr);
            hg.addColorStop(0, `rgba(255,255,255,${alpha * 0.6})`);
            hg.addColorStop(0.12, `rgba(255,255,255,${alpha * 0.12})`);
            hg.addColorStop(0.35, `rgba(255,255,255,${alpha * 0.03})`);
            hg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.arc(sx, sy, hr, 0, Math.PI * 2);
            ctx.fill();
          }

          // ── Core dot ──
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  /* ── Warp transition (same API as old Three.js version) ──────────────── */

  /**
   * @param {string} targetUrl
   * @param {number} [duration=0.85]
   */
  triggerWarpTransition(targetUrl, duration = 0.85) {
    if (this._transitioning) return;
    this._transitioning = true;

    const onComplete = () => {
      window.location.href = targetUrl;
    };

    if (typeof window.gsap !== 'undefined') {
      window.gsap.to(this, {
        warpProgress: 1,
        duration,
        ease: 'power3.in',
        onComplete,
      });
      return;
    }

    // RAF fallback
    const start = performance.now();
    const ms = duration * 1000;
    const tick = (now) => {
      const raw = Math.min((now - start) / ms, 1);
      this.warpProgress = raw * raw * raw; // power3.in approx
      if (raw < 1) {
        requestAnimationFrame(tick);
      } else {
        onComplete();
      }
    };
    requestAnimationFrame(tick);
  }

  /* ── Cleanup ─────────────────────────────────────────────────────────── */

  destroy() {
    window.removeEventListener('mousemove', this._onMM);
    window.removeEventListener('deviceorientation', this._onOr);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this.rafId);
    document.documentElement.classList.remove('has-three-bg');
  }
}
