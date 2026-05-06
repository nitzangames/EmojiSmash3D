import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const wallFrontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(-3));
//                                                              ^ d = -(-3) since plane equation: n·X + d = 0
const tmpHit = new THREE.Vector3();

// click position → world target. Returns null if neither blocks nor wall plane is hit.
export function computeTarget(clientX, clientY, canvas, camera, blockMeshes) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
  ndc.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  const hits = raycaster.intersectObjects(blockMeshes, false);
  if (hits.length > 0) return hits[0].point.clone();

  const t = raycaster.ray.intersectPlane(wallFrontPlane, tmpHit);
  if (!t) return null;
  // clamp to wall bounds
  return new THREE.Vector3(
    Math.max(-4, Math.min(4, t.x)),
    Math.max( 0, Math.min(8, t.y)),
    -3,
  );
}

export function attachInput(canvas, getCamera, getBlockMeshes, fire) {
  const onPointer = (e) => {
    e.preventDefault();
    const target = computeTarget(e.clientX, e.clientY, canvas, getCamera(), getBlockMeshes());
    if (target) fire(target);
  };
  canvas.addEventListener('pointerdown', onPointer);
  return () => canvas.removeEventListener('pointerdown', onPointer);
}
