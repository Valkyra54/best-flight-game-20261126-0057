// DELTA POST — renderer. One job: own the WebGLRenderer and the resize
// contract. Tone mapping, pixel-ratio cap and the canvas live here; the
// scene and the loop live in main.js.

import * as THREE from 'three';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Pixel-ratio cap: crisp on hidpi, bounded fill-rate on weak GPUs
  // (threejs-perf / threejs-scene-setup pattern).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function resizeRenderer(renderer, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function renderFrame(renderer, scene, camera) {
  renderer.render(scene, camera);
}

export function makeCamera() {
  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    12000,
  );
  camera.position.set(0, 125, -1015);
  return camera;
}
