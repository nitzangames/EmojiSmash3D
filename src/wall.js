import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WALL, BLOCK, PLATFORM } from './constants.js';
import { World, Body, Box, Vec3, syncMesh } from 'physics3d';

const SHARED_GEOMETRY = new RoundedBoxGeometry(WALL.blockSize, WALL.blockSize, WALL.blockSize, 4, BLOCK.bevel);

// Compute world position of block at grid (col, row).
// row 0 is the bottom row; col 0 is the leftmost.
export function gridToWorld(col, row) {
  return [
    WALL.originX + col,
    WALL.originY + row,
    WALL.originZ,
  ];
}

// tiles[muralRow][col] is the source tile; muralRow 0 is image-top.
// We map muralRow → world row so image-top maps to world-top: worldRow = 7 - muralRow.
export function buildVisualWall(tiles) {
  const meshes = [];
  for (let row = 0; row < WALL.rows; row++) {
    for (let col = 0; col < WALL.cols; col++) {
      const muralRow = 7 - row;
      const tex = tiles[muralRow][col];
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.25,
        roughness: 0.7,
      });
      const m = new THREE.Mesh(SHARED_GEOMETRY, mat);
      m.position.set(...gridToWorld(col, row));
      m.userData = { col, row };
      meshes.push(m);
    }
  }
  return meshes;
}

export function createWorld() {
  return new World({ gravity: new Vec3(0, -9.81, 0) });
}

export function addPlatformBody(world) {
  const body = new Body({
    shape: new Box(PLATFORM.width, PLATFORM.height, PLATFORM.depth),
    position: new Vec3(0, -PLATFORM.height / 2, 0),
    isStatic: true,
    friction: 0.7,
    userData: { kind: 'platform' },
  });
  world.addBody(body);
  return body;
}

export function buildPhysicalWall(world, meshes) {
  const bodies = [];
  for (const m of meshes) {
    const [x, y, z] = m.position.toArray();
    const body = new Body({
      shape: new Box(WALL.blockSize, WALL.blockSize, WALL.blockSize),
      position: new Vec3(x, y, z),
      mass: BLOCK.mass,
      restitution: BLOCK.restitution,
      friction: BLOCK.friction,
      linearDamping: BLOCK.linearDamping,
      userData: { kind: 'block', col: m.userData.col, row: m.userData.row, mesh: m },
    });
    world.addBody(body);
    bodies.push(body);
  }
  return bodies;
}

export function syncWallMeshes(bodies) {
  for (const b of bodies) {
    if (b.userData?.mesh) syncMesh(b, b.userData.mesh);
  }
}
