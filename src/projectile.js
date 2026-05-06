import * as THREE from 'three';
import { Body, Sphere, Vec3 } from 'physics3d';
import { BALL, LAUNCHER } from './constants.js';

const BALL_GEOM = new THREE.SphereGeometry(BALL.radius, 24, 16);
const BALL_MAT  = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1 });

// kind === 'ball' for v1. Hook: future projectiles add new branches here.
export function createProjectile(kind, scene, world, target) {
  if (kind !== 'ball') throw new Error(`Unknown projectile: ${kind}`);

  const mesh = new THREE.Mesh(BALL_GEOM, BALL_MAT);
  mesh.position.set(LAUNCHER.x, LAUNCHER.y, LAUNCHER.z);
  scene.add(mesh);

  const body = new Body({
    shape: new Sphere(BALL.radius),
    position: new Vec3(LAUNCHER.x, LAUNCHER.y, LAUNCHER.z),
    mass: BALL.mass,
    restitution: BALL.restitution,
    friction: BALL.friction,
    userData: { kind: 'ball', mesh },
  });

  const dir = new THREE.Vector3(target.x - LAUNCHER.x, target.y - LAUNCHER.y, target.z - LAUNCHER.z).normalize();
  body.setVelocity(dir.x * BALL.launchSpeed, dir.y * BALL.launchSpeed, dir.z * BALL.launchSpeed);
  world.addBody(body);
  return body;
}
