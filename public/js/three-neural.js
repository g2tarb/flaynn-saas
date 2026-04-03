/**
 * Fond type réseau neuronal — Three.js (tier élevé uniquement, chargé à la demande)
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export class FlaynnNeuralBackground {
  constructor(canvas, config) {
    const count = Math.min(config?.particles ?? 2500, 4000);
    this.clock = new THREE.Clock();
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.rafId = 0;
    this._onMouseMove = (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    this._onResize = () => this.#syncSize();

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
        stencil: false
      });
    } catch {
      canvas.classList.add('three-canvas--fallback');
      return;
    }
    if (!renderer.getContext()) {
      canvas.classList.add('three-canvas--fallback');
      return;
    }

    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.z = 30;

    const positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color('#8b5cf6'),
      new THREE.Color('#6366f1'),
      new THREE.Color('#3b82f6'),
      new THREE.Color('#10b981')
    ];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 50;
      positions[i3 + 1] = (Math.random() - 0.5) * 30;
      positions[i3 + 2] = (Math.random() - 0.5) * 20;
      this.velocities[i3] = (Math.random() - 0.5) * 0.005;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.005;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.002;
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);

    window.addEventListener('mousemove', this._onMouseMove, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });

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

  #syncSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  #frame() {
    const t = this.clock.getElapsedTime();
    const pos = this.particles.geometry.attributes.position.array;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      pos[i3] += this.velocities[i3] + Math.sin(t * 0.3 + i) * 0.002;
      pos[i3 + 1] += this.velocities[i3 + 1] + Math.cos(t * 0.2 + i) * 0.002;
      pos[i3 + 2] += this.velocities[i3 + 2];
      if (Math.abs(pos[i3]) > 25) this.velocities[i3] *= -1;
      if (Math.abs(pos[i3 + 1]) > 15) this.velocities[i3 + 1] *= -1;
      if (Math.abs(pos[i3 + 2]) > 10) this.velocities[i3 + 2] *= -1;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;

    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;
    this.scene.rotation.y = this.mouse.x * 0.08;
    this.scene.rotation.x = this.mouse.y * 0.04;

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this.rafId);
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
    }
    this.renderer?.dispose();
    document.documentElement.classList.remove('has-three-bg');
  }
}

