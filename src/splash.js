import * as THREE from 'three';

const PARTICLE_GEOM = new THREE.SphereGeometry(0.09, 6, 4);
const RING_GEOM     = new THREE.RingGeometry(0.5, 0.6, 24);

const PARTICLE_COLOR = 0xc4e7ff;
const RING_COLOR     = 0xdff2ff;

// One splash = a small expanding ring on the water surface plus a burst of
// short-lived droplets following ballistic arcs. Lifetime ~1s.
export class Splash {
  constructor(scene, x, y, z) {
    this.scene = scene;
    this.particles = [];
    this.age = 0;

    this.ringMat = new THREE.MeshBasicMaterial({
      color: RING_COLOR,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(RING_GEOM, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    // Raised above the wave crest (~0.3 above water rest) so the ring is
    // never partially behind the semi-transparent water surface.
    this.ring.position.set(x, y + 0.35, z);
    this.ring.scale.setScalar(0.3);
    this.ring.renderOrder = 2;
    scene.add(this.ring);

    const N = 12;
    for (let i = 0; i < N; i++) {
      const angle   = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const outward = 1.5 + Math.random() * 2.0;
      const up      = 3.0 + Math.random() * 3.5;
      const mat = new THREE.MeshBasicMaterial({
        color: PARTICLE_COLOR,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(PARTICLE_GEOM, mat);
      mesh.position.set(x, y + 0.05, z);
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.particles.push({
        mesh, mat,
        vx: Math.cos(angle) * outward,
        vy: up,
        vz: Math.sin(angle) * outward,
      });
    }
  }

  // Returns true while still alive. waterY is the splash plane y.
  update(dt, waterY) {
    this.age += dt;

    const t = Math.min(this.age, 1);
    const s = 0.3 + t * 4.5;
    this.ring.scale.set(s, s, s);
    this.ringMat.opacity = 0.85 * (1 - t);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy += -9.81 * dt;
      // Particles fade as they age so they don't pop out.
      p.mat.opacity = Math.max(0, 0.95 - this.age * 0.7);
      if (p.mesh.position.y < waterY || p.mat.opacity <= 0) {
        this.scene.remove(p.mesh);
        p.mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    if (this.age > 1 && this.particles.length === 0) {
      this.scene.remove(this.ring);
      this.ringMat.dispose();
      return false;
    }
    return true;
  }

  // Force-cleanup all meshes and materials. Used when tearing down a session
  // before the splash naturally finishes.
  dispose() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    this.particles.length = 0;
    if (this.ring.parent) this.scene.remove(this.ring);
    this.ringMat.dispose();
  }
}
