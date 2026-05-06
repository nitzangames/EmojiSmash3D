import * as THREE from 'three';
import { CAMERA_LANDSCAPE, CAMERA_PORTRAIT } from './constants.js';

export function createCamera(width, height) {
  const cfg = (width >= height) ? CAMERA_LANDSCAPE : CAMERA_PORTRAIT;
  const cam = new THREE.PerspectiveCamera(cfg.fov, width / height, 0.1, 100);
  cam.position.set(...cfg.pos);
  cam.lookAt(...cfg.lookAt);
  return cam;
}

export function reframeCamera(cam, width, height) {
  const cfg = (width >= height) ? CAMERA_LANDSCAPE : CAMERA_PORTRAIT;
  cam.fov = cfg.fov;
  cam.aspect = width / height;
  cam.position.set(...cfg.pos);
  cam.lookAt(...cfg.lookAt);
  cam.updateProjectionMatrix();
}
