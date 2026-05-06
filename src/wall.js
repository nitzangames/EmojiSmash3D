import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WALL, BLOCK } from './constants.js';

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
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const m = new THREE.Mesh(SHARED_GEOMETRY, mat);
      m.position.set(...gridToWorld(col, row));
      m.userData = { col, row };
      meshes.push(m);
    }
  }
  return meshes;
}
