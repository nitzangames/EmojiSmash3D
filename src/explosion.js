import * as THREE from 'three';

const SPHERE_GEOM = new THREE.SphereGeometry(1, 16, 12);

// Brief expanding-fireball visual that mirrors a bomb's blast radius. Self-
// disposes its mesh and material when its lifetime elapses.
export class Explosion {
  constructor(scene, x, y, z, targetRadius) {
    this.scene = scene;
    this.targetRadius = targetRadius;
    this.age = 0;
    this.lifetime = 0.45;

    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffd060,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(SPHERE_GEOM, this.mat);
    this.mesh.position.set(x, y, z);
    this.mesh.scale.setScalar(0.2);
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  update(dt) {
    this.age += dt;
    const t = this.age / this.lifetime;
    if (t >= 1) {
      this.scene.remove(this.mesh);
      this.mat.dispose();
      return false;
    }
    const r = 0.2 + this.targetRadius * t;
    this.mesh.scale.setScalar(r);
    this.mat.opacity = 0.95 * (1 - t);
    // Yellow → orange → red as it expands.
    this.mat.color.setRGB(1.0, 0.82 - t * 0.55, 0.25 - t * 0.2);
    return true;
  }

  dispose() {
    if (this.mesh.parent) this.scene.remove(this.mesh);
    this.mat.dispose();
  }
}
